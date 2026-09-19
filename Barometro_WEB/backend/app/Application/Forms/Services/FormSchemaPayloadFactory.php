<?php

namespace App\Application\Forms\Services;

use App\Models\Form;
use App\Models\FormQuestion;

class FormSchemaPayloadFactory
{
    public function surveyFromForm(Form $form): array
    {
        return [
            'id' => $form->id,
            'title' => $form->title,
            'description' => $form->description,
            'state' => $form->state,
            'link_uuid' => $form->link_uuid,
            'step_by_step' => (bool) $form->step_by_step,
            'owner_user_id' => $form->user_id,
            'created_at' => optional($form->created_at)?->toISOString(),
            'updated_at' => optional($form->updated_at)?->toISOString(),
        ];
    }

    public function questionsFromForm(Form $form): array
    {
        return $form->questions
            ->sortBy('order')
            ->values()
            ->map(function (FormQuestion $question) use ($form) {
                return [
                    'id' => $question->id,
                    'survey_id' => $form->id,
                    'type' => $this->mapQuestionType($question->type),
                    'label' => $question->label,
                    'required' => (bool) $question->required,
                    'order' => (int) $question->order,
                    'help_text' => null,
                    'properties' => $this->buildQuestionProperties($question),
                    'created_at' => optional($question->created_at)?->toISOString(),
                    'updated_at' => optional($question->updated_at)?->toISOString(),
                ];
            })
            ->all();
    }

    private function mapQuestionType(string $type): string
    {
        return match ($type) {
            'TEXT' => 'TEXT',
            default => $type,
        };
    }

    private function buildQuestionProperties(FormQuestion $question): array
    {
        $properties = [
            'source_type' => $question->type,
            'section_name' => $question->section_name,
            'parent_question_id' => $question->parent_question_id,
            'branch_rules' => $question->branch_rules ?? [],
        ];

        if (is_array($question->options)) {
            $properties['options'] = $question->options;

            if ($question->type === 'LIKERT') {
                $properties['rows'] = isset($question->options['rows']) && is_array($question->options['rows'])
                    ? array_values($question->options['rows'])
                    : [];

                $properties['columns'] = isset($question->options['columns']) && is_array($question->options['columns'])
                    ? array_values($question->options['columns'])
                    : [];
            }
        } else {
            $properties['options'] = [];
        }

        return $properties;
    }
}
