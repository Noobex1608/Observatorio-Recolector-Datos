<?php

declare(strict_types=1);

namespace App\Application\Auth\UseCases;

use App\Application\Auth\DTOs\AuthResponseDTO;
use App\Application\Auth\DTOs\LoginDTO;
use App\Application\Auth\Services\InstitutionalEmail;
use App\Application\Auth\Services\MicrosoftOidc;
use App\Application\Auth\Services\SessionIssuer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class LoginUseCase
{
    public function __construct(
        private readonly SessionIssuer $sessions,
        private readonly MicrosoftOidc $microsoft,
    ) {}

    public function execute(LoginDTO $dto): AuthResponseDTO
    {
        $user = User::whereRaw('LOWER(email) = ?', [strtolower(trim($dto->email))])->first();

        if (! $user || ! Hash::check($dto->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => [__('Las credenciales proporcionadas son incorrectas.')],
            ]);
        }

        // Con Microsoft 365 configurado, las cuentas institucionales entran solo con Microsoft.
        // El SUPER_ADMIN conserva la contraseña como acceso de emergencia.
        if ($this->microsoft->enabled() && InstitutionalEmail::isInternal($user->email) && ! $user->isSuperAdmin()) {
            throw ValidationException::withMessages([
                'email' => [__('Las cuentas institucionales de ULEAM ingresan con «Iniciar sesión con Microsoft».')],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => [__('Esta cuenta se encuentra desactivada. Contacte al administrador.')],
            ]);
        }

        return $this->sessions->issue($user);
    }
}
