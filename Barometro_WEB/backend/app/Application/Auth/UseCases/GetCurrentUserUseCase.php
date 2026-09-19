<?php

declare(strict_types=1);

namespace App\Application\Auth\UseCases;

use App\Models\User;

class GetCurrentUserUseCase
{
    public function execute(User $user): User
    {
        // Cargar relaciones necesarias
        $user->load('perfil');
        
        return $user;
    }
}
