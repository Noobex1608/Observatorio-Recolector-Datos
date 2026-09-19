<?php

use App\Presentation\Http\Controllers\Api\SeedController;
use Illuminate\Support\Facades\Route;

Route::prefix('seed')->group(function () {
    Route::post('/admin', [SeedController::class, 'seedAdmin']);
});
