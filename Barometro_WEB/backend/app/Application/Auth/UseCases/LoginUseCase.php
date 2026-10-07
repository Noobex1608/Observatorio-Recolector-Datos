<?php

declare(strict_types=1);

namespace App\Application\Auth\UseCases;

use App\Application\Auth\Contracts\SupabaseAuthUserProvisioner;
use App\Application\Auth\DTOs\AuthResponseDTO;
use App\Application\Auth\DTOs\LoginDTO;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class LoginUseCase
{
    public function __construct(private readonly SupabaseAuthUserProvisioner $supabaseAuthUserProvisioner)
    {
    }

    public function execute(LoginDTO $dto): AuthResponseDTO
    {
        $user = User::where('email', $dto->email)->first();

        if (!$user || !Hash::check($dto->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Las credenciales proporcionadas son incorrectas.'],
            ]);
        }

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['Esta cuenta se encuentra desactivada. Contacte al administrador.'],
            ]);
        }

        // Limitar a máximo 10 tokens por usuario (eliminar los más viejos de forma compatible con PostgreSQL)
        $tokenIdsToDelete = $user->tokens()
            ->orderBy('created_at', 'desc')
            ->skip(9)
            ->take(100)
            ->pluck('id');

        if ($tokenIdsToDelete->isNotEmpty()) {
            $user->tokens()->whereIn('id', $tokenIdsToDelete)->delete();
        }

        // Cargar relaciones necesarias
        $user->load('perfil');

        // Garantizar provisionamiento del usuario en Supabase Auth para futuras policies.
        $this->supabaseAuthUserProvisioner->ensureUser($user);

        // Crear nuevo token
        $token = $user->createToken('auth-token')->plainTextToken;

        return AuthResponseDTO::fromUser($user, $token);
    }
}
