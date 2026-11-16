<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Form;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Compatibilidad: la ficha técnica ahora es una por proyecto. Consultarla desde un formulario
 * devuelve la ficha de su proyecto; se edita y valida en /projects/{id}/technical-sheet.
 * Las fichas antiguas por formulario se conservan en form_technical_sheets solo como historial.
 */
class FormTechnicalSheetController extends Controller
{
    public function show(Request $request, string $id): JsonResponse
    {
        $form = Form::findOrFail($id);

        return app(ProjectTechnicalSheetController::class)->show($request, (string) $form->project_id);
    }
}
