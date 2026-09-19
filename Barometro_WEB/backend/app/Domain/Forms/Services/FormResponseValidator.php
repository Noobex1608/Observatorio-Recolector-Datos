<?php

namespace App\Domain\Forms\Services;

use App\Models\Form;
use App\Models\FormQuestion;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Support\Carbon;

class FormResponseValidator
{
    /**
     * Validate response data against a form's questions.
     */
    public function validate(Form $form, array $data, Validator $validator): void
    {
        $questions = $form->questions()->orderBy('order')->get();

        foreach ($questions as $question) {
            $key = "data.{$question->id}";
            $type = strtoupper(trim((string) $question->type));
            $label = $question->label;
            $isRequired = (bool) $question->required;

            // NOTE type is never required and accepts any value or null
            if ($type === 'NOTE') {
                continue;
            }

            $hasKey = array_key_exists($question->id, $data);
            $val = $data[$question->id] ?? null;

            $isEmpty = $val === null || $val === '' || (is_array($val) && empty($val));

            // Check required constraint
            if ($isRequired && $isEmpty) {
                $validator->errors()->add($key, "La pregunta '{$label}' es obligatoria.");
                continue;
            }

            // Skip type validation if value is empty and not required
            if ($isEmpty) {
                continue;
            }

            // Type-specific validations
            switch ($type) {
                case 'DATE':
                    if (!$this->isValidDate($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser una fecha válida en formato Y-m-d.");
                    }
                    break;

                case 'TIME':
                    if (!$this->isValidTime($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser una hora válida en formato H:i o H:i:s.");
                    }
                    break;

                case 'DATETIME':
                    if (!$this->isValidDateTime($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser una fecha y hora válida en formato ISO 8601.");
                    }
                    break;

                case 'GPS':
                    if (!$this->isValidGps($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser un objeto GPS con latitud (-90 a 90) y longitud (-180 a 180).");
                    }
                    break;

                case 'MULTIMEDIA':
                    if (!$this->isValidMultimedia($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe contener metadatos o una cadena de medio válida.");
                    }
                    break;

                case 'SIGNATURE':
                    if (!$this->isValidSignature($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser una cadena data URI de firma o identificador válido.");
                    }
                    break;

                case 'RANKING':
                    if (!is_array($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser un arreglo con el orden de las opciones.");
                    }
                    break;

                case 'RATING':
                    $maxRating = $this->extractMaxRating($question);
                    if (!$this->isValidRating($val, $maxRating)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser un número entero entre 1 y {$maxRating}.");
                    }
                    break;

                case 'BARCODE':
                    if (!is_string($val) || mb_strlen($val) > 255) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser un texto de máximo 255 caracteres.");
                    }
                    break;

                case 'CALCULATE':
                    if (!is_numeric($val) && !is_string($val) && !is_bool($val)) {
                        $validator->errors()->add($key, "La respuesta calculada para '{$label}' debe ser un número, cadena o booleano.");
                    }
                    break;

                case 'NUMBER':
                    if (!is_numeric($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser numérica.");
                    }
                    break;

                case 'TEXT':
                case 'SINGLE_CHOICE':
                    if (!is_scalar($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser un texto o valor escalar.");
                    }
                    break;

                case 'MULTIPLE_CHOICE':
                    if (!is_array($val)) {
                        $validator->errors()->add($key, "La respuesta para '{$label}' debe ser una lista de opciones.");
                    }
                    break;
            }
        }
    }

    private function isValidDate(mixed $val): bool
    {
        if (!is_string($val)) {
            return false;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $val)) {
            [$year, $month, $day] = explode('-', $val);
            return checkdate((int) $month, (int) $day, (int) $year);
        }

        return false;
    }

    private function isValidTime(mixed $val): bool
    {
        if (!is_string($val)) {
            return false;
        }

        return (bool) preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/', $val);
    }

    private function isValidDateTime(mixed $val): bool
    {
        if (!is_string($val)) {
            return false;
        }

        try {
            Carbon::parse($val);
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function isValidGps(mixed $val): bool
    {
        if (is_array($val)) {
            $lat = $val['lat'] ?? $val['latitude'] ?? null;
            $lng = $val['lng'] ?? $val['longitude'] ?? null;
            $accuracy = $val['accuracy'] ?? null;

            if ($lat === null || $lng === null || !is_numeric($lat) || !is_numeric($lng)) {
                return false;
            }

            $latNum = (float) $lat;
            $lngNum = (float) $lng;

            if ($latNum < -90 || $latNum > 90 || $lngNum < -180 || $lngNum > 180) {
                return false;
            }

            if ($accuracy !== null && (!is_numeric($accuracy) || (float) $accuracy < 0)) {
                return false;
            }

            return true;
        }

        if (is_string($val)) {
            $parts = array_map('trim', explode(',', $val));
            if (count($parts) >= 2 && is_numeric($parts[0]) && is_numeric($parts[1])) {
                $lat = (float) $parts[0];
                $lng = (float) $parts[1];
                return $lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180;
            }
        }

        return false;
    }

    private function isValidMultimedia(mixed $val): bool
    {
        if (is_string($val) && trim($val) !== '') {
            return true;
        }

        if (is_array($val)) {
            return isset($val['data']) || isset($val['dataUrl']) || isset($val['blobId']) || isset($val['url']);
        }

        return false;
    }

    private function isValidSignature(mixed $val): bool
    {
        if (!is_string($val) || trim($val) === '') {
            return false;
        }

        if (str_starts_with($val, 'data:image/') || mb_strlen($val) > 10) {
            return true;
        }

        return false;
    }

    private function isValidRating(mixed $val, int $maxRating): bool
    {
        if (!is_numeric($val)) {
            return false;
        }

        $intVal = (int) $val;
        if ((string) $intVal !== (string) $val && (float) $val !== (float) $intVal) {
            return false;
        }

        return $intVal >= 1 && $intVal <= $maxRating;
    }

    private function extractMaxRating(FormQuestion $question): int
    {
        if (is_array($question->options) && count($question->options) > 0) {
            return count($question->options);
        }

        return 10;
    }
}
