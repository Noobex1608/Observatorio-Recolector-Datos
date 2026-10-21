<?php

namespace App\Domain\Forms\Services;

use App\Application\Forms\Services\EnqueueFormSchemaSync;
use App\Models\Form;
use Carbon\Carbon;

class FormLifecycleService
{
    public function __construct(private readonly EnqueueFormSchemaSync $schemaSync) {}

    /**
     * Solo archiva formularios ya publicados cuando termina su vigencia.
     * Un borrador nunca se publica por una fecha: requiere la acción explícita del líder.
     */
    public function syncStates(): void
    {
        $today = Carbon::today('America/Guayaquil')->format('Y-m-d');

        // 1. Archivar formularios cuya fecha fin ya pasó
        $formsToArchive = Form::query()
            ->whereNotNull('end_date')
            ->where('end_date', '<', $today)
            ->where('state', 'DEPLOYED')
            ->get();

        foreach ($formsToArchive as $form) {
            $form->update([
                'state' => 'ARCHIVED',
            ]);
            $this->schemaSync->enqueue($form);
        }

    }

    /**
     * Resuelve el estado adecuado para un formulario en particular según sus fechas.
     */
    public function resolveStateForForm(Form $form): Form
    {
        $today = Carbon::today('America/Guayaquil')->format('Y-m-d');

        if ($form->state === 'DEPLOYED' && $form->end_date && $form->end_date->format('Y-m-d') < $today) {
            if ($form->state !== 'ARCHIVED') {
                $form->update(['state' => 'ARCHIVED']);
                $this->schemaSync->enqueue($form);
            }

            return $form;
        }

        return $form;
    }
}
