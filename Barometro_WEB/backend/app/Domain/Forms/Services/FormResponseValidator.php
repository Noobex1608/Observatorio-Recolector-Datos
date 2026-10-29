<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

use App\Models\Form;
use App\Models\FormQuestion;
use DateTimeImmutable;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator;

class FormResponseValidator
{
    private const METADATA_KEYS = [
        '_consentimiento_aceptado', '_consentimiento_fecha', '_project_geofence', '_location_trace',
        '_version', '__version__',
    ];

    /**
     * @param  Collection<int, FormQuestion>|Form  $target  Active questions, or a full form.
     * @param  array<string, mixed>  $data
     * @param  Collection<int, FormQuestion>|null  $allQuestions  Full schema for key validation.
     */
    public function validate(Collection|Form $target, array $data, ?Validator $validator = null, ?Collection $allQuestions = null): void
    {
        $active = $target instanceof Form
            ? ($target->questions ?? $target->questions()->orderBy('order')->get())
            : $target;
        $allQuestions ??= $active;
        $knownIds = array_fill_keys($allQuestions->pluck('id')->all(), true);
        $errors = [];

        foreach (array_keys($data) as $key) {
            if (! isset($knownIds[$key]) && ! in_array($key, self::METADATA_KEYS, true)) {
                $errors[$key][] = 'El campo no pertenece al formulario.';
            }
        }

        foreach ($active as $question) {
            $value = $data[$question->id] ?? null;
            $type = $question->type;
            if ($type === 'NOTE') {
                continue;
            }
            if ($question->required && $type !== 'CALCULATE' && $this->isEmpty($value)) {
                $errors[$question->id][] = "La pregunta '{$question->label}' es obligatoria.";

                continue;
            }
            if ($this->isEmpty($value)) {
                continue;
            }

            $options = is_array($question->options) ? $question->options : [];
            $properties = is_array($question->properties) ? $question->properties : [];
            $valid = match ($type) {
                'TEXT' => is_string($value) && mb_strlen($value) <= 10000,
                'NUMBER', 'CALCULATE' => is_numeric($value) && is_finite((float) $value)
                    && $this->withinNumericBounds((float) $value, $properties),
                'SINGLE_CHOICE' => is_scalar($value) && in_array($value, $options, true),
                'MULTIPLE_CHOICE' => $this->validChoiceList($value, $options),
                'LIKERT' => $this->validLikert($value, $options),
                'RANKING' => $this->validRanking($value, $options),
                'DATE' => $this->validDate($value, $properties),
                'TIME' => $this->validTime($value),
                'DATETIME' => $this->validDateTime($value),
                'GPS' => $this->validGps($value),
                'RATING' => is_numeric($value) && (float) $value == (int) $value
                    && (int) $value >= 1 && (int) $value <= (int) ($properties['max_rating'] ?? 5),
                'BARCODE' => is_string($value) && mb_strlen($value) <= 512,
                'SIGNATURE', 'MULTIMEDIA' => $this->validMedia($value, $properties, $type),
                default => false,
            };
            if (! $valid) {
                $errors[$question->id][] = "La respuesta a '{$question->label}' no tiene un valor válido para {$type}.";
            }
        }

        if ($errors === []) {
            return;
        }
        $messages = [];
        foreach ($errors as $field => $items) {
            $messages["data.{$field}"] = $items;
            if ($validator !== null) {
                foreach ($items as $message) {
                    $validator->errors()->add("data.{$field}", $message);
                }
            }
        }
        if ($validator === null) {
            throw ValidationException::withMessages($messages);
        }
    }

    private function isEmpty(mixed $value): bool
    {
        return $value === null || $value === '' || $value === [];
    }

    private function withinNumericBounds(float $value, array $properties): bool
    {
        return (! isset($properties['min']) || $value >= (float) $properties['min'])
            && (! isset($properties['max']) || $value <= (float) $properties['max']);
    }

