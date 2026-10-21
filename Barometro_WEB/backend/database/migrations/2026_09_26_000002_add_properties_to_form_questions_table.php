<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('form_questions', function (Blueprint $table) {
            if (! Schema::hasColumn('form_questions', 'properties')) {
                $table->jsonb('properties')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('form_questions', function (Blueprint $table) {
            if (Schema::hasColumn('form_questions', 'properties')) {
                $table->dropColumn('properties');
            }
        });
    }
};
