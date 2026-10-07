<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

use App\Models\Form;
use App\Models\FormQuestion;
use Illuminate\Support\Collection;
use Illuminate\Validation\Validator;
use Illuminate\Validation\ValidationException;

class FormResponseValidator
{
    /**
     * Validate submission payload against active questions.
     *
     * @param Collection<int, FormQuestion>|Form $target
     * @param array<string, mixed> $data
     * @param Validator|null $validator
     * @throws ValidationException
     */
    public function validate(Collection|Form $target, array $data, ?Validator $validator = null): void
    {
        $activeQuestions = $target instanceof Form
            ? ($target->questions ?? $target->questions()->orderBy('order')->get())
            : $target;

        $errors = [];

        foreach ($activeQuestions as $question) {
            $value = $data[$question->id] ?? null;

            // Check required constraint
            if ($question->required && $this->isEmptyValue($value)) {
                $errors[$question->id][] = "La pregunta '{$question->label}' es obligatoria.";
                continue;
            }

            if ($this->isEmptyValue($value)) {
                continue;
            }

            // Validate by Question Type
            switch ($question->type) {
                case 'NUMBER':
                    if (!is_numeric($value)) {
                        $errors[$question->id][] = "La pregunta '{$question->label}' requiere un valor numérico.";
                    }
                    break;

                case 'SINGLE_CHOICE':
                    $options = $question->options ?? [];
                    if (!empty($options) && !in_array($value, $options, true)) {
                        $errors[$question->id][] = "La opción seleccionada en '{$question->label}' no es válida.";
                    }
                    break;

                case 'MULTIPLE_CHOICE':
                    if (!is_array($value)) {
                        $errors[$question->id][] = "La pregunta '{$question->label}' requiere una lista de opciones.";
                    } else {
                        $options = $question->options ?? [];
                        if (!empty($options)) {
                            foreach ($value as $selected) {
                                if (!in_array($selected, $options, true)) {
                                    $errors[$question->id][] = "Una de las opciones seleccionadas en '{$question->label}' no es válida.";
                                    break;
                                }
                            }
                        }
                    }
                    break;

                case 'TEXT':
                    if (is_string($value) && mb_strlen($value) > 10000) {
                        $errors[$question->id][] = "La respuesta a '{$question->label}' excede el límite máximo de caracteres.";
                    }
                    break;
            }
        }

        if (!empty($errors)) {
            if ($validator !== null) {
                foreach ($errors as $field => $messages) {
                    foreach ($messages as $msg) {
                        $validator->errors()->add("data.{$field}", $msg);
                    }
                }
                return;
            }

            throw ValidationException::withMessages($errors);
        }
    }

    private function isEmptyValue(mixed $value): bool
    {
        if ($value === null || $value === '') {
            return true;
        }

        if (is_array($value) && count($value) === 0) {
            return true;
        }

        return false;
    }
}
