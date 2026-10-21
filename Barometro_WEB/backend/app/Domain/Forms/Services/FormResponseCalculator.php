<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

use Illuminate\Support\Collection;

class FormResponseCalculator
{
    public function __construct(private readonly ArithmeticExpressionEvaluator $evaluator) {}

    public function calculate(Collection $questions, array $answers): array
    {
        foreach ($questions as $question) {
            if ($question->type !== 'CALCULATE') {
                continue;
            }
            $expression = $question->properties['expression'] ?? null;
            if (! is_string($expression) || trim($expression) === '') {
                unset($answers[$question->id]);

                continue;
            }
            $resolved = preg_replace_callback('/\$\{([^}]+)\}/', function ($match) use ($answers) {
                $value = $answers[$match[1]] ?? null;

                return is_numeric($value) && is_finite((float) $value) ? (string) $value : '0';
            }, $expression);
            $result = $this->evaluator->evaluate($resolved);
            $answers[$question->id] = $result !== null ? round($result, 4) : 0;
        }

        return $answers;
    }
}
