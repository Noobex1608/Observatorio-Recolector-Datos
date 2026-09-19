<?php

namespace App\Application\Auth\Contracts;

use App\Models\User;

interface SupabaseAuthUserProvisioner
{
    /**
     * @throws \RuntimeException
     */
    public function ensureUser(User $user, ?string $plainPassword = null): void;

    /**
     * @throws \RuntimeException
     */
    public function deleteUser(?string $supabaseAuthId): void;
}
