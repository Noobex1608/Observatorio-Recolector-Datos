<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('forms', function (Blueprint $table) {
            $table->boolean('step_by_step')->default(false)->after('link_uuid');
        });

        Schema::table('form_questions', function (Blueprint $table) {
            $table->jsonb('branch_rules')->nullable()->after('options');
        });
    }

    public function down(): void
    {
        Schema::table('form_questions', function (Blueprint $table) {
            $table->dropColumn('branch_rules');
        });

        Schema::table('forms', function (Blueprint $table) {
            $table->dropColumn('step_by_step');
        });
    }
};