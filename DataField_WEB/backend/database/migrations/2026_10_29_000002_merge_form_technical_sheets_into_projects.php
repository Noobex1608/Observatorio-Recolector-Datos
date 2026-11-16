<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * La ficha técnica vuelve a ser una por proyecto. Las fichas por formulario de cada proyecto se
 * combinan en project_technical_sheets:
 *  - inicio = la fecha de inicio más temprana; fin = la fecha de fin más tardía;
 *  - muestra objetivo = suma de las muestras definidas;
 *  - descripción = las descripciones distintas, con el título del formulario si hay varias;
 *  - queda VALIDADA solo si todas las fichas lo estaban (validador = el de la validación más reciente).
 * form_technical_sheets se conserva intacta como historial.
 */
return new class extends Migration
{
    public function up(): void
    {
        $projectIds = DB::table('forms')
            ->join('form_technical_sheets', 'form_technical_sheets.form_id', '=', 'forms.id')
            ->distinct()->pluck('forms.project_id');

        foreach ($projectIds as $projectId) {
            $sheets = DB::table('form_technical_sheets')
                ->join('forms', 'forms.id', '=', 'form_technical_sheets.form_id')
                ->where('forms.project_id', $projectId)
                ->orderBy('form_technical_sheets.created_at')
                ->get(['form_technical_sheets.*', 'forms.title as form_title']);

            $starts = $sheets->pluck('start_date')->filter()->sort()->values();
            $ends = $sheets->pluck('end_date')->filter()->sort()->values();
            $samples = $sheets->pluck('target_sample_size')->filter(fn ($value) => $value !== null);

            $withDescription = $sheets->filter(fn ($sheet) => trim((string) $sheet->description) !== '');
            $distinct = $withDescription->unique(fn ($sheet) => trim((string) $sheet->description));
            $description = $distinct->count() <= 1
                ? ($distinct->first()?->description)
                : $distinct->map(fn ($sheet) => "{$sheet->form_title}: ".trim((string) $sheet->description))->implode("\n\n");

            $allValidated = $sheets->every(fn ($sheet) => $sheet->status === 'VALIDATED')
                && $starts->isNotEmpty() && $ends->isNotEmpty();
            $lastValidation = $sheets->where('status', 'VALIDATED')->sortByDesc('validated_at')->first();

            $values = [
                'description' => $description,
                'start_date' => $starts->first(),
                'end_date' => $ends->last(),
                'target_sample_size' => $samples->isEmpty() ? null : (int) $samples->sum(),
                'status' => $allValidated ? 'VALIDATED' : 'DRAFT',
                'validated_by' => $allValidated ? $lastValidation?->validated_by : null,
                'validated_at' => $allValidated ? $lastValidation?->validated_at : null,
                'updated_at' => now(),
            ];

            $existing = DB::table('project_technical_sheets')->where('project_id', $projectId)->first();
            if ($existing) {
                DB::table('project_technical_sheets')->where('id', $existing->id)->update($values);
            } else {
                DB::table('project_technical_sheets')->insert($values + [
                    'id' => (string) Str::uuid(),
                    'project_id' => $projectId,
                    'created_by' => $sheets->first()->created_by,
                    'created_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        // Las fichas por formulario nunca se borraron; no hay nada que deshacer en ellas.
    }
};
