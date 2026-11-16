<?php

declare(strict_types=1);

namespace App\Application\Auth\UseCases;

use App\Models\User;

class LogoutUseCase
{
    public function execute(User $user): void
    {
        $user->currentAccessToken()->delete();
    }
}
