<?php

namespace App\Jobs;

use App\Application\Forms\Contracts\SupabaseFormSchemaWriter;
use App\Application\Forms\Services\FormSchemaPayloadFactory;
use App\Models\Form;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class SyncFormSchemaToSupabase implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public int $backoff = 30;

    public function __construct(public string $formId, public string $action = 'upsert') {}

    public function handle(SupabaseFormSchemaWriter $writer, FormSchemaPayloadFactory $payloadFactory): void
    {
        if (! config('services.supabase.form_schema_sync_enabled')) {
            return;
        }

        try {
            if ($this->action === 'delete') {
                $writer->deleteSurvey($this->formId);

                return;
            }

            $form = Form::with(['questions' => fn ($q) => $q->orderBy('order')])->find($this->formId);
            if (! $form) {
                return;
            }

            $writer->syncSchema($payloadFactory->surveyFromForm($form), $payloadFactory->questionsFromForm($form));
        } catch (Throwable $e) {
            Log::warning("Sincronización opcional con Supabase no completada para el formulario {$this->formId}: ".$e->getMessage());
            throw $e;
        }
    }
}