    private function validChoiceList(mixed $value, array $options): bool
    {
        if (! is_array($value) || ! array_is_list($value) || count($value) !== count(array_unique($value, SORT_REGULAR))) {
            return false;
        }
        foreach ($value as $selected) {
            if (! is_scalar($selected) || ! in_array($selected, $options, true)) {
                return false;
            }
        }

        return true;
    }

    private function validRanking(mixed $value, array $options): bool
    {
        return $this->validChoiceList($value, $options) && count($value) === count($options);
    }

    private function validLikert(mixed $value, array $options): bool
    {
        if (! is_array($value) || array_is_list($value)) {
            return false;
        }
        $rows = $options['rows'] ?? [];
        $columns = $options['columns'] ?? [];
        if (! is_array($rows) || ! is_array($columns) || $rows === [] || $columns === []) {
            return false;
        }
        foreach ($rows as $row) {
            if (! array_key_exists($row, $value) || ! in_array($value[$row], $columns, true)) {
                return false;
            }
        }

        return count(array_diff(array_keys($value), $rows)) === 0;
    }

    private function validDate(mixed $value, array $properties): bool
    {
        if (! is_string($value)) {
            return false;
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (! $date || $date->format('Y-m-d') !== $value) {
            return false;
        }

        return (! isset($properties['min_date']) || $value >= $properties['min_date'])
            && (! isset($properties['max_date']) || $value <= $properties['max_date']);
    }

    private function validTime(mixed $value): bool
    {
        if (! is_string($value)) {
            return false;
        }
        foreach (['H:i', 'H:i:s'] as $format) {
            $time = DateTimeImmutable::createFromFormat('!'.$format, $value);
            if ($time && $time->format($format) === $value) {
                return true;
            }
        }

        return false;
    }

    private function validDateTime(mixed $value): bool
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?$/', $value)) {
            return false;
        }
        try {
            $parsed = new DateTimeImmutable($value);

            return $parsed->format('Y-m-d\TH:i') === substr($value, 0, 16);
        } catch (\Exception) {
            return false;
        }
    }

    private function validGps(mixed $value): bool
    {
        if (! is_array($value)) {
            return false;
        }
        $latitude = $value['latitude'] ?? $value['lat'] ?? null;
        $longitude = $value['longitude'] ?? $value['lng'] ?? null;

        return is_numeric($latitude) && is_numeric($longitude)
            && (float) $latitude >= -90 && (float) $latitude <= 90
            && (float) $longitude >= -180 && (float) $longitude <= 180;
    }

    private function validMedia(mixed $value, array $properties, string $type): bool
    {
        $dataUrl = is_array($value) ? ($value['dataUrl'] ?? null) : $value;
        if (! is_string($dataUrl) || ! preg_match('/^data:(image|audio|video)\/[a-z0-9.+-]+;base64,([A-Za-z0-9+\/=]+)$/i', $dataUrl, $matches)) {
            return false;
        }
        if ($type === 'SIGNATURE' && strtolower($matches[1]) !== 'image') {
            return false;
        }
        $maxMegabytes = min(30, max(1, (float) ($properties['max_file_size_mb'] ?? 10)));
        $encoded = $matches[2];
        if (strlen($encoded) > (int) ceil($maxMegabytes * 1024 * 1024 * 4 / 3) + 4) {
            return false;
        }
        $binary = base64_decode($encoded, true);
        if ($binary === false || strlen($binary) > $maxMegabytes * 1024 * 1024) {
            return false;
        }
        if (strtolower($matches[1]) === 'image') {
            return @getimagesizefromstring($binary) !== false;
        }
        $detected = (new \finfo(FILEINFO_MIME_TYPE))->buffer($binary);

        return is_string($detected) && (
            str_starts_with($detected, strtolower($matches[1]).'/')
            || ($detected === 'application/ogg' && str_contains(strtolower(substr($dataUrl, 0, 64)), '/ogg;'))
        );
    }
}
