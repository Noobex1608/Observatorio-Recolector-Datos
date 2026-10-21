<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

use App\Models\FormQuestion;
use Illuminate\Support\Collection;

class FormFlowEngine
{
    /**
     * Determine questions in the active submission flow considering branch rules and skip logic.
     *
     * @param  Collection<int, FormQuestion>  $questions
     * @param  array<string, mixed>  $responseValues
     * @return Collection<int, FormQuestion>
     */
    public function calculateActiveQuestions(Collection $questions, array $responseValues, bool $stepByStep = true): Collection
    {
        $questionsByOrder = $questions->sortBy('order')->values();

        if ($questionsByOrder->isEmpty()) {
            return collect();
        }

        $activeQuestions = collect();
        $positions = $questionsByOrder->pluck('id')->flip()->all();
        $targets = [];
        foreach ($questionsByOrder as $question) {
            foreach ($question->branch_rules ?? [] as $rule) {
                if (($rule['action'] ?? (isset($rule['next_question_id']) ? 'GO_TO' : 'CONTINUE')) === 'GO_TO'
                    && isset($rule['next_question_id'])) {
                    $targets[$rule['next_question_id']] = true;
                }
            }
        }

        for ($index = 0; $index < $questionsByOrder->count();) {
            $question = $questionsByOrder[$index];

            if ($question->parent_question_id) {
                $parent = $activeQuestions->firstWhere('id', $question->parent_question_id);
                $parentAnswer = $parent ? ($responseValues[$parent->id] ?? null) : null;
                if (! $parent || $parentAnswer === null || $parentAnswer === '' || $parentAnswer === []) {
                    $index++;

                    continue;
                }
            }

            $activeQuestions->push($question);

            if (! $stepByStep) {
                $index++;

                continue;
            }

            $answer = $responseValues[$question->id] ?? null;
            $decision = $answer !== null ? $this->evaluateBranchRule($question, $answer) : null;
            if (($decision['action'] ?? null) === 'END_FORM') {
                break;
            }
            $target = $decision['next_question_id'] ?? null;
            if (($decision['action'] ?? null) === 'GO_TO' && isset($positions[$target]) && $positions[$target] > $index) {
                $index = $positions[$target];

                continue;
            }
            $index++;
            while ($index < $questionsByOrder->count() && isset($targets[$questionsByOrder[$index]->id])) {
                $index++;
            }
        }

        return $activeQuestions;
    }

    /**
     * Evaluate branch rules for a single question based on given answer.
     *
     * @return array{action: string, next_question_id?: string|null}|null
     */
    public function evaluateBranchRule(FormQuestion $question, mixed $answer): ?array
    {
        if (empty($question->branch_rules) || ! is_array($question->branch_rules)) {
            return null;
        }

        $options = $question->options ?? [];

        foreach ($question->branch_rules as $rule) {
            $optionIndex = $rule['option_index'] ?? null;
            $action = $rule['action'] ?? (isset($rule['next_question_id']) ? 'GO_TO' : 'CONTINUE');
            $nextQuestionId = $rule['next_question_id'] ?? null;

            if ($optionIndex === null) {
                continue;
            }

            $optionValue = $options[$optionIndex] ?? null;

            if ($optionValue !== null && $this->answerMatchesOption($answer, $optionValue, $optionIndex)) {
                return [
                    'action' => $action,
                    'next_question_id' => $nextQuestionId,
                ];
            }
        }

        return null;
    }

    private function answerMatchesOption(mixed $answer, mixed $optionValue, int $optionIndex): bool
    {
        if (is_string($answer) || is_numeric($answer)) {
            return (string) $answer === (string) $optionValue || (string) $answer === (string) $optionIndex;
        }

        if (is_array($answer)) {
            return in_array($optionValue, $answer, true) || in_array((string) $optionIndex, $answer, true);
        }

        return false;
    }
}
