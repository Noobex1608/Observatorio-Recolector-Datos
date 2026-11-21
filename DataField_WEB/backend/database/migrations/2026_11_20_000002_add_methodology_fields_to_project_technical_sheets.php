<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * La ficha del proyecto pasa a ser la «ficha metodológica» del proyecto: objetivo general y
 * específicos, población de estudio, cobertura geográfica y técnica e instrumento.
 * La antigua descripción libre se copia al objetivo general para no perderla; la columna
 * description queda como historial. Las fichas ya validadas siguen validadas.
 */
return new class extends Migration
{
    private const FIELDS = [
        'general_objective', 'specific_objectives', 'study_population',
        'geographic_coverage', 'technique_instrument',
    ];

    public function up(): void
    {
        Schema::table('project_technical_sheets', function (Blueprint $table) {
            foreach (self::FIELDS as $field) {
                $table->text($field)->nullable();
            }
        });

        DB::table('project_technical_sheets')
            ->whereNotNull('description')
            ->update(['general_objective' => DB::raw('description')]);
    }

    public function down(): void
    {
        Schema::table('project_technical_sheets', function (Blueprint $table) {
            $table->dropColumn(self::FIELDS);
        });
    }
};
