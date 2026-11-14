<?php

declare(strict_types=1);

namespace App\Application\User\DTOs;

final readonly class UpdateUserDTO
{
    public function __construct(
        public int $userId,
        public int $adminId,
        public ?string $name = null,
        public ?string $email = null,
        public ?string $password = null,
        public ?string $rol = null,
        public ?bool $isActive = null,
        public ?string $telefono = null,
        public ?string $cargo = null,
        public ?string $bio = null,
        public bool $telefonoProvided = false,
        public bool $cargoProvided = false,
        public bool $bioProvided = false,
    ) {}

    public static function fromArray(array $data, int $userId, int $adminId): self
    {
        return new self(
            userId: $userId,
            adminId: $adminId,
            name: $data['name'] ?? null,
            email: $data['email'] ?? null,
            password: $data['password'] ?? null,
            rol: $data['rol'] ?? null,
            isActive: isset($data['is_active']) ? (bool) $data['is_active'] : null,
            telefono: $data['telefono'] ?? null,
            cargo: $data['cargo'] ?? null,
            bio: $data['bio'] ?? null,
            telefonoProvided: array_key_exists('telefono', $data),
            cargoProvided: array_key_exists('cargo', $data),
            bioProvided: array_key_exists('bio', $data),
        );
    }
}
