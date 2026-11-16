<?php

declare(strict_types=1);

namespace App\Application\Responses\Services;

use App\Models\Form;
use Generator;

class ResponseExportMatrixBuilder
{
    /** @return array{headers: array, rows: Generator} */
    public function build(Form $form): array
    {
        $headers = ['start', 'end'];
        $columns = [];
        foreach ($form->questions as $question) {
            $likertRows = $question->type === 'LIKERT' && is_array($question->options)
                ? ($question->options['rows'] ?? null) : null;
            if (in_array($question->type, ['MULTIPLE_CHOICE', 'SINGLE_CHOICE'], true) && is_array($question->options)) {
                $headers[] = $question->label;
                $columns[] = ['type' => 'choice_summary', 'id' => $question->id];
                foreach ($question->options as $option) {
                    $headers[] = "{$question->label}/{$option}";
                    $columns[] = ['type' => 'choice_option', 'id' => $question->id,
                        'question_type' => $question->type, 'option' => $option];
                }
            } elseif (is_array($likertRows) && $likertRows !== []) {
                foreach ($likertRows as $rowLabel) {
                    $headers[] = count($likertRows) > 1 ? "{$question->label}/{$rowLabel}" : $question->label;
                    $columns[] = ['type' => 'likert_row', 'id' => $question->id, 'row' => $rowLabel];
                }
            } else {
                $headers[] = $question->label;
                $columns[] = ['type' => 'simple', 'id' => $question->id, 'question_type' => $question->type];
            }
        }
        $headers = array_merge($headers, [
            '_id', '_uuid', '_submission_time', '_validation_status', '_notes', '_status',
            '_submitted_by', '__version__', '_tags', 'meta/rootUuid', '_index',
        ]);

        return ['headers' => $headers, 'rows' => $this->rows($form, $columns)];
    }

    private function rows(Form $form, array $columns): Generator
    {
        foreach ($form->responses()->orderBy('created_at')->orderBy('id')->cursor() as $index => $response) {
            $serial = $response->created_at ? ($response->created_at->timestamp / 86400) + 25569 : '';
            $data = is_array($response->data) ? $response->data : [];
            $meta = is_array($response->respondent_meta) ? $response->respondent_meta : [];
            $row = [$serial, $serial];
            foreach ($columns as $column) {
                $answer = $data[$column['id']] ?? null;
                $row[] = match ($column['type']) {
                    'choice_option' => in_array($column['option'],
                        $column['question_type'] === 'MULTIPLE_CHOICE'
                            ? (is_array($answer) ? $answer : ($answer ? [$answer] : []))
                            : (is_scalar($answer) && $answer !== '' ? [(string) $answer] : []), true) ? '1' : '0',
                    'likert_row' => is_array($answer) ? ($answer[$column['row']] ?? '') : '',
                    default => is_array($answer)
                        ? implode(' ', array_map(fn ($value) => is_scalar($value) ? (string) $value : json_encode($value), $answer))
                        : (($column['question_type'] ?? null) === 'NUMBER' && is_numeric($answer)
                            ? (float) $answer : ($answer ?? '')),
                };
            }
            yield array_merge($row, [
                $index + 1, (string) $response->id, $serial, '', '', 'submitted_via_web', '',
                $data['__version__'] ?? $data['_version'] ?? $meta['__version__'] ?? '',
                '', "uuid:{$response->id}", $index + 1,
            ]);
        }
    }
}
