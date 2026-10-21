<?php

declare(strict_types=1);

namespace App\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveProjectZoneRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'form_id' => 'sometimes|required|uuid|exists:forms,id',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'geofence_type' => 'nullable|string|in:radius,manzana_polygon,custom_polygon',
            'target_lat' => 'nullable|numeric|between:-90,90',
            'target_lng' => 'nullable|numeric|between:-180,180',
            'radius_meters' => 'nullable|integer|min:0',
            'hierarchy_json' => 'nullable|array',
            'geometry_json' => 'nullable|array',
            'target_responses' => 'nullable|integer|min:1',
            'assigned_count' => 'nullable|integer|min:0',
            'assigned_user_ids' => 'nullable|array',
            'assigned_user_ids.*' => 'exists:users,id',
        ];
    }
}
