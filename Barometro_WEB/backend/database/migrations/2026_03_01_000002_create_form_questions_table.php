<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('form_questions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('form_id');
            // multiple, single, likert, text, number
            $table->enum('type', ['MULTIPLE_CHOICE', 'SINGLE_CHOICE', 'LIKERT', 'TEXT', 'NUMBER']);
            $table->string('label');
            $table->jsonb('options')->nullable(); // For Likert/Multiple/Single choices
            $table->boolean('required')->default(false);
            $table->integer('order')->default(0);
            $table->string('section_name')->nullable();
            $table->timestamps();
            
            $table->foreign('form_id')->references('id')->on('forms')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('form_questions');
    }
};