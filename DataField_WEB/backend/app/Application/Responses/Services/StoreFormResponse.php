<?php

namespace App\Application\Responses\Services;

use App\Domain\Responses\Services\LocationTraceSanitizer;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\User;
use App\Policies\FormPolicy;
use Illuminate\Support\Facades\DB;
use Throwable;

class StoreFormResponse
{
    public function __construct(
        private readonly ProcessResponseMedia $media,
        private readonly EnqueueResponseSync $sync,
        private readonly LocationTraceSanitizer $traces,
    ) {}

    public function submit(Form $form, ?User $user, array $data, string $submissionId): FormResponse
    {
        $this->media->resetProcessed();
        $hash = hash('sha256', json_encode($this->canonical($data), JSON_THROW_ON_ERROR));

        // 1. Revisión previa sin bloqueo: un reintento o un envío que se va a rechazar no sube archivos.
        $form = Form::whereKey($form->id)->firstOrFail();
        if ($existing = $this->existing($form, $user, $submissionId, $hash)) {
            return $existing;
        }
        $this->guard($form, $user, $data, false);

        // 2. Los archivos se suben ANTES de bloquear el formulario: la latencia de SharePoint no hace
        //    esperar a los demás encuestadores del mismo formulario.
        // El trazado GPS va en su propia columna: no es una respuesta y no debe salir en exportes.
        $trace = $this->traces->sanitize($data['_location_trace'] ?? null);
        unset($data['_location_trace']);
        $processed = $this->media->process($data, $form);
        if (($processed['_project_geofence']['fuera_de_zona'] ?? false) === true) {
            $processed['_requires_supervisor_review'] = true;
        }

        // 3. Con el formulario bloqueado se repiten las comprobaciones (pudo cambiar mientras se subía)
        //    y se guarda. Si algo falla, o el mismo envío llegó por otro lado, se borran los archivos.
        $responseId = null;
        $duplicate = false;
        try {
            $response = DB::transaction(function () use ($form, $user, $data, $submissionId, $hash, $processed, $trace, &$responseId, &$duplicate) {
                $form = Form::whereKey($form->id)->lockForUpdate()->firstOrFail();
                if ($existing = $this->existing($form, $user, $submissionId, $hash)) {
                    $duplicate = true;

                    return $existing;
                }
                $this->guard($form, $user, $data, true);
                $snapshot = $form->only(['title', 'description', 'step_by_step', 'require_consent', 'consent_text']);
                $snapshot['questions'] = $form->questions()->get()->map(fn ($q) => $q->only([
                    'id', 'type', 'label', 'required', 'order', 'options', 'properties', 'section_name', 'parent_question_id', 'branch_rules',
                ]))->all();
                $response = FormResponse::create([
                    'form_id' => $form->id, 'user_id' => $user?->id, 'data' => $processed,
                    'client_submission_id' => $submissionId, 'submission_hash' => $hash,
                    'instrument_snapshot' => $snapshot,
                    'location_trace' => $trace,
                    'trace_started_at' => $trace['started_at'] ?? null,
                    'consent_evidence' => [
                        'required' => (bool) ($form->require_consent ?? true),
                        'accepted' => ($data['_consentimiento_aceptado'] ?? false) === true,
                        'text' => $form->consent_text, 'sha256' => hash('sha256', (string) $form->consent_text),
                        'received_at' => now()->toIso8601String(), 'channel' => $user ? 'authenticated' : 'public',
                    ],
                ]);
                $responseId = $response->id;
                $this->sync->enqueue($response);

                return $response;
            });
        } catch (Throwable $e) {
            if ($responseId === null || ! FormResponse::whereKey($responseId)->exists()) {
                $this->media->deleteProcessed();
            }
            throw $e;
        }
        if ($duplicate) {
            $this->media->deleteProcessed();
        }

        return $response;
    }

    /** Envío ya recibido (incluye anulados): el mismo envío reintentado no se duplica ni falla. */
    private function existing(Form $form, ?User $user, string $submissionId, string $hash): ?FormResponse
    {
        $existing = $form->responses()->withTrashed()->where('client_submission_id', $submissionId)->first();
        if ($existing) {
            abort_unless($existing->user_id === $user?->id && hash_equals($existing->submission_hash, $hash),
                409, __('El identificador de envío ya fue utilizado con otro contenido o cuenta.'));
        }

        return $existing;
    }

    /** Reglas del envío. Con $locked las metas se leen con el formulario bloqueado (la decisión vale). */
    private function guard(Form $form, ?User $user, array $data, bool $locked): void
    {
        if ($user) {
            abort_unless(app(FormPolicy::class)->submit($user->fresh(), $form), 403, __('No tienes permiso para enviar este formulario.'));
        }
        abort_unless($form->state === 'DEPLOYED', 422, __('El formulario no está publicado.'));
        abort_if(($form->start_date && $form->start_date->format('Y-m-d') > now('America/Guayaquil')->toDateString())
            || ($form->end_date && $form->end_date->format('Y-m-d') < now('America/Guayaquil')->toDateString()),
            422, __('El formulario está fuera de su periodo de recolección.'));
        abort_if(($form->require_consent ?? true) && ($data['_consentimiento_aceptado'] ?? null) !== true,
            422, __('Debe aceptarse el consentimiento informado.'));
        $shares = $form->shares()->where('user_id', $user?->id);
        $share = $user ? ($locked ? $shares->lockForUpdate() : $shares)->first() : null;
        if ($share?->target_responses !== null) {
            abort_if($form->responses()->where('user_id', $user->id)->count() >= $share->target_responses,
                422, __('Has alcanzado el límite de respuestas para este formulario.'));
        }
        // Meta de encuestas de la zona: con la fila del formulario bloqueada, la lectura del contador y la
        // inserción (que lo incrementa) no se cruzan con otro envío del formulario. Se usa el contador y no
        // un COUNT: contar miles de respuestas con el bloqueo tomado limitaba los envíos por segundo.
        $zoneId = is_array($data['_project_geofence'] ?? null) ? ($data['_project_geofence']['zone_id'] ?? null) : null;
        $zone = is_string($zoneId) ? $form->zones()->whereKey($zoneId)->first() : null;
        if ($zone && $zone->target_responses !== null) {
            abort_if($zone->responses_received >= $zone->target_responses,
                422, __('La zona «:name» ya alcanzó su meta de :target_responses encuestas.', ['name' => $zone->name, 'target_responses' => $zone->target_responses]));
        }
    }

    private function canonical(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }
        foreach ($value as &$item) {
            if (is_array($item)) {
                $item = $this->canonical($item);
            }
        }

        return $value;
    }
}
