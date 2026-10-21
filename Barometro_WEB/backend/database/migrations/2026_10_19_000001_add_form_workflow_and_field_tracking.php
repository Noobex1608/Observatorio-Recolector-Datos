<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check');
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT', 'RECOLECTOR', 'SUPERVISOR'))");
        }

        Schema::create('form_technical_sheets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('form_id')->unique();
            $table->text('description')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->integer('target_sample_size')->nullable();
            $table->string('status')->default('DRAFT');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('validated_at')->nullable();
            $table->timestamps();
            $table->foreign('form_id')->references('id')->on('forms')->cascadeOnDelete();
        });

        Schema::table('project_zones', function (Blueprint $table) {
            $table->uuid('form_id')->nullable()->after('project_id');
            $table->foreign('form_id')->references('id')->on('forms')->nullOnDelete();
            $table->index('form_id');
        });

        Schema::create('project_user_delegates', function (Blueprint $table) {
            $table->uuid('project_id');
            $table->foreignId('user_id');
            $table->timestamps();
            $table->primary(['project_id', 'user_id']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('project_user_supervisors', function (Blueprint $table) {
            $table->uuid('project_id');
            $table->foreignId('user_id');
            $table->timestamps();
            $table->primary(['project_id', 'user_id']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('field_location_reports', function (Blueprint $table) {
            $table->id();
            $table->uuid('form_id');
            $table->uuid('zone_id');
            $table->foreignId('user_id');
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy_meters', 8, 2)->nullable();
            $table->timestamp('recorded_at');
            $table->timestamps();
            $table->foreign('form_id')->references('id')->on('forms')->cascadeOnDelete();
            $table->foreign('zone_id')->references('id')->on('project_zones')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['form_id', 'user_id', 'recorded_at']);
        });

        Schema::create('field_tracking_shifts', function (Blueprint $table) {
            $table->id();
            $table->uuid('form_id');
            $table->foreignId('user_id');
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
            $table->foreign('form_id')->references('id')->on('forms')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['form_id', 'user_id', 'ended_at']);
        });

        // Existing project sheets are only a starting point. Each form requires its
        // leader to review and validate its own copy before a future publication.
        foreach (DB::table('forms')->get(['id', 'project_id', 'user_id']) as $form) {
            $legacy = DB::table('project_technical_sheets')->where('project_id', $form->project_id)->first();
            if ($legacy) {
                DB::table('form_technical_sheets')->insert([
                    'id' => (string) Str::uuid(),
                    'form_id' => $form->id,
                    'description' => $legacy->description,
                    'start_date' => $legacy->start_date,
                    'end_date' => $legacy->end_date,
                    'target_sample_size' => $legacy->target_sample_size,
                    'status' => 'DRAFT',
                    'created_by' => $legacy->created_by ?? $form->user_id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        // A legacy zone is unambiguous only when its project has one form.
        foreach (DB::table('projects')->get(['id']) as $project) {
            $forms = DB::table('forms')->where('project_id', $project->id)->pluck('id');
            if ($forms->count() === 1) {
                DB::table('project_zones')->where('project_id', $project->id)->update(['form_id' => $forms->first()]);
            }
        }

        DB::table('forms')->where('require_consent', false)->update(['require_consent' => true]);
    }

    public function down(): void
    {
        Schema::dropIfExists('field_tracking_shifts');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check');
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT', 'RECOLECTOR'))");
        }
        Schema::dropIfExists('field_location_reports');
        Schema::dropIfExists('project_user_supervisors');
        Schema::dropIfExists('project_user_delegates');
        Schema::table('project_zones', function (Blueprint $table) {
            $table->dropForeign(['form_id']);
            $table->dropIndex(['form_id']);
            $table->dropColumn('form_id');
        });
        Schema::dropIfExists('form_technical_sheets');
    }
};
