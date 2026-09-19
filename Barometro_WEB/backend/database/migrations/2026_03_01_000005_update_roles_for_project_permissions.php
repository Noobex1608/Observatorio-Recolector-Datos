<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check');
        DB::statement("ALTER TABLE users ALTER COLUMN rol TYPE VARCHAR(32), ALTER COLUMN rol SET DEFAULT 'USER'");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_LEADER', 'USER'))");

        if (Schema::hasTable('form_user_shares')) {
            DB::table('form_user_shares')->where('role', 'LECTOR')->update(['role' => 'RECOLECTOR']);
            DB::statement('ALTER TABLE form_user_shares DROP CONSTRAINT IF EXISTS form_user_shares_role_check');
            DB::statement("ALTER TABLE form_user_shares ALTER COLUMN role TYPE VARCHAR(32)");
            DB::statement("ALTER TABLE form_user_shares ADD CONSTRAINT form_user_shares_role_check CHECK (role IN ('EDITOR', 'RECOLECTOR'))");
        }

        if (Schema::hasTable('forms') && !Schema::hasColumn('forms', 'project_id')) {
            Schema::table('forms', function (Blueprint $table) {
                $table->uuid('project_id')->nullable()->after('user_id');
                $table->foreign('project_id')->references('id')->on('projects')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('forms') && Schema::hasColumn('forms', 'project_id')) {
            Schema::table('forms', function (Blueprint $table) {
                $table->dropForeign(['project_id']);
                $table->dropColumn('project_id');
            });
        }

        if (Schema::hasTable('form_user_shares')) {
            DB::table('form_user_shares')->where('role', 'RECOLECTOR')->update(['role' => 'LECTOR']);
            DB::statement('ALTER TABLE form_user_shares DROP CONSTRAINT IF EXISTS form_user_shares_role_check');
            DB::statement("ALTER TABLE form_user_shares ADD CONSTRAINT form_user_shares_role_check CHECK (role IN ('EDITOR', 'LECTOR'))");
        }

        DB::table('users')->where('rol', 'PROJECT_LEADER')->update(['rol' => 'USER']);
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'USER'))");
    }
};
