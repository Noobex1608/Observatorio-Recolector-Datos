<?php

declare(strict_types=1);

namespace App\Application\Auth\Services;

use App\Models\User;
use App\Notifications\AccountInvitationNotification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/**
 * Alta de cuentas según el tipo de correo:
 * - Internos (dominios ULEAM): entran con Microsoft 365; no tienen contraseña local ni reciben correo.
 * - Externos: reciben el correo de confirmación para crear su propia contraseña.
 */
class AccountInvitation
{
    public function __construct(private readonly MicrosoftOidc $microsoft) {}

    /** Las cuentas internas no necesitan contraseña cuando Microsoft 365 está configurado. */
    public function usesMicrosoft(string $email): bool
    {
        return $this->microsoft->enabled() && InstitutionalEmail::isInternal($email);
    }

    public function needsInvitation(string $email): bool
    {
        return ! InstitutionalEmail::isInternal($email);
    }

    /** Contraseña inutilizable mientras el usuario no cree la suya (o entre con Microsoft). */
    public function placeholderPassword(): string
    {
        return Str::password(48);
    }

    public function send(User $user): void
    {
        $token = Password::broker('invitations')->createToken($user);
        $user->notify(new AccountInvitationNotification($token));
    }
}
