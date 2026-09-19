<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('form_questions', function (Blueprint $table) {
            if (!Schema::hasColumn('form_questions', 'section_name')) {
                $table->string('section_name')->nullable()->after('order');
            }
        });
    }

    public function down(): void
    {
        Schema::table('form_questions', function (Blueprint $table) {
            if (Schema::hasColumn('form_questions', 'section_name')) {
                $table->dropColumn('section_name');
            }
        });
    }
};
