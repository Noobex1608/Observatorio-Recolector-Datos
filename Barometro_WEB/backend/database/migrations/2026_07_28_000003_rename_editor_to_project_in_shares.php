<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE form_user_shares DROP CONSTRAINT IF EXISTS form_user_shares_role_check");

        DB::statement("UPDATE form_user_shares SET role = 'PROJECT' WHERE role = 'EDITOR'");

        DB::statement("ALTER TABLE form_user_shares ADD CONSTRAINT form_user_shares_role_check CHECK (role IN ('PROJECT', 'RECOLECTOR'))");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE form_user_shares DROP CONSTRAINT IF EXISTS form_user_shares_role_check");

        DB::statement("UPDATE form_user_shares SET role = 'EDITOR' WHERE role = 'PROJECT'");

        DB::statement("ALTER TABLE form_user_shares ADD CONSTRAINT form_user_shares_role_check CHECK (role IN ('EDITOR', 'RECOLECTOR'))");
    }
};