<?php

use App\Presentation\Http\Controllers\Api\FormController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Form Routes
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/', [FormController::class, 'index']); // list forms
    Route::post('/', [FormController::class, 'store']); // create form
    Route::get('/{id}', [FormController::class, 'show']); // view form details
    Route::put('/{id}', [FormController::class, 'update']); // update form (only if DRAFT/ARCHIVED)
    Route::delete('/{id}', [FormController::class, 'destroy']);
    Route::post('/{id}/clone', [FormController::class, 'cloneForm']);
    Route::post('/{id}/deploy', [FormController::class, 'deploy']); // change to DEPLOYED
    Route::post('/{id}/archive', [FormController::class, 'archive']); // change to ARCHIVED

    // Questions
    Route::get('/{id}/questions', [FormController::class, 'getQuestions']);
    Route::post('/{id}/questions', [FormController::class, 'storeQuestion']);
    Route::put('/questions/{question_id}', [FormController::class, 'updateQuestion']);
    Route::delete('/questions/{question_id}', [FormController::class, 'destroyQuestion']);

    // Sharing
    Route::get('/{id}/shares', [FormController::class, 'getShares']);
    Route::post('/{id}/shares', [FormController::class, 'storeShare']);
    Route::patch('/{id}/shares/{share_id}', [FormController::class, 'updateShare']);
    Route::delete('/{id}/shares/{share_id}', [FormController::class, 'destroyShare']);

    // Responses/Data Management
    Route::get('/{id}/responses', [FormController::class, 'getResponses']);
    Route::get('/{id}/export', [FormController::class, 'exportResponses']); // Export CSV/Excel
    Route::get('/{id}/stats', [FormController::class, 'getStats']); // Graphical data

    // Submit response (requires auth — tracks user_id for target counting)
    Route::post('/submit/{link_uuid}', [FormController::class, 'submitResponse']);
});

// Public: fetch form by link (no auth needed)
Route::get('/fetch/{link_uuid}', [FormController::class, 'fetchForm']);
