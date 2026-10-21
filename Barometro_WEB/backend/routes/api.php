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

Route::get('/health', function () {
    try {
        \Illuminate\Support\Facades\DB::select('SELECT 1');

        return response()->json(['ok' => true, 'ts' => now()->toIso8601String()]);
    } catch (\Throwable) {
        return response()->json(['ok' => false], 503);
    }
});

Route::get('/documentation', function () {
    $path = storage_path('api-docs/api-docs.json');
    if (! File::exists($path)) {
        return response()->json(['error' => 'Documentacion no generada. Ejecuta: php artisan swagger:generate'], 404);
    }

    return response()->file($path, [
        'Content-Type' => 'application/json',
        'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma' => 'no-cache',
        'Expires' => '0',
    ]);
});

Route::get('/docs', fn () => response()
    ->view('swagger')
    ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    ->header('Pragma', 'no-cache')
    ->header('Expires', '0'));

Route::get('/avatars/{filename}', function (string $filename) {
    $path = 'avatars/'.$filename;
    $disk = Storage::disk('public');

    if (! $disk->exists($path)) {
        return response()->json(['message' => 'Avatar no encontrado'], 404)
            ->header('Access-Control-Allow-Origin', '*')
            ->header('Cross-Origin-Resource-Policy', 'cross-origin');
    }

    $file = $disk->get($path);
    $mimeType = $disk->mimeType($path);

    return response($file, 200)
        ->header('Content-Type', $mimeType)
        ->header('Cache-Control', 'public, max-age=31536000')
        ->header('Access-Control-Allow-Origin', '*')
        ->header('Cross-Origin-Resource-Policy', 'cross-origin');
})->where('filename', '[a-zA-Z0-9_\-\.]+');

require __DIR__.'/modules/auth.php';
require __DIR__.'/modules/profile.php';

Route::prefix('forms')->group(__DIR__.'/modules/forms.php');

Route::middleware('auth:sanctum')->prefix('mobile')->group(__DIR__.'/modules/mobile.php');
Route::prefix('projects')->group(__DIR__.'/modules/projects.php');
Route::prefix('users')->group(__DIR__.'/modules/users.php');
Route::prefix('audit-logs')->group(__DIR__.'/modules/audit.php');
