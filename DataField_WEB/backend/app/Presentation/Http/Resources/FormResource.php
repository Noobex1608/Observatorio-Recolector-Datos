<?php

declare(strict_types=1);

namespace App\Presentation\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FormResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'user_id' => $this->user_id,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status,
            'link_uuid' => $this->link_uuid,
            'step_by_step' => (bool) ($this->step_by_step ?? false),
            'target_responses' => $this->target_responses ? (int) $this->target_responses : null,
            'responses_count' => $this->whenHas('responses_count', $this->responses_count, fn () => $this->responses()->count()),
            'questions' => QuestionResource::collection($this->whenLoaded('questions')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
