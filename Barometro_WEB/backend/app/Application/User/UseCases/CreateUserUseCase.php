<?php

declare(strict_types=1);

namespace App\Application\User\UseCases;

use App\Application\Auth\Contracts\SupabaseAuthUserProvisioner;
use App\Application\User\DTOs\CreateUserDTO;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class CreateUserUseCase
{
    public function __construct(private readonly SupabaseAuthUserProvisioner $supabaseAuthUserProvisioner)
    {
    }

    /**
     * Crea un nuevo usuario.
     * Solo puede ser ejecutado por un administrador.
     */
    public function execute(CreateUserDTO $dto): User
    {
        return DB::transaction(function () use ($dto) {
            // Verificar que el usuario que ejecuta la acción es admin
            $admin = User::findOrFail($dto->adminId);

            if (!$admin->canManageUsers()) {
                throw new AccessDeniedHttpException('Solo los administradores pueden crear usuarios');
            }

            // Verificar que el email no exista
            if (User::where('email', $dto->email)->exists()) {
                throw new ConflictHttpException('El email ya está registrado');
            }

            // Validar rol
            if (!in_array($dto->rol, User::ROLES, true)) {
                throw new \InvalidArgumentException('Rol inválido. Los roles permitidos son: SUPER_ADMIN, ADMIN, PROJECT, RECOLECTOR');
            }

            if (!$admin->canManageRole($dto->rol)) {
                throw new AccessDeniedHttpException('No tienes permisos para crear usuarios con ese rol');
            }

            // Crear usuario
            $user = User::create([
                'name' => $dto->name,
                'email' => $dto->email,
                'password' => Hash::make($dto->password),
                'rol' => $dto->rol,
                'is_active' => $dto->isActive,
            ]);

            $this->supabaseAuthUserProvisioner->ensureUser($user, $dto->password);

            // Crear perfil si hay datos adicionales
            if ($dto->telefono || $dto->cargo || $dto->bio) {
                $user->perfil()->create([
                    'telefono' => $dto->telefono,
                    'cargo' => $dto->cargo,
                    'bio' => $dto->bio,
                ]);
            }

            // Cargar relaciones
            $user->load('perfil');

            return $user;
        });
    }
}
