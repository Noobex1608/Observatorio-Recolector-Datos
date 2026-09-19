<?php

declare(strict_types=1);

namespace App\Application\Profile\DTOs;

class UpdateProfileDTO
{
    public function __construct(
        public readonly ?string $name = null,
        public readonly ?string $telefono = null,
        public readonly ?string $cargo = null,
        public readonly ?string $bio = null,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            name: $data['name'] ?? null,
            telefono: $data['telefono'] ?? null,
            cargo: $data['cargo'] ?? null,
            bio: $data['bio'] ?? null,
        );
    }

    public function toArray(): array
    {
        return array_filter([
            'name' => $this->name,
            'telefono' => $this->telefono,
            'cargo' => $this->cargo,
            'bio' => $this->bio,
        ], fn($value) => $value !== null);
    }
}
