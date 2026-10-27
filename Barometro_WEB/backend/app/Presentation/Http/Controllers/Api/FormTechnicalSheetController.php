<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Form;
use App\Models\FormTechnicalSheet;
use App\Presentation\Http\Requests\SaveTechnicalSheetRequest;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FormTechnicalSheetController extends Controller
{
    public function show(Request $request, string $id): JsonResponse
    {
        $form = Form::with(['technicalSheet.creator:id,name,email', 'technicalSheet.validator:id,name,email'])->findOrFail($id);
        $user = $request->user();
        abort_unless($user->canManageProjects() || $user->leadsProject($form->project_id)
            || $user->isProjectDelegate($form->project_id)
            || $user->supervisesProject($form->project_id), 403);

        return response()->json($form->technicalSheet ?? [
            'form_id' => $form->id, 'status' => 'DRAFT',
            'description' => null, 'start_date' => null, 'end_date' => null,
            'target_sample_size' => null,
        ]);
    }

    public function store(SaveTechnicalSheetRequest $request, string $id): JsonResponse
    {
        $form = Form::findOrFail($id);
        $user = $request->user();
        abort_unless($user->canManageProjects() || $user->leadsProject($form->project_id)
            || $user->isProjectDelegate($form->project_id), 403);
        abort_if($form->state === 'DEPLOYED', 422, 'Archive el formulario antes de editar su ficha técnica.');

        $data = $request->safe()->only(['description', 'start_date', 'end_date', 'target_sample_size']);
        $sheet = DB::transaction(function () use ($form, $user, $data) {
            $sheet = FormTechnicalSheet::firstOrNew(['form_id' => $form->id]);
            $wasValidated = $sheet->status === 'VALIDATED';
            $sheet->fill($data);
            $sheet->status = 'DRAFT';
            $sheet->created_by ??= $user->id;
            $sheet->validated_by = null;
            $sheet->validated_at = null;
            $sheet->save();
            AuditLogService::log($user, 'TECHNICAL_SHEET_SAVE', 'formularios',
                "Ficha técnica guardada para '{$form->title}'.", [
                    'form_id' => $form->id, 'approval_revoked' => $wasValidated,
                ]);

            return $sheet;
        });

        return response()->json($sheet->load('creator:id,name,email', 'validator:id,name,email'));
    }

    public function validateSheet(Request $request, string $id): JsonResponse
    {
        $form = Form::findOrFail($id);
        $user = $request->user();
        abort_unless($user->leadsProject($form->project_id), 403, 'Solo el líder asignado puede validar la ficha.');

        $sheet = $form->technicalSheet;
        abort_unless($sheet, 422, 'Primero guarde la ficha técnica.');
        abort_if(! $sheet->start_date || ! $sheet->end_date || ! $sheet->description,
            422, 'La descripción y las fechas de inicio y fin son obligatorias para validar.');
        abort_if($sheet->end_date->lessThan($sheet->start_date), 422,
            'La fecha de fin no puede ser anterior a la fecha de inicio.');
        DB::transaction(function () use ($sheet, $form, $user) {
            $sheet->update(['status' => 'VALIDATED', 'validated_by' => $user->id, 'validated_at' => now()]);
            if (in_array($form->state, ['DRAFT', 'ARCHIVED'], true)) {
                $form->update([
                    'start_date' => $sheet->start_date->format('Y-m-d'),
                    'end_date' => $sheet->end_date->format('Y-m-d'),
                ]);
            }
            AuditLogService::log($user, 'TECHNICAL_SHEET_VALIDATE', 'formularios',
                "Ficha técnica validada para '{$form->title}'.", ['form_id' => $form->id]);
        });

        return response()->json($sheet->load('creator:id,name,email', 'validator:id,name,email'));
    }
}
