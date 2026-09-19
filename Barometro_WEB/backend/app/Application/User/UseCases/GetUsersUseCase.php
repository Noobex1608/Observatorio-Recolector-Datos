<?php

declare(strict_types=1);

namespace App\Application\User\UseCases;

use App\Models\User;
use Illuminate\Pagination\LengthAwarePaginator;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class GetUsersUseCase
{
    /**
     * Obtiene la lista de usuarios.
     * Solo puede ser ejecutado por un administrador.
     */
    public function execute(int $adminId, int $perPage = 15): LengthAwarePaginator
    {
        // Verificar que el usuario que ejecuta la acción es admin
        $admin = User::findOrFail($adminId);

        if (!$admin->canManageUsers()) {
            throw new AccessDeniedHttpException('Solo los administradores pueden ver la lista de usuarios');
        }

        $query = User::with('perfil')
            ->orderBy('created_at', 'desc')
            ;

        if ($admin->isAdmin()) {
            $query->whereIn('rol', [User::ROLE_PROJECT, User::ROLE_USER]);
        }

        return $query->paginate($perPage);
    }
}
