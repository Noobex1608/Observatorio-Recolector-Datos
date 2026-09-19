<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check");

        DB::statement("UPDATE users SET rol = 'PROJECT' WHERE rol = 'PROJECT_LEADER'");

        DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT', 'RECOLECTOR'))");

        DB::statement("ALTER TABLE users ALTER COLUMN rol SET DEFAULT 'RECOLECTOR'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check");

        DB::statement("UPDATE users SET rol = 'PROJECT_LEADER' WHERE rol = 'PROJECT'");

        DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_LEADER', 'RECOLECTOR'))");

        DB::statement("ALTER TABLE users ALTER COLUMN rol SET DEFAULT 'RECOLECTOR'");
    }
};
