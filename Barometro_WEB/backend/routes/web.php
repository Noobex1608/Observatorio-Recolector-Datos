<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'name' => 'Observatorio ULEAM Forms API',
        'docs' => url('/api/docs'),
        'health' => url('/api/health'),
    ]);
});

// Ruta de login (requerida por Sanctum para redirección)
Route::get('/login', function () {
    return response()->json(['message' => 'No autenticado.'], 401);
})->name('login');
