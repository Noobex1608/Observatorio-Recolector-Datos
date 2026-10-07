<?php

namespace App\Domain\Forms\Services;

use App\Models\Form;
use Carbon\Carbon;
use Illuminate\Support\Str;

class FormLifecycleService
{
    /**
     * Sincroniza automáticamente los estados de todos los formularios en base a sus fechas.
     * - Fecha fin superada (today > end_date) -> ARCHIVED
     * - Fecha inicio alcanzada (today >= start_date) y aún no superada la fecha fin -> DEPLOYED
     */
    public function syncStates(): void
    {
        $today = Carbon::today()->format('Y-m-d');

        // 1. Archivar formularios cuya fecha fin ya pasó
        $formsToArchive = Form::query()
            ->whereNotNull('end_date')
            ->where('end_date', '<', $today)
            ->where('state', '!=', 'ARCHIVED')
            ->get();

        foreach ($formsToArchive as $form) {
            $form->update([
                'state' => 'ARCHIVED',
            ]);
        }

        // 2. Implementar formularios cuya fecha inicio ya llegó y no están archivados ni vencidos
        $formsToDeploy = Form::query()
            ->whereNotNull('start_date')
            ->where('start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('end_date')
                  ->orWhere('end_date', '>=', $today);
            })
            ->where('state', 'DRAFT')
            ->get();

        foreach ($formsToDeploy as $form) {
            $form->update([
                'state' => 'DEPLOYED',
                'link_uuid' => $form->link_uuid ?? (string) Str::uuid(),
            ]);
        }
    }

    /**
     * Resuelve el estado adecuado para un formulario en particular según sus fechas.
     */
    public function resolveStateForForm(Form $form): Form
    {
        $today = Carbon::today()->format('Y-m-d');

        if ($form->end_date && $form->end_date->format('Y-m-d') < $today) {
            if ($form->state !== 'ARCHIVED') {
                $form->update(['state' => 'ARCHIVED']);
            }
            return $form;
        }

        if ($form->start_date && $form->start_date->format('Y-m-d') <= $today) {
            if ($form->state === 'DRAFT') {
                $form->update([
                    'state' => 'DEPLOYED',
                    'link_uuid' => $form->link_uuid ?? (string) Str::uuid(),
                ]);
            }
            return $form;
        }

        return $form;
    }
}
