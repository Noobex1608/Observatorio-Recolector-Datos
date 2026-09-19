<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check");

        DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_LEADER', 'USER', 'RECOLECTOR'))");

        DB::statement("UPDATE users SET rol = 'RECOLECTOR' WHERE rol = 'USER'");

        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check");

        DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_LEADER', 'RECOLECTOR'))");

        DB::statement("ALTER TABLE users ALTER COLUMN rol SET DEFAULT 'RECOLECTOR'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check");

        DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_LEADER', 'USER', 'RECOLECTOR'))");

        DB::statement("UPDATE users SET rol = 'USER' WHERE rol = 'RECOLECTOR'");

        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check");

        DB::statement("ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_LEADER', 'USER'))");

        DB::statement("ALTER TABLE users ALTER COLUMN rol SET DEFAULT 'USER'");
    }
};