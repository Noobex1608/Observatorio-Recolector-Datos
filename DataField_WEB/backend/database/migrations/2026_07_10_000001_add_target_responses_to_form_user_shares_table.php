<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('form_user_shares', function (Blueprint $table) {
            $table->unsignedInteger('target_responses')->nullable()->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('form_user_shares', function (Blueprint $table) {
            $table->dropColumn('target_responses');
        });
    }
};
