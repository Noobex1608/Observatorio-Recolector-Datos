<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Índices para las claves foráneas que el analizador de Supabase reportó sin índice.
 * PostgreSQL no crea índices para las claves foráneas, así que las búsquedas por esas
 * columnas (p. ej. las preguntas de un formulario) recorrían la tabla completa.
 */
return new class extends Migration
{
    /** @var array<string, list<string>> tabla => columnas */
    private const INDICES = [
        'form_questions' => ['form_id', 'parent_question_id'],
        'forms' => ['project_id', 'user_id'],
        'project_zones' => ['project_id', 'technical_sheet_id'],
        'form_user_shares' => ['user_id'],
        'form_user_share_archives' => ['user_id'],
        'project_collectors' => ['user_id'],
        'project_user_delegates' => ['user_id'],
        'project_user_leaders' => ['user_id'],
        'project_user_supervisors' => ['user_id'],
        'project_zone_user_assignments' => ['user_id'],
        'projects' => ['created_by'],
        'project_technical_sheets' => ['created_by', 'validated_by'],
        'form_technical_sheets' => ['created_by', 'validated_by'],
        'perfiles' => ['user_id'],
        'response_sync_queue' => ['user_id'],
    ];

    public function up(): void
    {
        foreach (self::INDICES as $tabla => $columnas) {
            if (! Schema::hasTable($tabla)) {
                continue;
            }

            Schema::table($tabla, function (Blueprint $table) use ($tabla, $columnas) {
                foreach ($columnas as $columna) {
                    if (Schema::hasColumn($tabla, $columna) && ! Schema::hasIndex($tabla, [$columna])) {
                        $table->index($columna, "{$tabla}_{$columna}_fk_index");
                    }
                }
            });
        }
    }

    public function down(): void
    {
        foreach (self::INDICES as $tabla => $columnas) {
            if (! Schema::hasTable($tabla)) {
                continue;
            }

            Schema::table($tabla, function (Blueprint $table) use ($tabla, $columnas) {
                foreach ($columnas as $columna) {
                    $nombre = "{$tabla}_{$columna}_fk_index";
                    if (Schema::hasIndex($tabla, $nombre)) {
                        $table->dropIndex($nombre);
                    }
                }
            });
        }
    }
};
