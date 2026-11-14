<?php

namespace Tests\Unit;

use App\Domain\Forms\Services\ArithmeticExpressionEvaluator;
use PHPUnit\Framework\TestCase;

class ArithmeticExpressionEvaluatorTest extends TestCase
{
    public function test_calculates_precedence_parentheses_and_negative_values(): void
    {
        $evaluator = new ArithmeticExpressionEvaluator;
        $this->assertSame(11.0, $evaluator->evaluate('2 + 3 * (4 - 1)'));
        $this->assertSame(-2.5, $evaluator->evaluate('-(2 + 3) / 2'));
    }

    public function test_rejects_invalid_or_executable_expressions(): void
    {
        $evaluator = new ArithmeticExpressionEvaluator;
        $this->assertNull($evaluator->evaluate('1; system("id")'));
        $this->assertNull($evaluator->evaluate('1/0'));
        $this->assertNull($evaluator->evaluate('1+'));
    }
}
