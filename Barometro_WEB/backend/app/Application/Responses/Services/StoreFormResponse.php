<?php

declare(strict_types=1);

namespace App\Application\Responses\Services;

use App\Models\Form;
use App\Models\FormResponse;
use App\Models\FormUserShare;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Throwable;

class StoreFormResponse
{
    public function __construct(
        private readonly ProcessResponseMedia $media,
        private readonly EnqueueResponseSync $sync,
    ) {}

    public function submit(Form $form, ?User $user, array $data): FormResponse
    {
        $processed = $this->media->process($data, $form);
        if (($processed['_project_geofence']['fuera_de_zona'] ?? false) === true) {
            $processed['_requires_supervisor_review'] = true;
        }

        $responseId = null;
        try {
            return DB::transaction(function () use ($form, $user, $processed, &$responseId) {
                if ($user) {
                    // La fila compartida serializa los envíos simultáneos del mismo encuestador.
                    $share = FormUserShare::where('form_id', $form->id)
                        ->where('user_id', $user->id)->lockForUpdate()->first();
                    if ($share?->target_responses !== null) {
                        $count = FormResponse::where('form_id', $form->id)
                            ->where('user_id', $user->id)->count();
                        abort_if($count >= $share->target_responses, 422,
                            'Has alcanzado el límite de respuestas para este formulario.');
                    }
                }

                $response = FormResponse::create([
                    'form_id' => $form->id,
                    'user_id' => $user?->id,
                    'data' => $processed,
                ]);
                $responseId = $response->id;
                $this->sync->enqueue($response);

                return $response;
            });
        } catch (Throwable $e) {
            // Un callback afterCommit puede fallar después de persistir la respuesta.
            // En ese caso el medio ya está referenciado y no debe eliminarse.
            if ($responseId === null || ! FormResponse::whereKey($responseId)->exists()) {
                $this->media->deleteProcessed();
            }
            throw $e;
        }
    }
}
