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
     * @param Collection<int, FormQuestion> $questions
     * @param array<string, mixed> $responseValues
     * @return Collection<int, FormQuestion>
     */
    public function calculateActiveQuestions(Collection $questions, array $responseValues): Collection
    {
        $questionsByOrder = $questions->sortBy('order')->values();

        if ($questionsByOrder->isEmpty()) {
            return collect();
        }

        $activeQuestions = collect();
        $jumpTargetQuestionId = null;

        foreach ($questionsByOrder as $question) {
            if ($jumpTargetQuestionId !== null) {
                if ($question->id === $jumpTargetQuestionId) {
                    $jumpTargetQuestionId = null;
                } else {
                    // Skip question until target reached
                    continue;
                }
            }

            $activeQuestions->push($question);

            // Evaluate branch decision if an answer exists for this question
            $answer = $responseValues[$question->id] ?? null;

            if ($answer !== null && !empty($question->branch_rules)) {
                $decision = $this->evaluateBranchRule($question, $answer);

                if ($decision !== null) {
                    if ($decision['action'] === 'END_FORM') {
                        break;
                    }

                    if ($decision['action'] === 'GO_TO' && !empty($decision['next_question_id'])) {
                        $jumpTargetQuestionId = $decision['next_question_id'];
                    }
                }
            }
        }

        return $activeQuestions;
    }

    /**
     * Evaluate branch rules for a single question based on given answer.
     *
     * @param FormQuestion $question
     * @param mixed $answer
     * @return array{action: string, next_question_id?: string|null}|null
     */
    public function evaluateBranchRule(FormQuestion $question, mixed $answer): ?array
    {
        if (empty($question->branch_rules) || !is_array($question->branch_rules)) {
            return null;
        }

        $options = $question->options ?? [];

        foreach ($question->branch_rules as $rule) {
            $optionIndex = $rule['option_index'] ?? null;
            $action = $rule['action'] ?? 'CONTINUE';
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

    private function answerMatchesOption(mixed $answer, string $optionValue, int $optionIndex): bool
    {
        if (is_string($answer) || is_numeric($answer)) {
            return (string) $answer === $optionValue || (string) $answer === (string) $optionIndex;
        }

        if (is_array($answer)) {
            return in_array($optionValue, $answer, true) || in_array((string) $optionIndex, $answer, true);
        }

        return false;
    }
}
