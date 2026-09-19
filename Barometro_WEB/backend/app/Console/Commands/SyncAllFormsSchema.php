<?php

namespace App\Console\Commands;

use App\Application\Forms\Services\EnqueueFormSchemaSync;
use App\Models\Form;
use Illuminate\Console\Command;

class SyncAllFormsSchema extends Command
{
    protected $signature = 'forms:schema-sync-all {--limit=500 : Maximo de formularios por corrida}';

    protected $description = 'Encola sincronizacion de estructura (surveys/questions) para todos los formularios';

    public function handle(EnqueueFormSchemaSync $sync): int
    {
        $limit = max(1, (int) $this->option('limit'));

        $forms = Form::query()
            ->orderBy('updated_at', 'desc')
            ->limit($limit)
            ->get(['id']);

        foreach ($forms as $form) {
            $sync->enqueueById($form->id, 'upsert');
        }

        $this->info('Encolados ' . $forms->count() . ' formulario(s).');

        return self::SUCCESS;
    }
}

