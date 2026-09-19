<?php

declare(strict_types=1);

namespace App\Presentation\Http\Resources\Auth;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'rol' => $this->rol ?? 'RECOLECTOR',
            'is_active' => $this->is_active ?? true,
            'perfil' => $this->whenLoaded('perfil', fn() => $this->perfil ? [
                'id' => $this->perfil->id,
                'telefono' => $this->perfil->telefono,
                'cargo' => $this->perfil->cargo,
                'avatar' => $this->perfil->avatar,
                'bio' => $this->perfil->bio,
            ] : null),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
