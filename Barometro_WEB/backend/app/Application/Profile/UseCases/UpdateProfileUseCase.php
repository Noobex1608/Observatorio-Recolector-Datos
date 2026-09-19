<?php

declare(strict_types=1);

namespace App\Application\Profile\UseCases;

use App\Application\Profile\DTOs\UpdateProfileDTO;
use App\Models\User;

class UpdateProfileUseCase
{
    public function execute(User $user, UpdateProfileDTO $dto): User
    {
        // Actualizar nombre del usuario si se proporciona
        if ($dto->name !== null) {
            $user->name = $dto->name;
            $user->save();
        }

        // Actualizar o crear perfil
        $perfilData = [];
        
        if ($dto->telefono !== null) {
            $perfilData['telefono'] = $dto->telefono;
        }
        if ($dto->cargo !== null) {
            $perfilData['cargo'] = $dto->cargo;
        }
        if ($dto->bio !== null) {
            $perfilData['bio'] = $dto->bio;
        }

        if (!empty($perfilData)) {
            if ($user->perfil) {
                $user->perfil->update($perfilData);
            } else {
                $user->perfil()->create($perfilData);
            }
        }

        // Recargar relaciones
        $user->load('perfil');

        return $user;
    }
}
