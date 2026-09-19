<?php

namespace App\Application\Forms\Services;

use App\Jobs\SyncFormSchemaToSupabase;
use App\Models\Form;

class EnqueueFormSchemaSync
{
    public function enqueueById(string $formId, string $action = 'upsert'): void
    {
        SyncFormSchemaToSupabase::dispatch($formId, $action);
    }

    public function enqueue(Form $form): void
    {
        $this->enqueueById($form->id, 'upsert');
    }
}

