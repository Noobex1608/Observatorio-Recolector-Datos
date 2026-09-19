<?php

declare(strict_types=1);

namespace App\Application\User\UseCases;

use App\Models\User;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class GetUserByIdUseCase
{
    /**
     * Obtiene un usuario por su ID.
     * Solo puede ser ejecutado por un administrador.
     */
    public function execute(int $userId, int $adminId): User
    {
        // Verificar que el usuario que ejecuta la acción es admin
        $admin = User::findOrFail($adminId);

        if (!$admin->canManageUsers()) {
            throw new AccessDeniedHttpException('Solo los administradores pueden ver detalles de usuarios');
        }

        $user = User::with('perfil')->find($userId);

        if (!$user) {
            throw new NotFoundHttpException('Usuario no encontrado');
        }

        if (!$admin->canManageRole($user->rol)) {
            throw new AccessDeniedHttpException('No tienes permisos para ver usuarios con ese rol');
        }

        return $user;
    }
}
