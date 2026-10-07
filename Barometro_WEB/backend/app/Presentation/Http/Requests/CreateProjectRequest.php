<?php

declare(strict_types=1);

namespace App\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'status' => 'nullable|string|in:ACTIVE,ARCHIVED,DRAFT',
            'leader_ids' => 'nullable|array',
            'leader_ids.*' => 'integer|exists:users,id',
        ];
    }
}
