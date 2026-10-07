<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_zone_user_assignments', function (Blueprint $table) {
            $table->uuid('zone_id');
            $table->foreignId('user_id');
            $table->string('role')->default('RECOLECTOR');
            $table->timestamps();

            $table->primary(['zone_id', 'user_id']);
            $table->foreign('zone_id')->references('id')->on('project_zones')->onDelete('cascade');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_zone_user_assignments');
    }
};
