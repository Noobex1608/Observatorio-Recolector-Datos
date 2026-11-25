<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Contador de respuestas vigentes (no anuladas) por zona, para la meta de la zona.
 * Cada envío bloquea la fila del formulario; contar las respuestas de la zona con ese bloqueo
 * tomado (miles de filas) limitaba cuántos envíos por segundo admitía cada formulario. Con el
 * contador la comprobación lee una fila. Lo mantiene FormResponse (al crear, anular, restaurar).
 * Las pantallas siguen contando desde form_responses (índice form_responses_form_zone_index).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_zones', function (Blueprint $table) {
            $table->unsignedInteger('responses_received')->default(0);
        });

        $zoneId = DB::connection()->getDriverName() === 'pgsql'
            ? "form_responses.data->'_project_geofence'->>'zone_id'"
            : "json_extract(form_responses.data, '$._project_geofence.zone_id')";
        DB::statement(<<<SQL
            UPDATE project_zones SET responses_received = (
                SELECT COUNT(*) FROM form_responses
                WHERE form_responses.form_id = project_zones.form_id
                  AND {$zoneId} = CAST(project_zones.id AS TEXT)
                  AND form_responses.deleted_at IS NULL
            )
            WHERE project_zones.form_id IS NOT NULL
        SQL);
    }

    public function down(): void
    {
        Schema::table('project_zones', function (Blueprint $table) {
            $table->dropColumn('responses_received');
        });
    }
};
