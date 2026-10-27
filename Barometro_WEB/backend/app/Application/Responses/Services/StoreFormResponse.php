<?php
namespace App\Application\Responses\Services;

use App\Models\Form;
use App\Models\FormResponse;
use App\Models\User;
use App\Policies\FormPolicy;
use Illuminate\Support\Facades\DB;
use Throwable;

class StoreFormResponse
{
    public function __construct(private readonly ProcessResponseMedia $media, private readonly EnqueueResponseSync $sync) {}

    public function submit(Form $form, ?User $user, array $data, string $submissionId): FormResponse
    {
        $this->media->resetProcessed();
        $responseId = null;
        try {
            return DB::transaction(function () use ($form, $user, $data, $submissionId, &$responseId) {
                $form = Form::whereKey($form->id)->lockForUpdate()->firstOrFail();
                if ($user) {
                    abort_unless(app(FormPolicy::class)->submit($user->fresh(), $form), 403, 'No tienes permiso para enviar este formulario.');
                }
                $hash = hash('sha256', json_encode($this->canonical($data), JSON_THROW_ON_ERROR));
                $existing = $form->responses()->where('client_submission_id', $submissionId)->first();
                if ($existing) {
                    abort_unless($existing->user_id === $user?->id && hash_equals($existing->submission_hash, $hash),
                        409, 'El identificador de envío ya fue utilizado con otro contenido o cuenta.');
                    return $existing;
                }
                abort_unless($form->state === 'DEPLOYED', 422, 'El formulario no está publicado.');
                abort_if(($form->start_date && $form->start_date->format('Y-m-d') > now('America/Guayaquil')->toDateString())
                    || ($form->end_date && $form->end_date->format('Y-m-d') < now('America/Guayaquil')->toDateString()),
                    422, 'El formulario está fuera de su periodo de recolección.');
                abort_if(($form->require_consent ?? true) && ($data['_consentimiento_aceptado'] ?? null) !== true,
                    422, 'Debe aceptarse el consentimiento informado.');
                $share = $user ? $form->shares()->where('user_id', $user->id)->lockForUpdate()->first() : null;
                if ($share?->target_responses !== null) {
                    abort_if($form->responses()->where('user_id', $user->id)->count() >= $share->target_responses,
                        422, 'Has alcanzado el límite de respuestas para este formulario.');
                }
                $processed = $this->media->process($data, $form);
                if (($processed['_project_geofence']['fuera_de_zona'] ?? false) === true) {
                    $processed['_requires_supervisor_review'] = true;
                }
                $snapshot = $form->only(['title', 'description', 'step_by_step', 'require_consent', 'consent_text']);
                $snapshot['questions'] = $form->questions()->get()->map(fn ($q) => $q->only([
                    'id', 'type', 'label', 'required', 'order', 'options', 'properties', 'section_name', 'parent_question_id', 'branch_rules',
                ]))->all();
                $response = FormResponse::create([
                    'form_id' => $form->id, 'user_id' => $user?->id, 'data' => $processed,
                    'client_submission_id' => $submissionId, 'submission_hash' => $hash,
                    'instrument_snapshot' => $snapshot,
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
    }

    private function canonical(array $value): array
    {
        if (! array_is_list($value)) { ksort($value); }
        foreach ($value as &$item) {
            if (is_array($item)) { $item = $this->canonical($item); }
        }
        return $value;
    }
}
