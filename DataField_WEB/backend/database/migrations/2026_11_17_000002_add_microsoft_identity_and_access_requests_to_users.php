<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * - microsoft_oid: identificador estable de la persona en Microsoft 365. La cuenta se ata a él en el primer
 *   inicio con Microsoft, para que un correo reasignado o renombrado no herede la cuenta de otra persona.
 * - access_request_status: solicitudes de acceso de cuentas ULEAM que entraron con Microsoft sin estar
 *   registradas (PENDING) o que un administrador rechazó (REJECTED). Mientras tanto la cuenta está inactiva.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('microsoft_oid', 64)->nullable()->unique();
            $table->string('access_request_status', 16)->nullable()->index();
            $table->timestamp('access_requested_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['microsoft_oid']);
            $table->dropIndex(['access_request_status']);
            $table->dropColumn(['microsoft_oid', 'access_request_status', 'access_requested_at']);
        });
    }
};
