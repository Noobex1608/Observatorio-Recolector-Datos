<?php

declare(strict_types=1);

namespace App\Presentation\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'status' => $this->status ?? 'ACTIVE',
            'user_id' => $this->created_by ?? $this->user_id,
            'forms_count' => $this->whenCounted('forms'),
            'zones_count' => $this->whenCounted('zones'),
            'technical_sheet' => new ProjectTechnicalSheetResource($this->whenLoaded('technicalSheet')),
            'zones' => ProjectZoneResource::collection($this->whenLoaded('zones')),
            'leaders' => $this->whenLoaded('leaders', function () {
                return $this->leaders->map(fn ($leader) => [
                    'id' => $leader->id,
                    'name' => $leader->name,
                    'email' => $leader->email,
                ]);
            }),
            'delegates' => $this->whenLoaded('delegates', fn () => $this->delegates->map(fn ($user) => [
                'id' => $user->id, 'name' => $user->name, 'email' => $user->email,
            ])),
            'supervisors' => $this->whenLoaded('supervisors', fn () => $this->supervisors->map(fn ($user) => [
                'id' => $user->id, 'name' => $user->name, 'email' => $user->email,
            ])),
            'forms' => $this->whenLoaded('forms'),
            'members' => $this->whenLoaded('forms', function () {
                $members = collect();
                foreach (['leaders' => 'PROJECT', 'delegates' => 'DELEGADO',
                    'supervisors' => 'SUPERVISOR'] as $relation => $role) {
                    if (! $this->relationLoaded($relation)) {
                        continue;
                    }
                    foreach ($this->{$relation} as $user) {
                        $members->push([
                            'user_id' => $user->id, 'name' => $user->name, 'email' => $user->email,
                            'role' => $role, 'scope' => 'Proyecto',
                        ]);
                    }
                }
                foreach ($this->forms as $form) {
                    if (! $form->relationLoaded('shares')) {
                        continue;
                    }
                    foreach ($form->shares as $share) {
                        if (! $share->user) {
                            continue;
                        }
                        $members->push([
                            'user_id' => $share->user_id, 'name' => $share->user->name,
                            'email' => $share->user->email, 'role' => $share->role,
                            'scope' => 'Formulario', 'form_id' => $form->id,
                            'form_title' => $form->title,
                        ]);
                    }
                }

                return $members->values();
            }),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
