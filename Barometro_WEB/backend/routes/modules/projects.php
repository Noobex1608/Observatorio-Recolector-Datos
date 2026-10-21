<?php

use App\Presentation\Http\Controllers\Api\FieldTrackingController;
use App\Presentation\Http\Controllers\Api\ProjectController;
use App\Presentation\Http\Controllers\Api\ProjectTechnicalSheetController;
use App\Presentation\Http\Controllers\Api\ProjectZoneController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/', [ProjectController::class, 'index']);
    Route::post('/', [ProjectController::class, 'store']);
    Route::get('/leaders', [ProjectController::class, 'leaders']);
    Route::get('/{id}/assignable-users', [ProjectController::class, 'assignableUsers']);
    Route::get('/{id}', [ProjectController::class, 'show']);
    Route::put('/{id}', [ProjectController::class, 'update']);
    Route::delete('/{id}', [ProjectController::class, 'destroy']);
    Route::get('/{projectId}/monitor', [FieldTrackingController::class, 'monitor']);

    // Ficha Técnica General
    Route::prefix('/{projectId}/technical-sheet')->group(function () {
        Route::get('/', [ProjectTechnicalSheetController::class, 'show']);
        // Las fichas generales antiguas se conservan solo para consulta histórica.
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
