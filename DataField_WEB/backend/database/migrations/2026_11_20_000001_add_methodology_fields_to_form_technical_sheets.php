<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ficha técnica por formulario (metodología del levantamiento): universo objetivo, cobertura
 * geográfica, tamaño muestral, margen de error y confianza, técnica de campo y control de calidad.
 * La valida el líder o el delegado del proyecto. Convive con la ficha del proyecto (periodo y muestra).
 *
 * Las filas existentes eran el historial de las fichas antiguas por formulario: su validación no
 * cubre estos parámetros, así que vuelven a borrador.
 */
return new class extends Migration
{
    private const FIELDS = [
        'target_universe', 'geographic_coverage', 'sample_size',
        'error_margin_confidence', 'field_technique', 'quality_control',
    ];

    public function up(): void
    {
        Schema::table('form_technical_sheets', function (Blueprint $table) {
            foreach (self::FIELDS as $field) {
                $table->text($field)->nullable();
            }
        });

        DB::table('form_technical_sheets')->update([
            'status' => 'DRAFT', 'validated_by' => null, 'validated_at' => null,
        ]);
    }

    public function down(): void
    {
        Schema::table('form_technical_sheets', function (Blueprint $table) {
            $table->dropColumn(self::FIELDS);
        });
    }
};
