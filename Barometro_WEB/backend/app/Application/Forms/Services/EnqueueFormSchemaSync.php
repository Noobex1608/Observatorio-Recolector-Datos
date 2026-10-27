<?php

namespace App\Application\Forms\Services;

use App\Jobs\SyncFormSchemaToSupabase;
use App\Models\Form;

class EnqueueFormSchemaSync
{
    public function enqueueById(string $formId, string $action = 'upsert'): void
    {
        if (! config('services.supabase.form_schema_sync_enabled')) {
            return;
        }

        $job = SyncFormSchemaToSupabase::dispatch($formId, $action)->afterCommit();
        if (config('queue.default') === 'sync') {
            // A remote outage must not turn a successful form save into HTTP 500.
            $job->onConnection('database');
        }
    }

    public function enqueue(Form $form): void
    {
        $this->enqueueById($form->id, 'upsert');
    }
}
