<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El recorrido del encuestador se guarda dentro de cada respuesta (trazado GPS tomado mientras
 * se llena la encuesta) y reemplaza a la jornada con ubicación en vivo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('form_responses', function (Blueprint $table) {
            $table->jsonb('location_trace')->nullable();
            $table->timestamp('trace_started_at')->nullable();
            $table->index(['user_id', 'trace_started_at']);
        });

        Schema::dropIfExists('field_location_reports');
        Schema::dropIfExists('field_tracking_shifts');
    }

    public function down(): void
    {
        Schema::create('field_location_reports', function (Blueprint $table) {
            $table->id();
            $table->uuid('form_id');
            $table->uuid('zone_id');
            $table->foreignId('user_id');
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy_meters', 8, 2)->nullable();
            $table->timestamp('recorded_at');
            $table->timestamps();
            $table->foreign('form_id')->references('id')->on('forms')->cascadeOnDelete();
            $table->foreign('zone_id')->references('id')->on('project_zones')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['form_id', 'user_id', 'recorded_at']);
        });
        Schema::create('field_tracking_shifts', function (Blueprint $table) {
            $table->id();
            $table->uuid('form_id');
            $table->foreignId('user_id');
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
            $table->foreign('form_id')->references('id')->on('forms')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['form_id', 'user_id', 'ended_at']);
        });

        Schema::table('form_responses', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'trace_started_at']);
            $table->dropColumn(['location_trace', 'trace_started_at']);
        });
    }
};
