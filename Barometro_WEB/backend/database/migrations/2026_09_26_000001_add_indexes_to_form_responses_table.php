<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('form_responses', function (Blueprint $table) {
            $table->index(['form_id', 'user_id']);
            $table->index(['form_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('form_responses', function (Blueprint $table) {
            $table->dropIndex(['form_id', 'user_id']);
            $table->dropIndex(['form_id', 'created_at']);
        });
    }
};
