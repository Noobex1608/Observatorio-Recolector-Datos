<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

use App\Models\FormQuestion;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class FormSchemaValidator
{
    /** @param Collection<int, FormQuestion> $questions */
    public function validateForPublication(Collection $questions): void
    {
        $ordered = $questions->sortBy('order')->values();
        $positions = $ordered->pluck('id')->flip()->all();
        $byId = $ordered->keyBy('id');
        $errors = [];
        if ($ordered->pluck('order')->unique()->count() !== $ordered->count()) {
            $errors['questions.order'] = 'Cada pregunta debe tener un orden único antes de publicar.';
        }

        foreach ($ordered as $question) {
            $position = $positions[$question->id];
            if ($question->type === 'CALCULATE') {
                $expression = $question->properties['expression'] ?? null;
                if (! is_string($expression) || trim($expression) === '') {
                    $errors["questions.{$question->id}.expression"] = 'La pregunta calculada requiere una expresión.';
                } else {
                    preg_match_all('/\$\{([^}]+)\}/', $expression, $references);
                    foreach ($references[1] as $reference) {
                        if (! isset($byId[$reference]) || $positions[$reference] >= $position
                            || ! in_array($byId[$reference]->type, ['NUMBER', 'CALCULATE'], true)) {
                            $errors["questions.{$question->id}.expression"] = 'La expresión solo puede referirse a números previos del mismo formulario.';
                        }
                    }
                    $testExpression = preg_replace('/\$\{[^}]+\}/', '1', $expression);
                    if ((new ArithmeticExpressionEvaluator)->evaluate($testExpression) === null) {
                        $errors["questions.{$question->id}.expression"] = 'La expresión aritmética no es válida.';
                    }
                }
            }
            $parentId = $question->parent_question_id;
            if ($parentId && (! isset($positions[$parentId]) || $positions[$parentId] >= $position)) {
                $errors["questions.{$question->id}.parent_question_id"] = 'La pregunta padre debe pertenecer al formulario y aparecer antes de la hija.';
            }

            $rules = $question->branch_rules ?? [];
            if ($rules !== [] && $question->type !== 'SINGLE_CHOICE') {
                $errors["questions.{$question->id}.branch_rules"] = 'Los saltos solo se admiten en selección única.';

                continue;
            }
            $options = is_array($question->options) ? array_values($question->options) : [];
            $seenOptions = [];
            foreach ($rules as $rule) {
                $index = $rule['option_index'] ?? null;
                if (! is_int($index) || ! array_key_exists($index, $options) || isset($seenOptions[$index])) {
                    $errors["questions.{$question->id}.branch_rules"] = 'Cada salto debe referirse a una opción existente una sola vez.';

                    continue;
                }
                $seenOptions[$index] = true;
                $action = $rule['action'] ?? (isset($rule['next_question_id']) ? 'GO_TO' : 'CONTINUE');
                if (! in_array($action, ['GO_TO', 'CONTINUE', 'END_FORM'], true)) {
                    $errors["questions.{$question->id}.branch_rules"] = 'Acción de salto no válida.';

                    continue;
                }
                $target = $rule['next_question_id'] ?? null;
                if ($action === 'GO_TO' && (! is_string($target) || ! isset($byId[$target]) || $positions[$target] <= $position)) {
                    $errors["questions.{$question->id}.branch_rules"] = 'El destino debe pertenecer al formulario y aparecer después del origen.';
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }
}
