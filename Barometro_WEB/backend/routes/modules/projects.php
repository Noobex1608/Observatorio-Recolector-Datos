<?php

use App\Presentation\Http\Controllers\Api\ProjectController;
use App\Presentation\Http\Controllers\Api\ProjectCollectorController;
use App\Presentation\Http\Controllers\Api\ProjectSupervisionController;
use App\Presentation\Http\Controllers\Api\ProjectTechnicalSheetController;
use App\Presentation\Http\Controllers\Api\ProjectZoneController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/', [ProjectController::class, 'index']);
    Route::post('/', [ProjectController::class, 'store']);
    Route::get('/leaders', [ProjectController::class, 'leaders']);
    Route::get('/{id}/assignable-users', [ProjectController::class, 'assignableUsers']);
    Route::get('/{id}/collectors/template', [ProjectCollectorController::class, 'template']);
    Route::post('/{id}/collectors/import', [ProjectCollectorController::class, 'import']);
    Route::get('/{id}/collectors', [ProjectCollectorController::class, 'index']);
    Route::get('/{id}/collectors/ids', [ProjectCollectorController::class, 'ids']);
    Route::get('/{id}/collectors/candidates', [ProjectCollectorController::class, 'candidates']);
    Route::post('/{id}/collectors/attach', [ProjectCollectorController::class, 'attach']);
    Route::patch('/{id}/collectors/{userId}', [ProjectCollectorController::class, 'update']);
    Route::delete('/{id}/collectors/{userId}', [ProjectCollectorController::class, 'destroy']);
    Route::post('/{id}/collectors/assign-forms', [ProjectCollectorController::class, 'assignForms']);
    Route::get('/{id}', [ProjectController::class, 'show']);
    Route::put('/{id}', [ProjectController::class, 'update']);
    Route::delete('/{id}', [ProjectController::class, 'destroy']);
    Route::get('/{projectId}/supervision/collectors', [ProjectSupervisionController::class, 'collectors']);
    Route::get('/{projectId}/supervision/collectors/{userId}', [ProjectSupervisionController::class, 'route'])->whereNumber('userId');

    // Ficha Técnica General
    Route::prefix('/{projectId}/technical-sheet')->group(function () {
        Route::get('/', [ProjectTechnicalSheetController::class, 'show']);
        Route::post('/', [ProjectTechnicalSheetController::class, 'store']);
        Route::post('/validate', [ProjectTechnicalSheetController::class, 'validateSheet']);
    });

    // Zonas de Levantamiento y Asignación Multizona
    Route::prefix('/{projectId}/zones')->group(function () {
        Route::get('/', [ProjectZoneController::class, 'index']);
        Route::post('/', [ProjectZoneController::class, 'store']);
        Route::post('/bulk-assign', [ProjectZoneController::class, 'bulkAssign']);
        Route::post('/random-assign', [ProjectZoneController::class, 'randomAssign']);
        Route::get('/{zoneId}', [ProjectZoneController::class, 'show']);
        Route::put('/{zoneId}', [ProjectZoneController::class, 'update']);
        Route::delete('/{zoneId}', [ProjectZoneController::class, 'destroy']);
    });
});
