<?php

use App\Presentation\Http\Controllers\Api\FormController;
use Illuminate\Support\Facades\Route;

Route::get('/forms', [FormController::class, 'mobileIndex']);
Route::get('/forms/metadata', [FormController::class, 'mobileMetadata']);
