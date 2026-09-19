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

        // Limitar a máximo 10 tokens por usuario (eliminar los más viejos)
        $user->tokens()
            ->orderBy('id', 'asc')
            ->skip(9)
            ->take(100)
            ->delete();

        // Cargar relaciones necesarias
        $user->load('perfil');

        // Garantizar provisionamiento del usuario en Supabase Auth para futuras policies.
        $this->supabaseAuthUserProvisioner->ensureUser($user);

        // Crear nuevo token
        $token = $user->createToken('auth-token')->plainTextToken;

        return AuthResponseDTO::fromUser($user, $token);
    }
}
