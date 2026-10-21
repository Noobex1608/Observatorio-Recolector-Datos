<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Form;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FieldTrackingController extends Controller
{
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'form_id' => 'required|uuid|exists:forms,id',
            'zone_id' => 'required|uuid|exists:project_zones,id',
        ]);
        $user = $request->user();
        if ($user->rol !== User::ROLE_USER) {
            return response()->json(['message' => 'Solo un encuestador puede iniciar una jornada de campo.'], 403);
        }
        $form = Form::findOrFail($data['form_id']);
        if ($form->state !== 'DEPLOYED') {
            return response()->json(['message' => 'El formulario ya no está publicado. Solicita al líder que revise su estado.'], 403);
        }
        if (! $form->shares()->where('user_id', $user->id)->exists()) {
            return response()->json(['message' => 'No tienes asignado este formulario. Solicita acceso al líder del proyecto.'], 403);
        }
        if (! $form->zones()->whereKey($data['zone_id'])
            ->whereHas('assignedUsers', fn ($q) => $q->where('users.id', $user->id))->exists()) {
            return response()->json(['message' => 'La zona seleccionada no está asignada a tu cuenta en este formulario. Solicita al líder que delimite y asigne la zona.'], 403);
        }

        $active = DB::table('field_tracking_shifts')->where('form_id', $form->id)
            ->where('user_id', $user->id)->whereNull('ended_at')->first();
        if (! $active) {
            DB::table('field_tracking_shifts')->insert([
                'form_id' => $form->id, 'user_id' => $user->id,
                'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return response()->json(['active' => true]);
    }

    public function stop(Request $request): JsonResponse
    {
        $data = $request->validate(['form_id' => 'required|uuid|exists:forms,id']);
        DB::table('field_tracking_shifts')->where('form_id', $data['form_id'])
            ->where('user_id', $request->user()->id)->whereNull('ended_at')
            ->update(['ended_at' => now(), 'updated_at' => now()]);

        return response()->json(['active' => false]);
    }

    public function report(Request $request): JsonResponse
    {
        $data = $request->validate([
            'form_id' => 'required|uuid|exists:forms,id',
            'zone_id' => 'required|uuid|exists:project_zones,id',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'accuracy_meters' => 'nullable|numeric|min:0|max:10000',
            'recorded_at' => 'required|date|after:-1 day|before:+5 minutes',
        ]);
        $user = $request->user();
        abort_unless($user->rol === User::ROLE_USER, 403);
        $zone = ProjectZone::where('form_id', $data['form_id'])->findOrFail($data['zone_id']);
        abort_unless($zone->assignedUsers()->where('users.id', $user->id)->exists(), 403);
        abort_unless(DB::table('field_tracking_shifts')->where('form_id', $data['form_id'])
            ->where('user_id', $user->id)->whereNull('ended_at')->exists(), 403);

        DB::table('field_location_reports')->insert([
            'form_id' => $data['form_id'], 'zone_id' => $zone->id, 'user_id' => $user->id,
            'latitude' => $data['latitude'], 'longitude' => $data['longitude'],
            'accuracy_meters' => $data['accuracy_meters'] ?? null,
            'recorded_at' => $data['recorded_at'], 'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(['saved' => true], 201);
    }

    public function monitor(Request $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();
        abort_unless($user->canManageProjects() || $user->leadsProject($project->id)
            || $user->supervisesProject($project->id), 403);
        $data = $request->validate(['form_id' => 'required|uuid|exists:forms,id']);
        $form = Form::where('project_id', $project->id)->findOrFail($data['form_id']);
        $zones = $form->zones()->with('assignedUsers:id,name,email')->get();
        $collectorIds = $zones->flatMap(fn ($zone) => $zone->assignedUsers->pluck('id'))->unique()->values();
        $reports = DB::table('field_location_reports')->where('form_id', $form->id)
            ->whereIn('user_id', $collectorIds)->where('recorded_at', '>=', now()->subDays(30))
            ->orderByDesc('recorded_at')->get()->unique('user_id')->keyBy('user_id');
        $activeIds = DB::table('field_tracking_shifts')->where('form_id', $form->id)
            ->whereIn('user_id', $collectorIds)->whereNull('ended_at')->pluck('user_id')->all();

        return response()->json([
            'form_id' => $form->id,
            'zones' => $zones->map(fn ($zone) => [
                'id' => $zone->id, 'name' => $zone->name,
                'geofence_type' => $zone->geofence_type,
                'target_lat' => $zone->target_lat, 'target_lng' => $zone->target_lng,
                'radius_meters' => $zone->radius_meters, 'geometry_json' => $zone->geometry_json,
                'assigned_user_ids' => $zone->assignedUsers->pluck('id'),
            ]),
            'collectors' => $zones->flatMap(fn ($zone) => $zone->assignedUsers)->unique('id')->values()
                ->map(fn ($collector) => [
                    'id' => $collector->id, 'name' => $collector->name,
                    'active' => in_array($collector->id, $activeIds)
                        && isset($reports[$collector->id])
                        && \Carbon\Carbon::parse($reports[$collector->id]->recorded_at)->greaterThan(now()->subMinutes(2)),
                    'last_position' => isset($reports[$collector->id]) ? [
                        'latitude' => (float) $reports[$collector->id]->latitude,
                        'longitude' => (float) $reports[$collector->id]->longitude,
                        'accuracy_meters' => $reports[$collector->id]->accuracy_meters,
                        'recorded_at' => $reports[$collector->id]->recorded_at,
                        'zone_id' => $reports[$collector->id]->zone_id,
                    ] : null,
                ]),
        ]);
    }
}
