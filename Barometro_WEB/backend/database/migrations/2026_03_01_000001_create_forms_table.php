<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('forms', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->text('description')->nullable();
            $table->foreignId('user_id');
            $table->uuid('project_id');
            // DRAFT, DEPLOYED, ARCHIVED
            $table->enum('state', ['DRAFT', 'DEPLOYED', 'ARCHIVED'])->default('DRAFT');
            $table->uuid('link_uuid')->nullable()->unique();
            $table->timestamps();
            
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('project_id')->references('id')->on('projects')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('forms');
    }
};
