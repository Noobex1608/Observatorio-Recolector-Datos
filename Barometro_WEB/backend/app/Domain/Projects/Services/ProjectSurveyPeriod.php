<?php

declare(strict_types=1);

namespace App\Domain\Projects\Services;

use App\Models\ProjectTechnicalSheet;

/**
 * Reglas de la ficha técnica única por proyecto: su validación habilita el trabajo en todos los
 * formularios del proyecto, y su periodo enmarca las fechas propias de cada formulario.
 */
class ProjectSurveyPeriod
{
    public function sheet(?string $projectId): ?ProjectTechnicalSheet
    {
        return $projectId ? ProjectTechnicalSheet::where('project_id', $projectId)->first() : null;
    }

    public function isValidated(?string $projectId): bool
    {
        return $this->sheet($projectId)?->status === 'VALIDATED';
    }

    /**
     * Las fechas del formulario deben caer dentro del periodo de la ficha del proyecto (si lo tiene).
     * Fechas vacías se aceptan: al publicar se completan con las del proyecto.
     */
    public function assertWithin(?string $projectId, ?string $startDate, ?string $endDate): void
    {
        $sheet = $this->sheet($projectId);
        if (! $sheet?->start_date || ! $sheet->end_date) {
            return;
        }
        $from = $sheet->start_date->format('Y-m-d');
        $to = $sheet->end_date->format('Y-m-d');
        $outside = ($startDate && ($startDate < $from || $startDate > $to))
            || ($endDate && ($endDate < $from || $endDate > $to));
        abort_if($outside, 422, sprintf(
            'Las fechas del formulario deben estar dentro del periodo del proyecto (%s al %s).',
            $sheet->start_date->format('d/m/Y'), $sheet->end_date->format('d/m/Y'),
        ));
    }
}
