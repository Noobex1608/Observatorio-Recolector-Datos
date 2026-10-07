<?php

declare(strict_types=1);

namespace App\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveTechnicalSheetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'description' => 'nullable|string|max:5000',
            'start_date' => 'nullable|date_format:Y-m-d',
            'end_date' => 'nullable|date_format:Y-m-d|after_or_equal:start_date',
            'target_sample_size' => 'nullable|integer|min:1',
            'status' => 'nullable|string|in:DRAFT,VALIDATED,IN_PROGRESS,COMPLETED',
        ];
    }
}
