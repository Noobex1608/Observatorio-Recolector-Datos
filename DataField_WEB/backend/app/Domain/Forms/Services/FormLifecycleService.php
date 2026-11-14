<?php

namespace App\Domain\Forms\Services;

use App\Application\Forms\Services\EnqueueFormSchemaSync;
use App\Models\Form;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

class FormLifecycleService
{
    public function __construct(private readonly EnqueueFormSchemaSync $schemaSync) {}

    /**
     * Versión para el camino de una petición HTTP: ejecuta syncStates() como mucho una vez por minuto.
     * El planificador (forms:update-lifecycle, cada minuto) es quien archiva normalmente; esto queda
     * como respaldo por si el planificador no corre, sin escribir en la base en cada listado.
     * El envío de respuestas valida las fechas por su cuenta (StoreFormResponse), así que este margen
     * de hasta un minuto no permite recibir datos fuera de periodo.
     */
    public function syncStatesIfDue(): void
    {
        if (Cache::add('forms:lifecycle-sync', true, now()->addMinute())) {
            $this->syncStates();
        }
    }

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
