<?php

declare(strict_types=1);

namespace App\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class BulkAssignZonesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'assignments' => 'required|array|min:1',
            'assignments.*.zone_id' => 'required|uuid|exists:project_zones,id',
            'assignments.*.user_ids' => 'required|array',
            'assignments.*.user_ids.*' => 'exists:users,id',
        ];
    }
}
