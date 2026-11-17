<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Desde ahora los usuarios externos confirman su correo con la invitación. Las cuentas que ya
 * existían funcionaban sin ese paso: se marcan como confirmadas para que no aparezcan pendientes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')->whereNull('email_verified_at')->update(['email_verified_at' => DB::raw('COALESCE(created_at, CURRENT_TIMESTAMP)')]);
    }

    public function down(): void
    {
        // Sin reversión: no se distingue qué cuentas se marcaron aquí.
    }
};
