<?php

declare(strict_types=1);

namespace App\Application\User\DTOs;

final readonly class CreateUserDTO
{
    public function __construct(
        public string $name,
        public string $email,
        public string $password,
        public string $rol,
        public bool $isActive,
        public int $adminId,
        public ?string $telefono = null,
        public ?string $cargo = null,
        public ?string $bio = null,
    ) {}

    public static function fromArray(array $data, int $adminId): self
    {
        return new self(
            name: $data['name'],
            email: $data['email'],
            password: $data['password'],
            rol: $data['rol'] ?? 'RECOLECTOR',
            isActive: $data['is_active'] ?? true,
            adminId: $adminId,
            telefono: $data['telefono'] ?? null,
            cargo: $data['cargo'] ?? null,
            bio: $data['bio'] ?? null,
        );
    }
}
