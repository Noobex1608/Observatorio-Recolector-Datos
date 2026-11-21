<?php

use App\Presentation\Http\Controllers\Api\FormController;
use App\Presentation\Http\Controllers\Api\FormInstrumentExcelController;
use App\Presentation\Http\Controllers\Api\FormShareImportController;
use App\Presentation\Http\Controllers\Api\FormTechnicalSheetController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Form Routes
|--------------------------------------------------------------------------
*/

Route::middleware(['auth:sanctum', \App\Http\Middleware\SerializeFormMutation::class])->group(function () {
    Route::get('/', [FormController::class, 'index']); // list forms
    // Cuestionario en Excel (XLSForm): plantilla, vista previa de importación y exportación
    Route::get('/import/template', [FormInstrumentExcelController::class, 'template']);
    Route::post('/import/preview', [FormInstrumentExcelController::class, 'preview'])->middleware('throttle:30,1');
    Route::get('/{id}/instrument.xlsx', [FormController::class, 'exportInstrument']);
    Route::post('/', [FormController::class, 'store']); // create form
    Route::get('/{id}', [FormController::class, 'show']); // view form details
    Route::put('/{id}', [FormController::class, 'update']); // update form (only if DRAFT/ARCHIVED)
    Route::delete('/{id}', [FormController::class, 'destroy']);
    Route::post('/{id}/clone', [FormController::class, 'cloneForm']);
    Route::post('/{id}/deploy', [FormController::class, 'deploy']); // change to DEPLOYED
    Route::post('/{id}/archive', [FormController::class, 'archive']); // change to ARCHIVED
    // La ficha técnica es una por proyecto; desde el formulario solo se consulta la de su proyecto.
    Route::get('/{id}/technical-sheet', [FormTechnicalSheetController::class, 'show']);
    // Ficha técnica metodológica propia de cada formulario; la valida el líder o el delegado del proyecto.
    Route::get('/{id}/form-sheet', [FormTechnicalSheetController::class, 'showFormSheet']);
    Route::put('/{id}/form-sheet', [FormTechnicalSheetController::class, 'saveFormSheet']);
    Route::post('/{id}/form-sheet/validate', [FormTechnicalSheetController::class, 'validateFormSheet']);

    Route::put('/{id}/draft', [FormController::class, 'saveDraft']);

    // Modo de prueba: recorrer el formulario sin publicarlo; el envío se valida y no se guarda.
    Route::get('/{id}/test', [FormController::class, 'testForm']);
    Route::post('/{id}/test-submit', [FormController::class, 'testSubmit'])->middleware('throttle:60,1');
    Route::get('/{id}/test-link', [FormController::class, 'testLink']);

    // Questions
    Route::get('/{id}/questions', [FormController::class, 'getQuestions']);
    Route::post('/{id}/questions', [FormController::class, 'storeQuestion']);
    Route::put('/questions/{question_id}', [FormController::class, 'updateQuestion']);
    Route::delete('/questions/{question_id}', [FormController::class, 'destroyQuestion']);

    // Sharing
    Route::get('/{id}/shares/template', [FormShareImportController::class, 'template']);
    Route::post('/{id}/shares/import', [FormShareImportController::class, 'import']);
    Route::get('/{id}/shares', [FormController::class, 'getShares']);
    Route::post('/{id}/shares', [FormController::class, 'storeShare']);
    Route::patch('/{id}/shares/{share_id}', [FormController::class, 'updateShare']);
    Route::delete('/{id}/shares/{share_id}', [FormController::class, 'destroyShare']);

    // Responses/Data Management
    Route::get('/{id}/responses', [FormController::class, 'getResponses']);
    Route::get('/{id}/responses/{responseId}/media/{questionId}', [FormController::class, 'getResponseMedia']);
    Route::get('/{id}/export', [FormController::class, 'exportResponses'])->middleware('throttle:response-export'); // Export CSV/Excel
    Route::post('/{id}/log-export', [FormController::class, 'logExport'])->middleware('throttle:response-export'); // Declaración de PDF generado en el navegador
    Route::get('/{id}/stats', [FormController::class, 'getStats']); // Graphical data
});

// Public: fetch form by link and submit response (no mandatory auth needed)
Route::get('/fetch/{link_uuid}', [FormController::class, 'fetchForm']);
Route::post('/submit/{link_uuid}', [FormController::class, 'submitResponse'])->middleware('throttle:public-form-submit');

// Public: prueba compartida con enlace firmado (?token=...), sin sesión; no guarda respuestas.
Route::get('/public-test/{id}', [FormController::class, 'publicTestForm'])->middleware('throttle:60,1');
Route::post('/public-test/{id}/submit', [FormController::class, 'publicTestSubmit'])->middleware('throttle:60,1');
