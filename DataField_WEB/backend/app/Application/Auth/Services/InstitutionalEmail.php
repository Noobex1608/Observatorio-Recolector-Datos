<?php

declare(strict_types=1);

namespace App\Application\Auth\Services;

use App\Models\User;
use Illuminate\Validation\ValidationException;

/** Correos institucionales de ULEAM (internos): entran con Microsoft 365 y no reciben invitación. */
final class InstitutionalEmail
{
    public static function isInternal(string $email): bool
    {
        $domain = strtolower(substr(strrchr(trim($email), '@') ?: '', 1));

        return $domain !== '' && in_array($domain, (array) config('services.internal_email_domains', []), true);
    }

    /**
     * Roles globales que admite un correo. Los externos solo pueden recolectar o supervisar: los roles con
     * control sobre usuarios, proyectos o datos quedan para cuentas institucionales protegidas por Microsoft.
     *
     * @return array<int, string>
     */
    public static function allowedRoles(string $email): array
    {
        return self::isInternal($email) ? User::ROLES : [User::ROLE_USER, User::ROLE_SUPERVISOR];
    }

    /** Lanza un error de validación si el rol no está permitido para ese correo. */
    public static function assertRoleAllowed(string $email, string $role, string $field = 'rol'): void
    {
        if (! in_array($role, self::allowedRoles($email), true)) {
            throw ValidationException::withMessages([
                $field => [__('Los usuarios externos (correo no institucional) solo pueden ser RECOLECTOR o SUPERVISOR.')],
            ]);
        }
    }
}
