<?php

use App\Presentation\Http\Controllers\Api\AccountActivationController;
use App\Presentation\Http\Controllers\Api\AuthController;
use App\Presentation\Http\Controllers\Api\MicrosoftAuthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Auth Routes
|--------------------------------------------------------------------------
*/

// Rutas públicas
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

// Microsoft 365 (cuentas institucionales) y activación de cuentas externas: públicas, con límite de intentos.
Route::get('/auth/providers', [MicrosoftAuthController::class, 'providers']);
Route::get('/auth/microsoft/redirect', [MicrosoftAuthController::class, 'redirect'])->middleware('throttle:20,1');
Route::get('/auth/microsoft/callback', [MicrosoftAuthController::class, 'callback'])->middleware('throttle:20,1');
Route::post('/auth/microsoft/exchange', [MicrosoftAuthController::class, 'exchange'])->middleware('throttle:10,1');
Route::post('/auth/activate', [AccountActivationController::class, 'activate'])->middleware('throttle:5,1');

// Rutas protegidas
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);
});
