<?php

declare(strict_types=1);

namespace App\Presentation\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QuestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'form_id' => $this->form_id,
            'type' => $this->type,
            'label' => $this->label,
            'options' => $this->options ?? [],
            'required' => (bool) $this->required,
            'order' => (int) $this->order,
            'section_name' => $this->section_name,
            'likert_rows' => $this->likert_rows ?? [],
            'likert_columns' => $this->likert_columns ?? [],
            'branch_rules' => $this->branch_rules ?? [],
            'properties' => $this->properties ?? [],
            'hint' => $this->hint,
            'calculation_expression' => $this->calculation_expression,
            'media_type' => $this->media_type,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
