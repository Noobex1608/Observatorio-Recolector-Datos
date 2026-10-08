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
                return $this->leaders->map(fn($leader) => [
                    'id' => $leader->id,
                    'name' => $leader->name,
                    'email' => $leader->email,
                ]);
            }),
            'forms' => $this->whenLoaded('forms'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
