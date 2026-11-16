<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Forms\Services\FormFlowEngine;
use App\Domain\Forms\Services\FormResponseValidator;
use App\Models\FormQuestion;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class FormFlowAndResponseValidationTest extends TestCase
{
    public function test_branch_skips_unvisited_required_question(): void
    {
        $first = $this->question('first', 1, 'SINGLE_CHOICE', ['Sí', 'No'], true);
        $first->branch_rules = [['option_index' => 1, 'action' => 'GO_TO', 'next_question_id' => 'last']];
        $skipped = $this->question('skipped', 2, 'TEXT', [], true);
        $last = $this->question('last', 3, 'NUMBER', [], true);
        $questions = collect([$first, $skipped, $last]);
        $answers = ['first' => 'No', 'last' => 0];

        $active = (new FormFlowEngine)->calculateActiveQuestions($questions, $answers, true);
        $this->assertSame(['first', 'last'], $active->pluck('id')->all());
        (new FormResponseValidator)->validate($active, $answers, null, $questions);
    }

    public function test_rejects_unknown_fields_invalid_dates_and_incomplete_ranking(): void
    {
        $date = $this->question('date', 1, 'DATE', [], true);
        $ranking = $this->question('ranking', 2, 'RANKING', ['A', 'B'], true);

        try {
            (new FormResponseValidator)->validate(collect([$date, $ranking]), [
                'date' => '2026-02-30', 'ranking' => ['A'], 'unexpected' => 'valor',
            ]);
            $this->fail('Se aceptó una respuesta inválida.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('data.date', $error->errors());
            $this->assertArrayHasKey('data.ranking', $error->errors());
            $this->assertArrayHasKey('data.unexpected', $error->errors());
        }
    }

    private function question(string $id, int $order, string $type, array $options, bool $required): FormQuestion
    {
        $question = new FormQuestion([
            'order' => $order, 'type' => $type, 'label' => $id,
            'options' => $options, 'required' => $required,
        ]);
        $question->id = $id;

        return $question;
    }
}
