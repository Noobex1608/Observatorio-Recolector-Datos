<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * La pantalla de Auditoría lista los registros del más reciente al más antiguo (latest()) y pagina.
 * audit_logs crece con cada acción y no se purga: sin este índice PostgreSQL ordena la tabla
 * completa en cada consulta; con él lee solo la página pedida. Los filtros de fecha comparan
 * created_at por rango (no whereDate) para poder usarlo.
 * En PostgreSQL se crea con CONCURRENTLY (fuera de transacción) para no bloquear el registro de
 * auditoría mientras se construye. Mismo nombre que generaría Laravel.
 */
return new class extends Migration
{
    public $withinTransaction = false;

    private const INDEX = 'audit_logs_created_at_index';

    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS '.self::INDEX.' ON audit_logs (created_at)');

            return;
        }

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->index('created_at', self::INDEX);
        });
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX CONCURRENTLY IF EXISTS '.self::INDEX);

            return;
        }

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex(self::INDEX);
        });
    }
};
