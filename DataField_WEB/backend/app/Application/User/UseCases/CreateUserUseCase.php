<?php

declare(strict_types=1);

namespace App\Application\User\UseCases;

use App\Application\User\DTOs\CreateUserDTO;
use App\Models\User;
use App\Application\Auth\Services\AccountInvitation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class CreateUserUseCase
{
    public function __construct(private readonly AccountInvitation $invitations) {}

    /**
     * Crea un nuevo usuario.
     * Solo puede ser ejecutado por un administrador.
     */
    public function execute(CreateUserDTO $dto): User
    {
        $user = DB::transaction(function () use ($dto) {
            // Verificar que el usuario que ejecuta la acción es admin
            $admin = User::findOrFail($dto->adminId);

            if (! $admin->canManageUsers()) {
                throw new AccessDeniedHttpException('Solo los administradores pueden crear usuarios');
            }

            // El correo puede pertenecer a una cuenta eliminada (borrado lógico): en ese caso se reutiliza
            // esa misma cuenta, sin los accesos que tenía, para conservar su historial de respuestas.
            $existing = User::withTrashed()->whereRaw('LOWER(email) = ?', [strtolower(trim($dto->email))])->first();
            if ($existing && ! $existing->trashed()) {
                throw new ConflictHttpException($existing->hasAccessRequest()
                    ? 'Este correo tiene una solicitud de acceso: apruébala desde la bandeja de solicitudes.'
                    : 'El email ya está registrado');
            }

            // Validar rol
            if (! in_array($dto->rol, User::ROLES, true)) {
                throw new \InvalidArgumentException('Rol inválido. Los roles permitidos son: SUPER_ADMIN, ADMIN, PROJECT, RECOLECTOR, SUPERVISOR');
            }

            if (! $admin->canManageRole($dto->rol)) {
                throw new AccessDeniedHttpException('No tienes permisos para crear usuarios con ese rol');
            }
            \App\Application\Auth\Services\InstitutionalEmail::assertRoleAllowed($dto->email, $dto->rol);

            // Internos (ULEAM): con Microsoft 365 no tienen contraseña local. Externos: crean la suya
            // desde el correo de confirmación. Solo sin Microsoft configurado el administrador fija una.
            $external = $this->invitations->needsInvitation($dto->email);
            $withoutPassword = $external || $this->invitations->usesMicrosoft($dto->email);
            if (! $withoutPassword && ($dto->password === null || $dto->password === '')) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'password' => ['Indica una contraseña: el inicio de sesión con Microsoft no está configurado.'],
                ]);
            }

            $attributes = [
                'name' => $dto->name,
                'email' => $dto->email,
                'password' => Hash::make($withoutPassword ? $this->invitations->placeholderPassword() : $dto->password),
                'rol' => $dto->rol,
                'is_active' => $dto->isActive,
                'must_change_password' => false,
            ];

            if ($existing) {
                $user = $this->restoreDeletedAccount($existing, $attributes);
            } else {
                $user = User::create($attributes);
            }

            // Perfil con los datos adicionales (en una cuenta restaurada se reemplazan los anteriores)
            if ($dto->telefono || $dto->cargo || $dto->bio || $existing) {
                $user->perfil()->updateOrCreate([], [
                    'telefono' => $dto->telefono,
                    'cargo' => $dto->cargo,
                    'bio' => $dto->bio,
                ]);
            }

            // Cargar relaciones
            $user->load('perfil');

            return $user;
        });

        if ($this->invitations->needsInvitation($user->email)) {
            try {
                $this->invitations->send($user);
            } catch (\Throwable $e) {
                // El usuario queda creado; el administrador puede reenviar la invitación.
                Log::error('No se pudo enviar la invitación', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            }
        }

        return $user;
    }

    /**
     * Reutiliza una cuenta eliminada con los datos nuevos. Empieza sin ningún acceso anterior: se retiran
     * proyectos (líder, delegado, supervisor, recolector), zonas y formularios compartidos, y se desata de
     * Microsoft por si el correo ahora es de otra persona. Las respuestas que envió se conservan.
     */
    private function restoreDeletedAccount(User $user, array $attributes): User
    {
        $user->restore();
        $user->ledProjects()->detach();
        $user->delegatedProjects()->detach();
        $user->supervisedProjects()->detach();
        $user->assignedZones()->detach();
        DB::table('project_collectors')->where('user_id', $user->id)->delete();
        \App\Models\FormUserShare::where('user_id', $user->id)->delete();
        $user->tokens()->delete();

        $user->forceFill(array_merge($attributes, [
            'microsoft_oid' => null,
            'access_request_status' => null,
            'access_requested_at' => null,
            'email_verified_at' => null,
            'remember_token' => null,
        ]))->save();

        return $user;
    }
}
