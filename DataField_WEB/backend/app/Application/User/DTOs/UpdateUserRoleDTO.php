<?php

declare(strict_types=1);

namespace App\Application\User\DTOs;

final readonly class UpdateUserRoleDTO
{
    public function __construct(
        public int $userId,
        public string $rol,
        public int $adminId,
    ) {}

    public static function fromArray(array $data, int $adminId): self
    {
        return new self(
            userId: (int) $data['user_id'],
            rol: $data['rol'],
            adminId: $adminId,
        );
    }
}
