<?php

declare(strict_types=1);

namespace App\Application\User\UseCases;

use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Deshace la eliminación de una cuenta: vuelve a la lista con su rol y sus asignaciones de antes,
 * activa. Lo hace un SUPER_ADMIN, o un ADMIN si el rol de la cuenta es uno de los que gestiona.
 */
class RestoreUserUseCase
{
    public function execute(int $userId, int $adminId): User
    {
        return DB::transaction(function () use ($userId, $adminId) {
            $admin = User::findOrFail($adminId);
            if (! $admin->canManageUsers()) {
                throw new AccessDeniedHttpException(__('Solo los administradores pueden restaurar usuarios.'));
            }

            $user = User::onlyTrashed()->lockForUpdate()->findOrFail($userId);
            if (! $admin->canManageRole($user->rol)) {
                throw new AccessDeniedHttpException(__('No tienes permisos para restaurar una cuenta con ese rol.'));
            }

            $user->restore();
            $user->forceFill(['is_active' => true])->save();

            AuditLogService::log($admin, 'RESTORE_USER', 'usuarios',
                'Restauró la cuenta del usuario :email.', [
                    'target_user_id' => $user->id,
                    'target_role' => $user->rol,
                ], params: ['email' => $user->email]);

            return $user->load('perfil');
        });
    }
}
