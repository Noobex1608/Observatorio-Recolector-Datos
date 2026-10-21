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
        public readonly bool $telefonoProvided = false,
        public readonly bool $cargoProvided = false,
        public readonly bool $bioProvided = false,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            name: $data['name'] ?? null,
            telefono: $data['telefono'] ?? null,
            cargo: $data['cargo'] ?? null,
            bio: $data['bio'] ?? null,
            telefonoProvided: array_key_exists('telefono', $data),
            cargoProvided: array_key_exists('cargo', $data),
            bioProvided: array_key_exists('bio', $data),
        );
    }

    public function toArray(): array
    {
        $data = [];
        if ($this->name !== null) {
            $data['name'] = $this->name;
        }
        foreach (['telefono', 'cargo', 'bio'] as $field) {
            if ($this->{$field.'Provided'}) {
                $data[$field] = $this->{$field};
            }
        }

        return $data;
    }
}
