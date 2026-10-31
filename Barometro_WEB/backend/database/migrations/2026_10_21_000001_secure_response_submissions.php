<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('forms', function (Blueprint $table) {
            $table->boolean('instrument_locked')->default(false);
            $table->unsignedInteger('draft_revision')->default(0);
        });
        // Do not invent historical versions. Freeze the schema available today.
        DB::table('forms')->whereNotNull('link_uuid')->orWhereIn('id', DB::table('form_responses')->select('form_id'))
            ->update(['instrument_locked' => true]);
        Schema::table('form_responses', function (Blueprint $table) {
            $table->uuid('client_submission_id')->nullable();
            $table->string('submission_hash', 64)->nullable();
            $table->json('instrument_snapshot')->nullable();
            $table->json('consent_evidence')->nullable();
            $table->unique(['form_id', 'client_submission_id'], 'response_submission_unique');
        });
    }

    public function down(): void
    {
        Schema::table('form_responses', function (Blueprint $table) {
            $table->dropUnique('response_submission_unique');
            $table->dropColumn(['client_submission_id', 'submission_hash', 'instrument_snapshot', 'consent_evidence']);
        });
        Schema::table('forms', fn (Blueprint $table) => $table->dropColumn(['instrument_locked', 'draft_revision']));
    }
};
