<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

class ArithmeticExpressionEvaluator
{
    public function evaluate(string $expression): ?float
    {
        $source = preg_replace('/\s+/', '', $expression);
        preg_match_all('/(?:\d+(?:\.\d+)?|\.\d+|[()+\-*\/])/', $source, $matches);
        $tokens = $matches[0];
        if ($tokens === [] || implode('', $tokens) !== $source) {
            return null;
        }
        $index = 0;
        $result = $this->parse($tokens, $index, 0);

        return $result !== null && $index === count($tokens) && is_finite($result) ? $result : null;
    }

    private function parse(array $tokens, int &$index, int $minimum): ?float
    {
        $left = $this->primary($tokens, $index);
        if ($left === null) {
            return null;
        }
        while (($precedence = $this->precedence($tokens[$index] ?? null)) >= $minimum) {
            $operator = $tokens[$index++];
            $right = $this->parse($tokens, $index, $precedence + 1);
            if ($right === null || ($operator === '/' && $right == 0.0)) {
                return null;
            }
            $left = match ($operator) {
                '+' => $left + $right,
                '-' => $left - $right,
                '*' => $left * $right,
                '/' => $left / $right,
            };
            if (! is_finite($left)) {
                return null;
            }
        }

        return $left;
    }

    private function primary(array $tokens, int &$index): ?float
    {
        $token = $tokens[$index++] ?? null;
        if ($token === '+' || $token === '-') {
            $value = $this->primary($tokens, $index);

            return $value === null ? null : ($token === '-' ? -$value : $value);
        }
        if ($token === '(') {
            $value = $this->parse($tokens, $index, 0);

            return ($tokens[$index++] ?? null) === ')' ? $value : null;
        }

        return is_string($token) && preg_match('/^(?:\d+(?:\.\d+)?|\.\d+)$/', $token)
            ? (float) $token : null;
    }

    private function precedence(?string $operator): int
    {
        return match ($operator) {
            '*', '/' => 2,
            '+', '-' => 1,
            default => -1,
        };
    }
}
