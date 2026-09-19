<?php

declare(strict_types=1);

namespace App\Application\User\UseCases;

use App\Application\User\DTOs\UpdateUserRoleDTO;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class UpdateUserRoleUseCase
{
    /**
     * Actualiza el rol de un usuario.
     * Solo puede ser ejecutado por un administrador.
     */
    public function execute(UpdateUserRoleDTO $dto): User
    {
        return DB::transaction(function () use ($dto) {
            // Verificar que el usuario que ejecuta la acción es admin
            $admin = User::findOrFail($dto->adminId);

            if (!$admin->canManageUsers()) {
                throw new AccessDeniedHttpException('Solo los administradores pueden cambiar roles de usuarios');
            }

            // Buscar el usuario a modificar
            $user = User::find($dto->userId);

            if (!$user) {
                throw new NotFoundHttpException('Usuario no encontrado');
            }

            // Validar que el rol sea válido
            if (!in_array($dto->rol, User::ROLES, true)) {
                throw new \InvalidArgumentException('Rol inválido. Los roles permitidos son: SUPER_ADMIN, ADMIN, PROJECT, RECOLECTOR');
            }

            if (!$admin->canManageRole($user->rol) || !$admin->canManageRole($dto->rol)) {
                throw new AccessDeniedHttpException('No tienes permisos para administrar ese rol');
            }

            // Actualizar el rol (el modelo User permitirá esto porque el admin está autenticado)
            $user->rol = $dto->rol;
            $user->save();

            // Cargar relaciones
            $user->load('perfil');

            return $user;
        });
    }
}
