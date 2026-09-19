<?php

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| Active API surface for the forms platform.
|--------------------------------------------------------------------------
*/

Route::get('/health', fn() => response()->json([
    'ok' => true,
    'ts' => now()->toIso8601String(),
]));

Route::get('/documentation', function () {
    $path = storage_path('api-docs/api-docs.json');
    if (!File::exists($path)) {
        return response()->json(['error' => 'Documentacion no generada. Ejecuta: php artisan swagger:generate'], 404);
    }

    return response()->file($path, [
        'Content-Type' => 'application/json',
        'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma' => 'no-cache',
        'Expires' => '0',
    ]);
});

Route::get('/docs', fn() => response()
    ->view('swagger')
    ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    ->header('Pragma', 'no-cache')
    ->header('Expires', '0'));

Route::get('/avatars/{filename}', function (string $filename) {
    $path = 'public/avatars/' . $filename;

    if (!Storage::exists($path)) {
        return response()->json(['message' => 'Avatar no encontrado'], 404)
            ->header('Access-Control-Allow-Origin', '*')
            ->header('Cross-Origin-Resource-Policy', 'cross-origin');
    }

    $file = Storage::get($path);
    $mimeType = Storage::mimeType($path);

    return response($file, 200)
        ->header('Content-Type', $mimeType)
        ->header('Cache-Control', 'public, max-age=31536000')
        ->header('Access-Control-Allow-Origin', '*')
        ->header('Cross-Origin-Resource-Policy', 'cross-origin');
})->where('filename', '.*');

require __DIR__ . '/modules/auth.php';
require __DIR__ . '/modules/profile.php';
require __DIR__ . '/modules/seed.php';

Route::prefix('forms')->group(__DIR__ . '/modules/forms.php');

Route::middleware('auth:sanctum')->prefix('mobile')->group(__DIR__ . '/modules/mobile.php');
Route::prefix('projects')->group(__DIR__ . '/modules/projects.php');
Route::prefix('users')->group(__DIR__ . '/modules/users.php');
