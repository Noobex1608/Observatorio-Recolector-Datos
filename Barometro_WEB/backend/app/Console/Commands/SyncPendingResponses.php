<?php

namespace App\Console\Commands;

use App\Jobs\SyncFormResponseToSupabase;
use App\Models\ResponseSyncQueue;
use Illuminate\Console\Command;

class SyncPendingResponses extends Command
{
    protected $signature = 'responses:sync-pending {--limit=200 : Maximo de registros por corrida}';

    protected $description = 'Despacha reintentos de respuestas pendientes para Supabase';

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));

        $pending = ResponseSyncQueue::query()
            ->where('status', 'pending')
            ->where(function ($query) {
                $query->whereNull('next_retry_at')
                    ->orWhere('next_retry_at', '<=', now());
            })
            ->orderBy('created_at')
            ->limit($limit)
            ->get(['id']);

        foreach ($pending as $item) {
            SyncFormResponseToSupabase::dispatch($item->id);
        }

        $this->info('Despachadas ' . $pending->count() . ' respuesta(s).');

        return self::SUCCESS;
    }
}

