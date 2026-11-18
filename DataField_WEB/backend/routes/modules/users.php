<?php

use App\Presentation\Http\Controllers\Api\AccessRequestController;
use App\Presentation\Http\Controllers\Api\AccountActivationController;
use App\Presentation\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| User Routes (Admin Only)
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->group(function () {
    // Solicitudes de acceso de cuentas ULEAM (Microsoft 365) sin registrar. Antes de /{id} para no chocar.
    Route::get('/access-requests', [AccessRequestController::class, 'index']);
    Route::post('/access-requests/approve', [AccessRequestController::class, 'approveBatch']);
    Route::post('/access-requests/reject', [AccessRequestController::class, 'rejectBatch']);
    Route::post('/access-requests/{id}/approve', [AccessRequestController::class, 'approve'])->whereNumber('id');
    Route::post('/access-requests/{id}/reject', [AccessRequestController::class, 'reject'])->whereNumber('id');

    Route::get('/', [UserController::class, 'index']);
    Route::post('/', [UserController::class, 'store']);
    Route::get('/{id}', [UserController::class, 'show']);
    Route::put('/{id}', [UserController::class, 'update']);
    Route::delete('/{id}', [UserController::class, 'destroy']);
    Route::patch('/{id}/role', [UserController::class, 'updateRole']);
    Route::patch('/{id}/status', [UserController::class, 'toggleStatus']);
    Route::post('/{id}/restore', [UserController::class, 'restore'])->whereNumber('id');
    Route::post('/{id}/microsoft/unlink', [UserController::class, 'unlinkMicrosoft'])->whereNumber('id');
    Route::post('/{id}/invitation', [AccountActivationController::class, 'resend'])->middleware('throttle:10,1');
});
