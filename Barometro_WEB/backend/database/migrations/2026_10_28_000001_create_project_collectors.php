<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('cedula', 10)->nullable()->unique();
            $table->boolean('must_change_password')->default(false);
        });
        Schema::create('project_collectors', function (Blueprint $table) {
            $table->id();
            $table->uuid('project_id');
            $table->foreignId('user_id');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['project_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_collectors');
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['cedula']);
            $table->dropColumn(['cedula', 'must_change_password']);
        });
    }
};
