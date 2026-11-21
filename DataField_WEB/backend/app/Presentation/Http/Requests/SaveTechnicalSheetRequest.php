<?php

declare(strict_types=1);

namespace App\Presentation\Http\Requests;

use App\Models\ProjectTechnicalSheet;
use Illuminate\Foundation\Http\FormRequest;

/** Ficha metodológica del proyecto: contenido metodológico, fechas y muestra del proyecto. */
class SaveTechnicalSheetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rules = [
            'start_date' => 'nullable|date_format:Y-m-d',
            'end_date' => 'nullable|date_format:Y-m-d|after_or_equal:start_date',
            'target_sample_size' => 'nullable|integer|min:1',
            'status' => 'prohibited',
        ];
        foreach (ProjectTechnicalSheet::METHODOLOGY_FIELDS as $field) {
            $rules[$field] = 'nullable|string|max:5000';
        }

        return $rules;
    }

    /**
     * Mensajes en español: el proyecto no publica los archivos de traducción de Laravel,
     * así que sin esto la API devolvía la clave cruda (por ejemplo "validation.after_or_equal").
     */
    public function messages(): array
    {
        return [
            '*.max' => __('Cada campo de la ficha metodológica admite hasta 5000 caracteres.'),
            'start_date.date_format' => __('La fecha de inicio debe tener el formato AAAA-MM-DD.'),
            'end_date.date_format' => __('La fecha de fin debe tener el formato AAAA-MM-DD.'),
            'end_date.after_or_equal' => __('La fecha de fin no puede ser anterior a la fecha de inicio.'),
            'target_sample_size.integer' => __('La muestra objetivo debe ser un número entero.'),
            'target_sample_size.min' => __('La muestra objetivo debe ser al menos 1.'),
            'status.prohibited' => __('El estado de la ficha no se puede modificar desde este formulario.'),
        ];
    }
}
