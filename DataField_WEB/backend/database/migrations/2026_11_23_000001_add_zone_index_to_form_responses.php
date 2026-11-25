<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Índice para contar encuestas por zona sin recorrer form_responses completa.
 * La PWA pide esos conteos en cada sincronización (/api/mobile/forms y /metadata) y el cierre por
 * meta de zona los usa al guardar. No es parcial a propósito: con un índice parcial PostgreSQL no
 * tiene estadísticas de la expresión, supone que casi todas las filas tienen zona y recorre la tabla.
 * La expresión debe coincidir con la de las consultas (data->'_project_geofence'->>'zone_id').
 * CONCURRENTLY: no bloquea los envíos mientras se construye; por eso corre fuera de transacción.
 * Si falla a medias deja un índice INVALID: el IF NOT EXISTS no lo repara, hay que borrarlo
 * (DROP INDEX CONCURRENTLY form_responses_form_zone_index) y volver a migrar.
 * Solo PostgreSQL; en SQLite (pruebas) no hace falta.
 */
return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(<<<'SQL'
            CREATE INDEX CONCURRENTLY IF NOT EXISTS form_responses_form_zone_index
            ON form_responses (form_id, ((data->'_project_geofence'->>'zone_id')))
        SQL);
        DB::statement('ANALYZE form_responses');
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX CONCURRENTLY IF EXISTS form_responses_form_zone_index');
    }
};
