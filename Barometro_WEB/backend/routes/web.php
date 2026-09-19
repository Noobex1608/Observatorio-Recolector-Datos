<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

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

// Ruta para servir archivos de storage con CORS (desarrollo)
Route::get('/storage/{path}', function (string $path) {
    $fullPath = storage_path('app/public/' . $path);

    if (!file_exists($fullPath)) {
        abort(404);
    }

    $mimeType = mime_content_type($fullPath);
    $content = file_get_contents($fullPath);

    return response($content, 200)
        ->header('Content-Type', $mimeType)
        ->header('Access-Control-Allow-Origin', '*')
        ->header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        ->header('Access-Control-Allow-Headers', '*');
})->where('path', '.*');
