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
            'status' => 'prohibited',
        ];
    }

    /**
     * Mensajes en español: el proyecto no publica los archivos de traducción de Laravel,
     * así que sin esto la API devolvía la clave cruda (por ejemplo "validation.after_or_equal").
     */
    public function messages(): array
    {
        return [
            'description.max' => 'La descripción no puede superar los 5000 caracteres.',
            'start_date.date_format' => 'La fecha de inicio debe tener el formato AAAA-MM-DD.',
            'end_date.date_format' => 'La fecha de fin debe tener el formato AAAA-MM-DD.',
            'end_date.after_or_equal' => 'La fecha de fin no puede ser anterior a la fecha de inicio.',
            'target_sample_size.integer' => 'La muestra objetivo debe ser un número entero.',
            'target_sample_size.min' => 'La muestra objetivo debe ser al menos 1.',
            'status.prohibited' => 'El estado de la ficha no se puede modificar desde este formulario.',
        ];
    }
}
