<?php

declare(strict_types=1);

namespace App\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'status' => 'nullable|string|in:ACTIVE,ARCHIVED,DRAFT',
            'leader_ids' => 'nullable|array',
            'leader_ids.*' => 'integer|exists:users,id',
            'delegate_ids' => 'nullable|array',
            'delegate_ids.*' => 'integer|distinct|exists:users,id',
            'supervisor_ids' => 'nullable|array',
            'supervisor_ids.*' => 'integer|distinct|exists:users,id',
        ];
    }
}
