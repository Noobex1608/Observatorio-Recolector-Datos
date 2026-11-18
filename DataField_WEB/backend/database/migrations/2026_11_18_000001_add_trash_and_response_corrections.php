<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Correcciones desde la propia aplicación (sin entrar a la base de datos):
 * - Papelera: proyectos, formularios y zonas se eliminan con borrado suave (deleted_at + deleted_by)
 *   y el superadministrador los restaura o los elimina definitivamente desde el Centro de datos.
 * - Respuestas: se anulan con motivo (deleted_at, void_reason, voided_by) en lugar de borrarse, y las
 *   correcciones de valores quedan en `corrections` (valor anterior, nuevo, motivo, quién y cuándo).
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['projects', 'forms', 'project_zones'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->softDeletes();
                $table->unsignedBigInteger('deleted_by')->nullable();
            });
        }

        Schema::table('form_responses', function (Blueprint $table) {
            $table->softDeletes();
            $table->text('void_reason')->nullable();
            $table->unsignedBigInteger('voided_by')->nullable();
            $table->json('corrections')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('form_responses', function (Blueprint $table) {
            $table->dropSoftDeletes();
            $table->dropColumn(['void_reason', 'voided_by', 'corrections']);
        });

        foreach (['projects', 'forms', 'project_zones'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropSoftDeletes();
                $table->dropColumn('deleted_by');
            });
        }
    }
};
