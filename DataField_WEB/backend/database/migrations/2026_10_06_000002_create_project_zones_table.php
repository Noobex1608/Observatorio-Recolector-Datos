<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_zones', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('technical_sheet_id')->nullable();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('geofence_type')->default('radius');
            $table->decimal('target_lat', 10, 7)->nullable();
            $table->decimal('target_lng', 10, 7)->nullable();
            $table->integer('radius_meters')->default(500);
            $table->json('hierarchy_json')->nullable();
            $table->json('geometry_json')->nullable();
            $table->integer('target_responses')->nullable();
            $table->integer('assigned_count')->default(0);
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->onDelete('cascade');
            $table->foreign('technical_sheet_id')->references('id')->on('project_technical_sheets')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_zones');
    }
};
