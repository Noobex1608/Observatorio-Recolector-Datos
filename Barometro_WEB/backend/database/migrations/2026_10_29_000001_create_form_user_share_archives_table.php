<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Accesos de recolector retirados (por quedarse sin zona o salir del equipo del proyecto).
 * Guarda la meta personal como borrador inactivo para restaurarla si la persona vuelve al formulario.
 * No da acceso a nada: los permisos solo se leen de form_user_shares.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('form_user_share_archives', function (Blueprint $table) {
            $table->id();
            $table->uuid('form_id');
            $table->foreignId('user_id');
            $table->string('role', 30);
            $table->unsignedInteger('target_responses')->nullable();
            $table->timestamp('archived_at');
            $table->timestamps();
            $table->foreign('form_id')->references('id')->on('forms')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['form_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('form_user_share_archives');
    }
};
