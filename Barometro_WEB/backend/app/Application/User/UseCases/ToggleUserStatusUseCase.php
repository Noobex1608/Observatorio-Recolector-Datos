<?php

declare(strict_types=1);

namespace App\Application\User\UseCases;

use App\Application\Auth\Contracts\SupabaseAuthUserProvisioner;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ToggleUserStatusUseCase
{
    public function __construct(private readonly SupabaseAuthUserProvisioner $supabaseAuthUserProvisioner)
    {
    }

    /**
     * Activa o desactiva un usuario.
     * Solo puede ser ejecutado por un administrador.
     */
    public function execute(int $userId, int $adminId, ?bool $isActive = null): User
    {
        return DB::transaction(function () use ($userId, $adminId, $isActive) {
            // Verificar que el usuario que ejecuta la acción es admin
            $admin = User::findOrFail($adminId);

            if (!$admin->canManageUsers()) {
                throw new AccessDeniedHttpException('Solo los administradores pueden cambiar el estado de usuarios');
            }

            // No permitir auto-desactivación
            if ($userId === $adminId) {
                throw new BadRequestHttpException('No puedes desactivarte a ti mismo');
            }

            // Buscar el usuario
            $user = User::find($userId);

            if (!$user) {
                throw new NotFoundHttpException('Usuario no encontrado');
            }

            if (!$admin->canManageRole($user->rol)) {
                throw new AccessDeniedHttpException('No tienes permisos para activar o desactivar usuarios con ese rol');
            }

            // Si se especifica el estado, usarlo; si no, invertir el actual
            if ($isActive !== null) {
                $user->is_active = $isActive;
            } else {
                $user->is_active = !$user->is_active;
            }

            $user->save();

            // Si se desactiva, revocar todos los tokens
            if (!$user->is_active) {
                $user->tokens()->delete();
            }

            // Cargar relaciones
            $user->load('perfil');

            $this->supabaseAuthUserProvisioner->ensureUser($user);

            return $user;
        });
    }
}
