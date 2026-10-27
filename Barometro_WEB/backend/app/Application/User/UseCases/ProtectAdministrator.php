<?php
namespace App\Application\User\UseCases;

use App\Models\User;

class ProtectAdministrator
{
    public function lock(): void
    {
        // All account mutations take these locks in the same order.
        User::where('rol', User::ROLE_SUPER_ADMIN)->orderBy('id')->lockForUpdate()->get();
    }

    public function check(User $user, int $actorId, string $role, bool $active, bool $deleting = false): void
    {
        abort_if((int) $user->id === $actorId && (! $active || $deleting), 422, 'No puedes desactivar tu propia cuenta.');
        if ($user->isSuperAdmin() && $user->isActive() && ($role !== User::ROLE_SUPER_ADMIN || ! $active || $deleting)) {
            abort_unless(User::where('rol', User::ROLE_SUPER_ADMIN)->where('is_active', true)
                ->where('id', '!=', $user->id)->exists(), 422, 'Debe conservarse al menos un superadministrador activo.');
        }
    }
}
