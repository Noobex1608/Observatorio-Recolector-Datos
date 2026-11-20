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
    public function execute(int $adminId, int $perPage = 15, bool $deleted = false): LengthAwarePaginator
    {
        // Verificar que el usuario que ejecuta la acción es admin
        $admin = User::findOrFail($adminId);

        if (! $admin->canManageUsers()) {
            throw new AccessDeniedHttpException(__('Solo los administradores pueden ver la lista de usuarios'));
        }

        // Las solicitudes de acceso (pendientes o rechazadas) tienen su propia bandeja.
        // Con $deleted, las cuentas eliminadas (borrado suave) para poder restaurarlas.
        $query = User::with('perfil')
            ->whereNull('access_request_status')
            ->when($deleted, fn ($q) => $q->onlyTrashed()->orderBy('deleted_at', 'desc'))
            ->orderBy('created_at', 'desc');

        if ($admin->isAdmin()) {
            $query->whereIn('rol', [User::ROLE_PROJECT, User::ROLE_USER, User::ROLE_SUPERVISOR]);
        }

        return $query->paginate($perPage);
    }
}
