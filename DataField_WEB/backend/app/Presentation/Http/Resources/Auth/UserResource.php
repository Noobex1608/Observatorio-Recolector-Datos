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
            'must_change_password' => (bool) ($this->must_change_password ?? false),
            // Interno = correo institucional ULEAM (entra con Microsoft 365). Externo = correo y contraseña.
            'is_institutional' => \App\Application\Auth\Services\InstitutionalEmail::isInternal((string) $this->email),
            // Externo que aún no confirma su correo desde la invitación.
            'invitation_pending' => ! \App\Application\Auth\Services\InstitutionalEmail::isInternal((string) $this->email)
                && $this->email_verified_at === null,
            'perfil' => $this->whenLoaded('perfil', fn () => $this->perfil ? [
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
