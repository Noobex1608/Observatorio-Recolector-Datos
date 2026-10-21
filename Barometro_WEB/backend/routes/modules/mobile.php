<?php

use App\Presentation\Http\Controllers\Api\FieldTrackingController;
use App\Presentation\Http\Controllers\Api\FormController;
use Illuminate\Support\Facades\Route;

Route::get('/forms', [FormController::class, 'mobileIndex']);
Route::get('/forms/metadata', [FormController::class, 'mobileMetadata']);
Route::post('/submit', [FormController::class, 'submitMobileResponse'])->middleware('throttle:mobile-form-submit');
Route::post('/field-tracking/start', [FieldTrackingController::class, 'start']);
Route::post('/field-tracking/stop', [FieldTrackingController::class, 'stop']);
Route::post('/field-tracking/report', [FieldTrackingController::class, 'report']);
