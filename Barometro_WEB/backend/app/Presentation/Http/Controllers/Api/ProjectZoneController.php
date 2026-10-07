<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\ProjectZoneUserAssignment;
use App\Presentation\Http\Requests\BulkAssignZonesRequest;
use App\Presentation\Http\Requests\SaveProjectZoneRequest;
use App\Presentation\Http\Resources\ProjectZoneResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectZoneController extends Controller
{
    public function index(Request $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canViewProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para ver las zonas de este proyecto'], 403);
        }

        $zones = ProjectZone::with(['assignedUsers:id,name,email,rol'])
            ->where('project_id', $project->id)
            ->orderBy('created_at', 'asc')
            ->get();

        return response()->json(ProjectZoneResource::collection($zones));
    }

    public function store(SaveProjectZoneRequest $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canManageProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para crear zonas en este proyecto'], 403);
        }

        $data = $request->validated();
        $technicalSheet = $project->technicalSheet;

        $zone = DB::transaction(function () use ($project, $technicalSheet, $data) {
            $assignedCount = isset($data['assigned_count'])
                ? (int) $data['assigned_count']
                : (!empty($data['assigned_user_ids']) ? count($data['assigned_user_ids']) : 0);

            $zone = ProjectZone::create([
                'project_id' => $project->id,
                'technical_sheet_id' => $technicalSheet?->id,
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

            if (!empty($data['assigned_user_ids'])) {
                $syncData = [];
                foreach ($data['assigned_user_ids'] as $userId) {
                    $syncData[$userId] = ['role' => 'RECOLECTOR'];
                }
                $zone->assignedUsers()->sync($syncData);
            }

            return $zone;
        });

        $zone->load(['assignedUsers:id,name,email,rol']);

        return response()->json(new ProjectZoneResource($zone), 201);
    }

    public function show(Request $request, string $projectId, string $zoneId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canViewProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para ver esta zona'], 403);
        }

        $zone = ProjectZone::with(['assignedUsers:id,name,email,rol'])
            ->where('project_id', $project->id)
            ->findOrFail($zoneId);

        return response()->json(new ProjectZoneResource($zone));
    }

    public function update(SaveProjectZoneRequest $request, string $projectId, string $zoneId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canManageProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para editar zonas en este proyecto'], 403);
        }

        $zone = ProjectZone::where('project_id', $project->id)->findOrFail($zoneId);
        $data = $request->validated();

        DB::transaction(function () use ($zone, $data) {
            $assignedCount = isset($data['assigned_count'])
                ? (int) $data['assigned_count']
                : (array_key_exists('assigned_user_ids', $data) ? count($data['assigned_user_ids'] ?? []) : $zone->assigned_count);

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
                $syncData = [];
                foreach ($data['assigned_user_ids'] ?? [] as $userId) {
                    $syncData[$userId] = ['role' => 'RECOLECTOR'];
                }
                $zone->assignedUsers()->sync($syncData);
            }
        });

        $zone->load(['assignedUsers:id,name,email,rol']);

        return response()->json(new ProjectZoneResource($zone));
    }

    public function destroy(Request $request, string $projectId, string $zoneId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canManageProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para eliminar zonas de este proyecto'], 403);
        }

        $zone = ProjectZone::where('project_id', $project->id)->findOrFail($zoneId);
        $zone->delete();

        return response()->json(null, 204);
    }

    public function bulkAssign(BulkAssignZonesRequest $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canManageProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para asignar encuestadores'], 403);
        }

        $data = $request->validated();

        DB::transaction(function () use ($project, $data) {
            foreach ($data['assignments'] as $item) {
                $zone = ProjectZone::where('project_id', $project->id)->find($item['zone_id']);
                if ($zone) {
                    $syncData = [];
                    foreach ($item['user_ids'] as $uId) {
                        $syncData[$uId] = ['role' => 'RECOLECTOR'];
                    }
                    $zone->assignedUsers()->sync($syncData);
                }
            }
        });

        $zones = ProjectZone::with(['assignedUsers:id,name,email,rol'])
            ->where('project_id', $project->id)
            ->get();

        return response()->json(ProjectZoneResource::collection($zones));
    }

    private function canViewProject(Project $project, $user): bool
    {
        return $user->canManageProjects()
            || $user->leadsProject($project->id)
            || $project->forms()->whereHas('shares', fn($s) => $s->where('user_id', $user->id))->exists()
            || $project->zones()->whereHas('assignedUsers', fn($u) => $u->where('users.id', $user->id))->exists();
    }

    private function canManageProject(Project $project, $user): bool
    {
        return $user->canManageProjects() || $user->leadsProject($project->id);
    }
}
