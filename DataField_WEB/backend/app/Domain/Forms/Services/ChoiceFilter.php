<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

use App\Models\FormQuestion;
use Illuminate\Support\Collection;

/**
 * Opciones en cascada: las opciones de una pregunta dependen de lo elegido en una pregunta anterior
 * (provincia → cantón → parroquia). Se guarda en `properties.choice_filter`:
 *
 *   { "question_id": "<id de la pregunta de la que depende>", "parents": [["Manabí"], ["Manabí"], ["Guayas"], []] }
 *
 * `parents[i]` son las opciones de la pregunta origen que muestran la opción i; vacío = se muestra siempre.
 */
final class ChoiceFilter
{
    public const CHILD_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'];

    public const SOURCE_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'];

    /** @return array{question_id:string, parents:list<list<string>>}|null */
    public static function of(mixed $properties): ?array
    {
        $filter = is_array($properties) ? ($properties['choice_filter'] ?? null) : null;
        if (! is_array($filter) || ! is_string($filter['question_id'] ?? null) || ! is_array($filter['parents'] ?? null)) {
            return null;
        }

        return [
            'question_id' => $filter['question_id'],
            'parents' => array_values(array_map(
                fn ($entry) => is_array($entry) ? array_values(array_map('strval', array_filter($entry, 'is_scalar'))) : [],
                $filter['parents'],
            )),
        ];
    }

    /**
     * Opciones disponibles según la respuesta de la pregunta origen. Sin respuesta en el origen solo
     * quedan las opciones que no dependen de nada.
     *
     * @param  list<string>  $options
     * @param  array{question_id:string, parents:list<list<string>>}  $filter
     * @return list<string>
     */
    public static function allowed(array $options, array $filter, mixed $sourceAnswer): array
    {
        $selected = is_array($sourceAnswer)
            ? array_map('strval', array_filter($sourceAnswer, 'is_scalar'))
            : (is_scalar($sourceAnswer) && $sourceAnswer !== '' ? [(string) $sourceAnswer] : []);

        $allowed = [];
        foreach (array_values($options) as $index => $option) {
            $parents = $filter['parents'][$index] ?? [];
            if ($parents === [] || array_intersect($parents, $selected) !== []) {
                $allowed[] = (string) $option;
            }
        }

        return $allowed;
    }

    /**
     * Error de configuración o null si es válida.
     *
     * @param  Collection<string, FormQuestion>  $byId
     * @param  array<string, int>  $positions
     */
    public static function configurationError(FormQuestion $question, Collection $byId, array $positions): ?string
    {
        $filter = self::of($question->properties);
        if ($filter === null) {
            return is_array($question->properties) && array_key_exists('choice_filter', $question->properties)
                && $question->properties['choice_filter'] !== null
                ? 'Las opciones en cascada no tienen un formato válido.' : null;
        }
        if (! in_array($question->type, self::CHILD_TYPES, true)) {
            return 'Las opciones en cascada solo se usan en preguntas de opción única o múltiple.';
        }
        $source = $byId[$filter['question_id']] ?? null;
        if (! $source || $positions[$source->id] >= $positions[$question->id] || ! in_array($source->type, self::SOURCE_TYPES, true)) {
            return 'Las opciones en cascada deben depender de una pregunta de opciones anterior del mismo formulario.';
        }
        $options = is_array($question->options) ? array_values($question->options) : [];
        if (count($filter['parents']) !== count($options)) {
            return 'Cada opción debe indicar de qué respuestas depende.';
        }
        $sourceOptions = array_map('strval', is_array($source->options) ? array_values($source->options) : []);
        foreach ($filter['parents'] as $parents) {
            if (array_diff($parents, $sourceOptions) !== []) {
                return 'Las opciones en cascada mencionan respuestas que no existen en la pregunta de la que dependen.';
            }
        }

        return null;
    }
}
