<?php

use App\Presentation\Http\Controllers\Api\AuditLogController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Audit Routes (SuperAdmin only)
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/', [AuditLogController::class, 'index']);
    Route::get('/stats', [AuditLogController::class, 'getStats']);
    Route::get('/permissions', [AuditLogController::class, 'getPermissionsSummary']);
});
