<?php

declare(strict_types=1);

namespace App\Application\Auth\Services;

use App\Application\Auth\DTOs\AuthResponseDTO;
use App\Models\User;

/** Emite el token Sanctum de una sesión (contraseña o Microsoft) con el mismo formato de respuesta. */
class SessionIssuer
{
    public function issue(User $user): AuthResponseDTO
    {
        // Máximo 10 tokens por usuario: se borran los más antiguos (compatible con PostgreSQL).
        $tokenIdsToDelete = $user->tokens()->orderBy('created_at', 'desc')->skip(9)->take(100)->pluck('id');
        if ($tokenIdsToDelete->isNotEmpty()) {
            $user->tokens()->whereIn('id', $tokenIdsToDelete)->delete();
        }
        $user->load('perfil');

        return AuthResponseDTO::fromUser($user, $user->createToken('auth-token')->plainTextToken);
    }
}
