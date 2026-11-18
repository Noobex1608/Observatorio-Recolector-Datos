<?php

declare(strict_types=1);

namespace App\Application\DataCenter;

use App\Application\Responses\Services\EnqueueResponseSync;
use App\Domain\Forms\Services\ChoiceFilter;
use App\Domain\Forms\Services\FormResponseCalculator;
use App\Domain\Forms\Services\FormResponseValidator;
use App\Domain\Forms\Services\TextFormat;
use App\Models\FormQuestion;
use App\Models\FormResponse;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Correcciones de respuestas desde la aplicación (Centro de datos), sin tocar la base de datos:
 * corregir un valor, anular una respuesta o cambiar el encuestador. Cada cambio exige un motivo,
 * se guarda en el historial de la respuesta (`corrections`) y en la auditoría.
 */
final class ResponseCorrections
{
    /** Tipos que se corrigen con un valor simple; archivos, firmas, GPS, matrices y cálculos no. */
    public const EDITABLE_TYPES = ['TEXT', 'NUMBER', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DATE', 'TIME', 'DATETIME', 'RATING', 'BARCODE'];

    public function __construct(
        private readonly FormResponseValidator $validator,
        private readonly FormResponseCalculator $calculator,
        private readonly EnqueueResponseSync $sync,
    ) {}

    public function correctAnswer(string $responseId, string $questionId, mixed $value, string $reason, User $admin): FormResponse
    {
        return DB::transaction(function () use ($responseId, $questionId, $value, $reason, $admin) {
            $response = FormResponse::lockForUpdate()->findOrFail($responseId);
            $form = $response->form()->firstOrFail();
            $questions = $form->questions()->orderBy('order')->get();
            /** @var FormQuestion|null $question */
            $question = $questions->firstWhere('id', $questionId);
            abort_unless($question, 422, 'La pregunta no pertenece a este formulario.');
            abort_unless(in_array($question->type, self::EDITABLE_TYPES, true), 422,
                'Este tipo de pregunta (archivos, firma, GPS, matriz o cálculo) no se corrige desde aquí.');

            $data = is_array($response->data) ? $response->data : [];
            $before = $data[$questionId] ?? null;
            $empty = $value === null || $value === '' || $value === [];
            $format = $question->type === 'TEXT' ? TextFormat::of($question->properties) : null;
            if ($format !== null && is_string($value)) {
                $value = TextFormat::normalize($format, $value);
            }
            if ($empty) {
                unset($data[$questionId]);
            } else {
                $data[$questionId] = $value;
            }

            // Mismas reglas que un envío (obligatoria, formato, opciones y cascada), solo para esta pregunta.
            $known = array_fill_keys($questions->pluck('id')->all(), true);
            $check = array_filter($data, fn ($key) => isset($known[$key]), ARRAY_FILTER_USE_KEY);
            $this->validator->validate(collect([$question]), $check, null, $questions);

            $cleared = $this->pruneCascades($questions, $data);
            $data = $this->calculator->calculate($questions, $data);

            $after = $data[$questionId] ?? null;
            abort_if($after === $before && $cleared === [], 422, 'El valor nuevo es igual al actual.');

            $response->data = $data;
            $response->corrections = [...($response->corrections ?? []), $this->entry($admin, 'answer', $reason, [
                'question_id' => $questionId,
                'question' => $question->label,
                'before' => $before,
                'after' => $after,
                'cleared' => $cleared,
            ])];
            $response->save();

            $extra = $cleared !== [] ? ' Se vaciaron por depender de ella: '.implode(', ', array_column($cleared, 'question')).'.' : '';
            AuditLogService::log($admin, 'CORRECT_RESPONSE', 'respuestas',
                "Corrigió «{$question->label}» en una respuesta de «{$form->title}». Motivo: {$reason}.{$extra}", [
                    'form_id' => $form->id, 'response_id' => $response->id, 'question_id' => $questionId,
                    'before' => $before, 'after' => $after,
                ]);
            $this->sync->enqueue($response);

            return $response;
        });
    }

    public function void(string $responseId, string $reason, User $admin): FormResponse
    {
        return DB::transaction(function () use ($responseId, $reason, $admin) {
            $response = FormResponse::lockForUpdate()->findOrFail($responseId);
            $response->forceFill([
                'void_reason' => $reason,
                'voided_by' => $admin->id,
                'corrections' => [...($response->corrections ?? []), $this->entry($admin, 'void', $reason)],
            ])->save();
            $response->delete();

            AuditLogService::log($admin, 'VOID_RESPONSE', 'respuestas',
                "Anuló una respuesta de «{$response->form?->title}». Motivo: {$reason}.", [
                    'form_id' => $response->form_id, 'response_id' => $response->id,
                ]);

            return $response;
        });
    }

    /** Personas a las que se puede atribuir la respuesta: asignadas al formulario o al proyecto. */
    public function collectorCandidates(FormResponse $response): Collection
    {
        $form = $response->form()->firstOrFail();
        $ids = DB::table('form_user_shares')->where('form_id', $form->id)->pluck('user_id')
            ->merge(DB::table('project_collectors')->where('project_id', $form->project_id)->pluck('user_id'))
            ->merge(DB::table('project_zone_user_assignments as a')->join('project_zones as z', 'z.id', '=', 'a.zone_id')
                ->where('z.project_id', $form->project_id)->whereNull('z.deleted_at')->pluck('a.user_id'))
            ->filter()->unique()->values();

        return User::whereIn('id', $ids)->where('is_active', true)->orderBy('name')->get(['id', 'name', 'email', 'rol']);
    }

    public function reassignCollector(string $responseId, int $userId, string $reason, User $admin): FormResponse
    {
        return DB::transaction(function () use ($responseId, $userId, $reason, $admin) {
            $response = FormResponse::lockForUpdate()->findOrFail($responseId);
            $collector = $this->collectorCandidates($response)->firstWhere('id', $userId);
            abort_unless($collector, 422, 'Esa persona no está asignada a este formulario ni a su proyecto.');
            abort_if($response->user_id === $userId, 422, 'La respuesta ya está a nombre de esa persona.');

            $previous = $response->user()->withTrashed()->first();
            $response->forceFill([
                'user_id' => $userId,
                'corrections' => [...($response->corrections ?? []), $this->entry($admin, 'collector', $reason, [
                    'before' => $previous ? "{$previous->name} ({$previous->email})" : null,
                    'after' => "{$collector->name} ({$collector->email})",
                ])],
            ])->save();

            AuditLogService::log($admin, 'REASSIGN_RESPONSE', 'respuestas',
                "Cambió el encuestador de una respuesta de «{$response->form?->title}» a {$collector->email}. Motivo: {$reason}.", [
                    'form_id' => $response->form_id, 'response_id' => $response->id,
                    'before_user_id' => $previous?->id, 'after_user_id' => $userId,
                ]);
            $this->sync->enqueue($response);

            return $response;
        });
    }

    /**
     * Si cambia una respuesta de la que dependen opciones en cascada (provincia → cantón), quita los
     * valores que ya no corresponden, en orden, para seguir la cadena.
     *
     * @param  Collection<int, FormQuestion>  $questions
     * @return list<array{question_id:string, question:string, before:mixed}>
     */
    private function pruneCascades(Collection $questions, array &$data): array
    {
        $cleared = [];
        foreach ($questions as $question) {
            $filter = in_array($question->type, ChoiceFilter::CHILD_TYPES, true) ? ChoiceFilter::of($question->properties) : null;
            $current = $data[$question->id] ?? null;
            if ($filter === null || $current === null || $current === '' || $current === []) {
                continue;
            }
            $allowed = ChoiceFilter::allowed(array_map('strval', array_values($question->options ?? [])), $filter, $data[$filter['question_id']] ?? null);
            $kept = is_array($current)
                ? array_values(array_filter($current, fn ($item) => in_array((string) $item, $allowed, true)))
                : (in_array((string) $current, $allowed, true) ? $current : null);
            if ($kept === $current) {
                continue;
            }
            $cleared[] = ['question_id' => $question->id, 'question' => $question->label, 'before' => $current];
            if ($kept === null || $kept === []) {
                unset($data[$question->id]);
            } else {
                $data[$question->id] = $kept;
            }
        }

        return $cleared;
    }

    /** @return array<string, mixed> */
    private function entry(User $admin, string $type, string $reason, array $extra = []): array
    {
        return [
            'type' => $type,
            ...$extra,
            'reason' => $reason,
            'by_id' => $admin->id,
            'by' => $admin->name,
            'at' => now()->toIso8601String(),
        ];
    }
}
