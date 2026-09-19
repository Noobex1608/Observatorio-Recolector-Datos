<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('form_user_shares', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('form_id');
            $table->foreignId('user_id');
            // EDITOR, RECOLECTOR
            $table->enum('role', ['EDITOR', 'RECOLECTOR']);
            $table->timestamps();
            
            $table->foreign('form_id')->references('id')->on('forms')->onDelete('cascade');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            
            $table->unique(['form_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('form_user_shares');
    }
};
