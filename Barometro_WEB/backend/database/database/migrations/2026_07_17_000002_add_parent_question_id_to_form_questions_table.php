<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('form_questions', function (Blueprint $table) {
            if (!Schema::hasColumn('form_questions', 'parent_question_id')) {
                $table->uuid('parent_question_id')->nullable()->after('section_name');
                $table->foreign('parent_question_id')
                    ->references('id')
                    ->on('form_questions')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('form_questions', function (Blueprint $table) {
            if (Schema::hasColumn('form_questions', 'parent_question_id')) {
                $table->dropForeign(['parent_question_id']);
                $table->dropColumn('parent_question_id');
            }
        });
    }
};

