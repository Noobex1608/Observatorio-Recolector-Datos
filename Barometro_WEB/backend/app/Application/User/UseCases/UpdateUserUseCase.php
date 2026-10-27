<?php

declare(strict_types=1);

namespace App\Application\User\UseCases;

use App\Application\User\DTOs\UpdateUserDTO;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class UpdateUserUseCase
{
    /**
     * Actualiza un usuario existente.
     * Solo puede ser ejecutado por un administrador.
     */
    public function execute(UpdateUserDTO $dto): User
    {
        return DB::transaction(function () use ($dto) {
            app(ProtectAdministrator::class)->lock();
            // Verificar que el usuario que ejecuta la acción es admin
            $admin = User::findOrFail($dto->adminId);

            if (! $admin->canManageUsers()) {
                throw new AccessDeniedHttpException('Solo los administradores pueden actualizar usuarios');
            }

            // Buscar el usuario a modificar
            $user = User::with('perfil')->find($dto->userId);

            if (! $user) {
                throw new NotFoundHttpException('Usuario no encontrado');
            }

            if (! $admin->canManageRole($user->rol)) {
                throw new AccessDeniedHttpException('No tienes permisos para administrar usuarios con ese rol');
            }
            app(ProtectAdministrator::class)->check($user, $dto->adminId, $dto->rol ?? $user->rol, $dto->isActive ?? $user->is_active);
            $before = $user->only(['name', 'email', 'rol', 'is_active']);

            // Actualizar datos básicos
            if ($dto->name !== null) {
                $user->name = $dto->name;
            }

            if ($dto->email !== null && $dto->email !== $user->email) {
                // Verificar que el nuevo email no esté en uso
                if (User::where('email', $dto->email)->where('id', '!=', $user->id)->exists()) {
                    throw new ConflictHttpException('El email ya está en uso por otro usuario');
                }
                $user->email = $dto->email;
            }

            if ($dto->password !== null) {
                $user->password = Hash::make($dto->password);
            }

            if ($dto->rol !== null) {
                if (! in_array($dto->rol, User::ROLES, true)) {
                    throw new \InvalidArgumentException('Rol inválido. Los roles permitidos son: SUPER_ADMIN, ADMIN, PROJECT, RECOLECTOR, SUPERVISOR');
                }
                if (! $admin->canManageRole($dto->rol)) {
                    throw new AccessDeniedHttpException('No tienes permisos para asignar ese rol');
                }
                $user->rol = $dto->rol;
            }

            if ($dto->isActive !== null) {
                $user->is_active = $dto->isActive;
            }

            $user->save();
            if ($dto->password !== null || ! $user->is_active || $before['rol'] !== $user->rol) {
                $user->tokens()->delete();
            }

            // Actualizar perfil
            $perfilData = [];
            if ($dto->telefonoProvided) {
                $perfilData['telefono'] = $dto->telefono;
            }
            if ($dto->cargoProvided) {
                $perfilData['cargo'] = $dto->cargo;
            }
            if ($dto->bioProvided) {
                $perfilData['bio'] = $dto->bio;
            }

            if (! empty($perfilData)) {
                if ($user->perfil) {
                    $user->perfil->update($perfilData);
                } else {
                    $user->perfil()->create($perfilData);
                }
            }

            // Recargar relaciones
            $user->load('perfil');

            AuditLogService::log($admin, 'UPDATE_USER', 'usuarios',
                "Actualizó los datos del usuario {$user->email}.", [
                    'target_user_id' => $user->id,
                    'before' => $before,
                    'after' => $user->only(['name', 'email', 'rol', 'is_active']),
                ]);

            return $user;
        });
    }
}
