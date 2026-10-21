<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Form;
use App\Models\FormUserShare;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use App\Presentation\Http\Requests\BulkAssignZonesRequest;
use App\Presentation\Http\Requests\SaveProjectZoneRequest;
use App\Presentation\Http\Resources\ProjectZoneResource;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ProjectZoneController extends Controller
{
    public function index(Request $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (! $this->canViewProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para ver las zonas de este proyecto'], 403);
        }

        $zones = ProjectZone::with(['assignedUsers:id,name,email,rol'])
            ->where('project_id', $project->id)
            ->when($request->query('form_id'), fn ($q, $formId) => $q->where('form_id', $formId))
            ->when(! $user->canManageProjects() && ! $user->leadsProject($project->id)
                && ! $user->isProjectDelegate($project->id) && ! $user->supervisesProject($project->id),
                fn ($q) => $q->whereHas('assignedUsers', fn ($members) => $members->where('users.id', $user->id)))
            ->orderBy('created_at', 'asc')
            ->get();

        return response()->json(ProjectZoneResource::collection($zones));
    }

    public function store(SaveProjectZoneRequest $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (! $user->leadsProject($project->id)) {
            return response()->json(['message' => 'No tienes permisos para crear zonas en este proyecto'], 403);
        }

        $data = $request->validated();
        $form = isset($data['form_id']) ? Form::where('project_id', $project->id)->find($data['form_id']) : null;
        if (! $form) {
            return response()->json(['message' => 'Seleccione primero un formulario del proyecto'], 422);
        }
        if ($form->technicalSheet?->status !== 'VALIDATED') {
            return response()->json(['message' => 'La ficha técnica debe estar validada antes de delimitar'], 422);
        }

        $zone = DB::transaction(function () use ($project, $form, $data, $user) {
            $this->assertActiveCollectors($data['assigned_user_ids'] ?? []);
            $assignedCount = isset($data['assigned_count'])
                ? (int) $data['assigned_count']
                : (! empty($data['assigned_user_ids']) ? count($data['assigned_user_ids']) : 0);
            abort_if($assignedCount > 0 && count($data['assigned_user_ids'] ?? []) > $assignedCount,
                422, 'La asignación supera la cuota de encuestadores de la zona.');

            $zone = ProjectZone::create([
                'project_id' => $project->id,
                'form_id' => $form->id,
                'technical_sheet_id' => null,
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'geofence_type' => $data['geofence_type'] ?? 'radius',
                'target_lat' => $data['target_lat'] ?? null,
                'target_lng' => $data['target_lng'] ?? null,
                'radius_meters' => $data['radius_meters'] ?? 500,
                'hierarchy_json' => $data['hierarchy_json'] ?? null,
                'geometry_json' => $data['geometry_json'] ?? null,
                'target_responses' => $data['target_responses'] ?? null,
                'assigned_count' => $assignedCount,
            ]);

            $this->syncZoneCollectors($zone, $data['assigned_user_ids'] ?? []);
            AuditLogService::log($user, 'CREATE_ZONE', 'zonas', "Creó la zona {$zone->name}.", [
                'project_id' => $project->id, 'form_id' => $form->id, 'zone_id' => $zone->id,
            ]);

            return $zone;
        });

        $zone->load(['assignedUsers:id,name,email,rol']);

        return response()->json(new ProjectZoneResource($zone), 201);
    }

    public function show(Request $request, string $projectId, string $zoneId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (! $this->canViewProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para ver esta zona'], 403);
        }

        $zone = ProjectZone::with(['assignedUsers:id,name,email,rol'])
            ->where('project_id', $project->id)
            ->findOrFail($zoneId);
        abort_if(! $user->canManageProjects() && ! $user->leadsProject($project->id)
            && ! $user->isProjectDelegate($project->id) && ! $user->supervisesProject($project->id)
            && ! $zone->assignedUsers->contains('id', $user->id), 403);

        return response()->json(new ProjectZoneResource($zone));
    }

    public function update(SaveProjectZoneRequest $request, string $projectId, string $zoneId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (! $user->leadsProject($project->id)) {
            return response()->json(['message' => 'No tienes permisos para editar zonas en este proyecto'], 403);
        }

        $data = $request->validated();
        $zone = DB::transaction(function () use ($project, $zoneId, $data, $user) {
            $zone = ProjectZone::where('project_id', $project->id)->whereKey($zoneId)
                ->lockForUpdate()->firstOrFail();
            $this->assertActiveCollectors($data['assigned_user_ids'] ?? []);
            abort_if(isset($data['form_id']) && $data['form_id'] !== $zone->form_id,
                422, 'No se puede mover una zona a otro formulario');
            $before = $zone->only(['name', 'form_id', 'target_responses', 'assigned_count']);
            $assignedCount = isset($data['assigned_count'])
                ? (int) $data['assigned_count']
                : (array_key_exists('assigned_user_ids', $data) ? count($data['assigned_user_ids'] ?? []) : $zone->assigned_count);
            $usersCount = array_key_exists('assigned_user_ids', $data)
                ? count($data['assigned_user_ids'] ?? []) : $zone->assignedUsers()->count();
            abort_if($assignedCount > 0 && $usersCount > $assignedCount,
                422, 'La cuota no puede ser menor que el número de encuestadores asignados.');

            $zone->update([
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'geofence_type' => $data['geofence_type'] ?? 'radius',
                'target_lat' => $data['target_lat'] ?? null,
                'target_lng' => $data['target_lng'] ?? null,
                'radius_meters' => $data['radius_meters'] ?? 500,
                'hierarchy_json' => $data['hierarchy_json'] ?? null,
                'geometry_json' => $data['geometry_json'] ?? null,
                'target_responses' => $data['target_responses'] ?? null,
                'assigned_count' => $assignedCount,
            ]);

            if (array_key_exists('assigned_user_ids', $data)) {
                $this->syncZoneCollectors($zone, $data['assigned_user_ids'] ?? []);
            }
            AuditLogService::log($user, 'UPDATE_ZONE', 'zonas', "Actualizó la zona {$zone->name}.", [
                'zone_id' => $zone->id, 'before' => $before,
                'after' => $zone->only(['name', 'form_id', 'target_responses', 'assigned_count']),
            ]);

            return $zone;
        });

        $zone->load(['assignedUsers:id,name,email,rol']);

        return response()->json(new ProjectZoneResource($zone));
    }

    public function destroy(Request $request, string $projectId, string $zoneId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (! $user->leadsProject($project->id)) {
            return response()->json(['message' => 'No tienes permisos para eliminar zonas de este proyecto'], 403);
        }

        $zone = ProjectZone::where('project_id', $project->id)->findOrFail($zoneId);
        DB::transaction(function () use ($zone, $user) {
            $zone->delete();
            AuditLogService::log($user, 'DELETE_ZONE', 'zonas', "Eliminó la zona {$zone->name}.", [
                'zone_id' => $zone->id, 'project_id' => $zone->project_id, 'form_id' => $zone->form_id,
            ]);
        });

        return response()->json(null, 204);
    }

    public function bulkAssign(BulkAssignZonesRequest $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (! $user->leadsProject($project->id)) {
            return response()->json(['message' => 'No tienes permisos para asignar encuestadores'], 403);
        }

        $data = $request->validated();
        DB::transaction(function () use ($project, $data, $user) {
            foreach (collect($data['assignments'])->sortBy('zone_id') as $item) {
                $zone = ProjectZone::where('project_id', $project->id)
                    ->whereKey($item['zone_id'])->lockForUpdate()->first();
                abort_unless($zone && $zone->form_id && Form::where('project_id', $project->id)->whereKey($zone->form_id)->exists(), 422,
                    'La zona debe pertenecer a un formulario de este proyecto.');
                $this->assertActiveCollectors($item['user_ids']);
                abort_if($zone->assigned_count && count($item['user_ids']) > $zone->assigned_count,
                    422, 'La asignación supera la cuota de encuestadores de la zona.');
                $this->syncZoneCollectors($zone, $item['user_ids']);
                AuditLogService::log($user, 'ASSIGN_ZONE', 'zonas', "Asignó encuestadores a la zona {$zone->name}.", [
                    'zone_id' => $zone->id, 'user_ids' => $item['user_ids'],
                ]);
            }
        });

        $zones = ProjectZone::with(['assignedUsers:id,name,email,rol'])
            ->where('project_id', $project->id)
            ->get();

        return response()->json(ProjectZoneResource::collection($zones));
    }

    public function randomAssign(Request $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        abort_unless($request->user()->leadsProject($project->id), 403);
        $data = $request->validate([
            'form_id' => 'required|uuid|exists:forms,id',
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => 'required|integer|distinct|exists:users,id',
            'seed' => 'nullable|string|max:100',
            'dry_run' => 'sometimes|boolean',
        ]);
        $form = Form::where('project_id', $project->id)->findOrFail($data['form_id']);
        $zones = $form->zones()->withCount('assignedUsers')->orderBy('id')->get();
        if ($zones->isEmpty()) {
            return response()->json(['message' => 'Delimite las zonas antes de asignar encuestadores'], 422);
        }
        if ($zones->contains(fn ($zone) => $zone->assigned_users_count > 0)) {
            return response()->json(['message' => 'Ya existen asignaciones. Revísalas antes de hacer un nuevo sorteo'], 422);
        }

        $users = User::whereIn('id', $data['user_ids'])->where('rol', User::ROLE_USER)
            ->where('is_active', true)->get();
        if ($users->count() !== count($data['user_ids'])) {
            return response()->json(['message' => 'Seleccione únicamente encuestadores activos'], 422);
        }

        $seed = $data['seed'] ?? (string) Str::uuid();
        $ids = $users->pluck('id')->sortBy(fn ($id) => hash('sha256', $seed.':'.$id))->values();
        $assignments = $zones->mapWithKeys(fn ($zone) => [$zone->id => []])->all();
        foreach ($ids as $userId) {
            $candidate = $zones->sortBy(fn ($zone) => count($assignments[$zone->id]))
                ->first(fn ($zone) => ! $zone->assigned_count || count($assignments[$zone->id]) < $zone->assigned_count);
            if (! $candidate) {
                return response()->json(['message' => 'La capacidad total de las zonas es menor al número de encuestadores'], 422);
            }
            $assignments[$candidate->id][] = $userId;
        }

        if (! $request->boolean('dry_run')) {
            DB::transaction(function () use ($zones, $assignments, $form, $request, $seed) {
                foreach ($zones as $zone) {
                    $lockedZone = ProjectZone::whereKey($zone->id)->lockForUpdate()->firstOrFail();
                    abort_if($lockedZone->assignedUsers()->exists(), 422,
                        'Ya existen asignaciones. Revísalas antes de hacer un nuevo sorteo.');
                    abort_if($lockedZone->assigned_count && count($assignments[$zone->id]) > $lockedZone->assigned_count,
                        422, 'La asignación supera la cuota de encuestadores de la zona.');
                    $sync = [];
                    foreach ($assignments[$zone->id] as $userId) {
                        $sync[$userId] = ['role' => 'RECOLECTOR'];
                        FormUserShare::firstOrCreate(
                            ['form_id' => $form->id, 'user_id' => $userId],
                            ['role' => 'RECOLECTOR']
                        );
                    }
                    $lockedZone->assignedUsers()->sync($sync);
                }
                AuditLogService::log($request->user(), 'RANDOM_ASSIGN_ZONES', 'zonas',
                    'Confirmó la asignación aleatoria de encuestadores.', [
                        'form_id' => $form->id, 'seed' => $seed, 'assignments' => $assignments,
                    ]);
            });
            Log::info('Asignación aleatoria de zonas confirmada', [
                'project_id' => $project->id, 'form_id' => $form->id,
                'leader_id' => $request->user()->id, 'seed' => $seed,
                'assignments' => $assignments,
            ]);
        }

        return response()->json(['seed' => $seed, 'dry_run' => $request->boolean('dry_run'), 'assignments' => $assignments]);
    }

    private function canViewProject(Project $project, $user): bool
    {
        return $user->canManageProjects()
            || $user->leadsProject($project->id)
            || $user->supervisesProject($project->id)
            || $project->forms()->whereHas('shares', fn ($s) => $s->where('user_id', $user->id))->exists()
            || $project->zones()->whereHas('assignedUsers', fn ($u) => $u->where('users.id', $user->id))->exists();
    }

    private function canManageProject(Project $project, $user): bool
    {
        return $user->canManageProjects() || $user->leadsProject($project->id);
    }

    private function assertActiveCollectors(array $ids): void
    {
        $ids = array_values(array_unique($ids));
        $users = User::whereIn('id', $ids)->lockForUpdate()->get();
        abort_if($users->count() !== count($ids)
            || $users->contains(fn (User $user) => $user->rol !== User::ROLE_USER || ! $user->is_active), 422,
            'Solo se pueden asignar encuestadores activos.');
    }

    private function syncZoneCollectors(ProjectZone $zone, array $ids): void
    {
        $sync = [];
        foreach ($ids as $id) {
            $sync[$id] = ['role' => 'RECOLECTOR'];
            if ($zone->form_id) {
                FormUserShare::firstOrCreate(['form_id' => $zone->form_id, 'user_id' => $id],
                    ['role' => 'RECOLECTOR']);
            }
        }
        $zone->assignedUsers()->sync($sync);
    }
}
