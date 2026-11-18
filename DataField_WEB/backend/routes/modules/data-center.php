<?php

use App\Presentation\Http\Controllers\Api\DataCenterController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Centro de datos (solo SUPER_ADMIN)
|--------------------------------------------------------------------------
| Papelera (proyectos, formularios, zonas y respuestas anuladas) y correcciones de respuestas.
*/

Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {
    Route::get('/trash/{type}', [DataCenterController::class, 'trash']);
    Route::post('/trash/{type}/{id}/restore', [DataCenterController::class, 'restore']);
    Route::delete('/trash/{type}/{id}', [DataCenterController::class, 'purge']);

    Route::patch('/responses/{responseId}/answer', [DataCenterController::class, 'correctAnswer'])->whereUuid('responseId');
    Route::post('/responses/{responseId}/void', [DataCenterController::class, 'void'])->whereUuid('responseId');
    Route::get('/responses/{responseId}/collectors', [DataCenterController::class, 'collectors'])->whereUuid('responseId');
    Route::patch('/responses/{responseId}/collector', [DataCenterController::class, 'reassign'])->whereUuid('responseId');
});
