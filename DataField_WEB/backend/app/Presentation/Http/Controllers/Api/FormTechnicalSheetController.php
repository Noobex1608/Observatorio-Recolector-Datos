<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Form;
use App\Models\FormTechnicalSheet;
use App\Models\FormUserShare;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Dos fichas conviven:
 *  - GET /forms/{id}/technical-sheet: la ficha del proyecto (periodo y muestra; su validación
 *    habilita editar el formulario). Se edita en /projects/{id}/technical-sheet.
 *  - /forms/{id}/form-sheet: la ficha técnica metodológica propia de cada formulario
 *    (universo, cobertura, tamaño muestral, margen de error, técnica de campo y control de calidad).
 *    La edita quien puede editar el formulario o el delegado; la valida el líder o el delegado del proyecto.
 */
class FormTechnicalSheetController extends Controller
{
    public function show(Request $request, string $id): JsonResponse
    {
        $form = Form::findOrFail($id);

        return app(ProjectTechnicalSheetController::class)->show($request, (string) $form->project_id);
    }

    public function showFormSheet(Request $request, string $id): JsonResponse
    {
        $form = Form::findOrFail($id);
        $user = $request->user();
        abort_unless($this->canView($form, $user), 403, __('No tienes permisos para ver este formulario'));

        $sheet = FormTechnicalSheet::with(['validator:id,name,email', 'creator:id,name,email'])
            ->where('form_id', $form->id)->first();

        return response()->json($this->present($form, $sheet, $user));
    }

    public function saveFormSheet(Request $request, string $id): JsonResponse
    {
        $form = Form::findOrFail($id);
        $user = $request->user();
        abort_unless($this->canEdit($form, $user), 403, __('No tienes permisos para editar la ficha técnica de este formulario'));

        $rules = ['status' => 'prohibited'];
        foreach (FormTechnicalSheet::PARAMETERS as $field) {
            $rules[$field] = 'nullable|string|max:3000';
        }
        $data = $request->validate($rules, [
            'status.prohibited' => __('El estado de la ficha no se puede modificar desde este formulario.'),
            '*.max' => __('Cada parámetro de la ficha técnica admite hasta 3000 caracteres.'),
        ]);
        $data = array_map(fn ($value) => $value === null ? null : trim((string) $value), $data);

        $sheet = DB::transaction(function () use ($form, $user, $data) {
            $sheet = FormTechnicalSheet::where('form_id', $form->id)->lockForUpdate()->first()
                ?? new FormTechnicalSheet(['form_id' => $form->id]);
            $wasValidated = $sheet->status === 'VALIDATED';
            $sheet->fill($data);
            $changed = ! $sheet->exists || $sheet->isDirty(FormTechnicalSheet::PARAMETERS);
            if ($changed) {
                // Cualquier cambio devuelve la ficha a borrador hasta que se valide de nuevo.
                $sheet->status = 'DRAFT';
                $sheet->validated_by = null;
                $sheet->validated_at = null;
            }
            $sheet->created_by ??= $user->id;
            $sheet->save();

            if ($changed) {
                AuditLogService::log($user, 'FORM_TECHNICAL_SHEET_SAVE', 'formularios',
                    'Ficha técnica guardada para el formulario \':form\'.', [
                        'form_id' => $form->id, 'approval_revoked' => $wasValidated,
                    ], params: ['form' => $form->title]);
            }

            return $sheet;
        });

        return response()->json($this->present($form, $sheet->load(['validator:id,name,email', 'creator:id,name,email']), $user));
    }

    public function validateFormSheet(Request $request, string $id): JsonResponse
    {
        $form = Form::findOrFail($id);
        $user = $request->user();
        abort_unless($this->canValidate($form, $user), 403,
            __('Solo el líder o el delegado del proyecto pueden validar la ficha técnica del formulario.'));

        $sheet = FormTechnicalSheet::where('form_id', $form->id)->first();
        abort_unless($sheet, 422, __('Primero guarde la ficha técnica.'));
        abort_if($sheet->missingParameters() !== [], 422,
            __('Complete todos los parámetros de la ficha técnica antes de validarla.'));

        DB::transaction(function () use ($sheet, $form, $user) {
            $sheet->update(['status' => 'VALIDATED', 'validated_by' => $user->id, 'validated_at' => now()]);
            AuditLogService::log($user, 'FORM_TECHNICAL_SHEET_VALIDATE', 'formularios',
                'Ficha técnica validada para el formulario \':form\'.', ['form_id' => $form->id], params: ['form' => $form->title]);
        });

        return response()->json($this->present($form, $sheet->load(['validator:id,name,email', 'creator:id,name,email']), $user));
    }

    private function present(Form $form, ?FormTechnicalSheet $sheet, User $user): array
    {
        $parameters = [];
        foreach (FormTechnicalSheet::PARAMETERS as $field) {
            $parameters[$field] = $sheet?->{$field};
        }

        return [
            'id' => $sheet?->id,
            'form_id' => $form->id,
            ...$parameters,
            'status' => $sheet?->status ?? 'DRAFT',
            'validated_at' => $sheet?->validated_at?->toIso8601String(),
            'validator' => $sheet?->validator ? ['id' => $sheet->validator->id, 'name' => $sheet->validator->name, 'email' => $sheet->validator->email] : null,
            'creator' => $sheet?->creator ? ['id' => $sheet->creator->id, 'name' => $sheet->creator->name, 'email' => $sheet->creator->email] : null,
            'updated_at' => $sheet?->updated_at?->toIso8601String(),
            'can_edit' => $this->canEdit($form, $user),
            'can_validate' => $this->canValidate($form, $user),
        ];
    }

    private function shareRole(Form $form, User $user): ?string
    {
        return FormUserShare::where('form_id', $form->id)->where('user_id', $user->id)->value('role');
    }

    private function canView(Form $form, User $user): bool
    {
        return $user->canManageProjects() || $user->leadsProject($form->project_id)
            || $user->isProjectDelegate($form->project_id) || (int) $form->user_id === (int) $user->id
            || $this->shareRole($form, $user) !== null;
    }

    private function canEdit(Form $form, User $user): bool
    {
        return $user->canManageProjects() || $this->canValidate($form, $user)
            || ((int) $form->user_id === (int) $user->id && ! $user->isUser())
            || $this->shareRole($form, $user) === 'PROJECT';
    }

    private function canValidate(Form $form, User $user): bool
    {
        return $user->leadsProject($form->project_id) || $user->isProjectDelegate($form->project_id);
    }
}
