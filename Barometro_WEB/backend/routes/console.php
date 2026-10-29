<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('responses:sync-pending {--limit=200}', function () {
    $this->call(\App\Console\Commands\SyncPendingResponses::class, [
        '--limit' => (int) $this->option('limit'),
    ]);
})->purpose('Despacha respuestas pendientes para sincronizar en Supabase');

Artisan::command('forms:schema-sync-all {--limit=500}', function () {
    $this->call(\App\Console\Commands\SyncAllFormsSchema::class, [
        '--limit' => (int) $this->option('limit'),
    ]);
})->purpose('Encola sincronizacion de estructura de formularios hacia Supabase');

Artisan::command('forms:update-lifecycle', function () {
    $this->call(\App\Console\Commands\UpdateFormLifecycle::class);
})->purpose('Actualiza automáticamente el estado de los formularios según sus fechas de inicio y fin');

\Illuminate\Support\Facades\Schedule::command('forms:update-lifecycle')->everyMinute();

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
