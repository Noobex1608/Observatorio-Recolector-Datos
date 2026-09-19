<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('response_sync_queue', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('form_response_id')->unique();
            $table->uuid('form_id');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->jsonb('payload');
            $table->string('status', 20)->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('next_retry_at')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'next_retry_at']);
            $table->index(['form_id', 'status']);
            $table->foreign('form_response_id')->references('id')->on('form_responses')->onDelete('cascade');
            $table->foreign('form_id')->references('id')->on('forms')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('response_sync_queue');
    }
};

