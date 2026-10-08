<?php

declare(strict_types=1);

namespace App\Presentation\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectTechnicalSheetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'description' => $this->description,
            'start_date' => $this->start_date?->format('Y-m-d'),
            'end_date' => $this->end_date?->format('Y-m-d'),
            'target_sample_size' => $this->target_sample_size,
            'status' => $this->status,
            'validated_by' => $this->validated_by,
            'validator' => $this->whenLoaded('validator', function () {
                return [
                    'id' => $this->validator->id,
                    'name' => $this->validator->name,
                    'email' => $this->validator->email,
                ];
            }),
            'validated_at' => $this->validated_at?->toIso8601String(),
            'created_by' => $this->created_by,
            'creator' => $this->whenLoaded('creator', function () {
                return [
                    'id' => $this->creator->id,
                    'name' => $this->creator->name,
                    'email' => $this->creator->email,
                ];
            }),
            'zones' => ProjectZoneResource::collection($this->whenLoaded('zones')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
