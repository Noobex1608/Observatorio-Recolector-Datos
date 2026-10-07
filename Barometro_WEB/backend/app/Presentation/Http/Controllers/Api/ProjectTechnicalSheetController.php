<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectTechnicalSheet;
use App\Presentation\Http\Requests\SaveTechnicalSheetRequest;
use App\Presentation\Http\Resources\ProjectTechnicalSheetResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectTechnicalSheetController extends Controller
{
    public function show(Request $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canViewProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para ver la ficha técnica de este proyecto'], 403);
        }

        $sheet = ProjectTechnicalSheet::with(['validator:id,name,email', 'creator:id,name,email', 'zones.assignedUsers:id,name,email'])
            ->where('project_id', $project->id)
            ->first();

        if (!$sheet) {
            return response()->json([
                'id' => null,
                'project_id' => $project->id,
                'description' => null,
                'start_date' => null,
                'end_date' => null,
                'target_sample_size' => null,
                'status' => 'DRAFT',
                'validated_by' => null,
                'validator' => null,
                'validated_at' => null,
                'created_by' => null,
                'creator' => null,
                'zones' => [],
            ]);
        }

        return response()->json(new ProjectTechnicalSheetResource($sheet));
    }

    public function store(SaveTechnicalSheetRequest $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canManageProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para gestionar la ficha técnica de este proyecto'], 403);
        }

        $data = $request->validated();

        $sheet = ProjectTechnicalSheet::updateOrCreate(
            ['project_id' => $project->id],
            [
                'description' => $data['description'] ?? null,
                'start_date' => $data['start_date'] ?? null,
                'end_date' => $data['end_date'] ?? null,
                'target_sample_size' => $data['target_sample_size'] ?? null,
                'status' => $data['status'] ?? 'DRAFT',
                'created_by' => $user->id,
            ]
        );

        $sheet->load(['validator:id,name,email', 'creator:id,name,email', 'zones.assignedUsers:id,name,email']);

        return response()->json(new ProjectTechnicalSheetResource($sheet), 200);
    }

    public function validateSheet(Request $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (!$this->canManageProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para validar la ficha técnica de este proyecto'], 403);
        }

        $sheet = ProjectTechnicalSheet::firstOrNew(['project_id' => $project->id]);

        $description = $request->input('description', $sheet->description);
        $startDate = $request->input('start_date', $sheet->start_date?->format('Y-m-d'));
        $endDate = $request->input('end_date', $sheet->end_date?->format('Y-m-d'));
        $targetSample = $request->input('target_sample_size', $sheet->target_sample_size);

        if (empty($startDate) || empty($endDate)) {
            return response()->json(['message' => 'Debe definir las fechas de inicio y fin del levantamiento antes de validar'], 422);
        }

        $sheet->fill([
            'description' => $description,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'target_sample_size' => $targetSample,
            'status' => 'VALIDATED',
            'validated_by' => $user->id,
            'validated_at' => now(),
            'created_by' => $sheet->created_by ?? $user->id,
        ]);
        $sheet->save();

        $sheet->load(['validator:id,name,email', 'creator:id,name,email', 'zones.assignedUsers:id,name,email']);

        return response()->json(new ProjectTechnicalSheetResource($sheet));
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
