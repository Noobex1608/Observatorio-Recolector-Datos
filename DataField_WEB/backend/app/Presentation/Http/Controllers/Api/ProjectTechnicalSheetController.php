<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectTechnicalSheet;
use App\Presentation\Http\Requests\SaveTechnicalSheetRequest;
use App\Presentation\Http\Resources\ProjectTechnicalSheetResource;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Ficha técnica única del proyecto. Su validación (solo el líder) habilita editar preguntas,
 * delimitar zonas y publicar cualquier formulario del proyecto; su periodo enmarca las fechas de cada uno.
 */
class ProjectTechnicalSheetController extends Controller
{
    public function show(Request $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (! $this->canViewProject($project, $user)) {
            return response()->json(['message' => __('No tienes permisos para ver la ficha técnica de este proyecto')], 403);
        }

        $sheet = ProjectTechnicalSheet::with(['validator:id,name,email', 'creator:id,name,email'])
            ->where('project_id', $project->id)
            ->first();

        if (! $sheet) {
            return response()->json([
                'id' => null,
                'project_id' => $project->id,
                'description' => null,
                ...array_fill_keys(ProjectTechnicalSheet::METHODOLOGY_FIELDS, null),
                'start_date' => null,
                'end_date' => null,
                'target_sample_size' => null,
                'status' => 'DRAFT',
                'validated_by' => null,
                'validator' => null,
                'validated_at' => null,
                'created_by' => null,
                'creator' => null,
            ]);
        }

        return response()->json(new ProjectTechnicalSheetResource($sheet));
    }

    public function store(SaveTechnicalSheetRequest $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();

        if (! $user->canManageProjects() && ! $user->leadsProject($project->id) && ! $user->isProjectDelegate($project->id)) {
            return response()->json(['message' => __('No tienes permisos para gestionar la ficha técnica de este proyecto')], 403);
        }

        $data = $request->safe()->only([...ProjectTechnicalSheet::METHODOLOGY_FIELDS, 'start_date', 'end_date', 'target_sample_size']);
        foreach (ProjectTechnicalSheet::METHODOLOGY_FIELDS as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null) {
                $data[$field] = trim((string) $data[$field]) ?: null;
            }
        }
        $sheet = DB::transaction(function () use ($project, $user, $data) {
            $sheet = ProjectTechnicalSheet::where('project_id', $project->id)->lockForUpdate()->first()
                ?? new ProjectTechnicalSheet(['project_id' => $project->id]);
            $wasValidated = $sheet->status === 'VALIDATED';
            $sheet->fill($data);
            // Cualquier cambio devuelve la ficha a borrador hasta que el líder la valide de nuevo.
            $sheet->status = 'DRAFT';
            $sheet->created_by ??= $user->id;
            $sheet->validated_by = null;
            $sheet->validated_at = null;
            $sheet->save();
            AuditLogService::log($user, 'TECHNICAL_SHEET_SAVE', 'proyectos',
                'Ficha técnica guardada para el proyecto \':name\'.', [
                    'project_id' => $project->id, 'approval_revoked' => $wasValidated,
                ], params: ['name' => $project->name]);

            return $sheet;
        });

        return response()->json(new ProjectTechnicalSheetResource($sheet->load(['validator:id,name,email', 'creator:id,name,email'])));
    }

    public function validateSheet(Request $request, string $projectId): JsonResponse
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();
        abort_unless($user->leadsProject($project->id), 403, __('Solo el líder asignado puede validar la ficha.'));

        $sheet = ProjectTechnicalSheet::where('project_id', $project->id)->first();
        abort_unless($sheet, 422, __('Primero guarde la ficha técnica.'));
        $missing = array_filter(ProjectTechnicalSheet::METHODOLOGY_FIELDS, fn ($field) => trim((string) $sheet->{$field}) === '');
        abort_if($missing !== [] || ! $sheet->start_date || ! $sheet->end_date, 422,
            __('Para validar, complete los objetivos, la población de estudio, la cobertura geográfica, la técnica e instrumento y las fechas del proyecto.'));
        abort_if($sheet->end_date->lessThan($sheet->start_date), 422,
            __('La fecha de fin no puede ser anterior a la fecha de inicio.'));

        // Los formularios vigentes (borrador o publicados) deben quedar dentro del periodo validado.
        $from = $sheet->start_date->format('Y-m-d');
        $to = $sheet->end_date->format('Y-m-d');
        $outside = $project->forms()->whereIn('state', ['DRAFT', 'DEPLOYED'])
            ->where(fn ($q) => $q->where('start_date', '<', $from)->orWhere('start_date', '>', $to)
                ->orWhere('end_date', '<', $from)->orWhere('end_date', '>', $to))
            ->orderBy('title')->pluck('title');
        abort_if($outside->isNotEmpty(), 422,
            __('Estos formularios tienen fechas fuera del periodo de la ficha: :forms. Ajuste sus fechas o el periodo antes de validar.', ['forms' => $outside->implode(', ')]));

        DB::transaction(function () use ($sheet, $project, $user) {
            $sheet->update(['status' => 'VALIDATED', 'validated_by' => $user->id, 'validated_at' => now()]);
            AuditLogService::log($user, 'TECHNICAL_SHEET_VALIDATE', 'proyectos',
                'Ficha técnica validada para el proyecto \':name\'.', ['project_id' => $project->id], params: ['name' => $project->name]);
        });

        return response()->json(new ProjectTechnicalSheetResource($sheet->load(['validator:id,name,email', 'creator:id,name,email'])));
    }

    private function canViewProject(Project $project, $user): bool
    {
        return $user->canManageProjects()
            || $user->leadsProject($project->id)
            || $user->isProjectDelegate($project->id)
            || $user->supervisesProject($project->id)
            || $project->forms()->whereHas('shares', fn ($s) => $s->where('user_id', $user->id))->exists()
            || $project->zones()->whereHas('assignedUsers', fn ($u) => $u->where('users.id', $user->id))->exists();
    }
}
