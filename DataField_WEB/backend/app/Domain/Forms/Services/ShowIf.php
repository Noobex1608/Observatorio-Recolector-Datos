<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

use App\Models\FormQuestion;
use Illuminate\Support\Collection;

/**
 * Subpregunta condicionada a opciones de su pregunta padre (de opción única o múltiple):
 * `properties.show_if = { "options": ["Otro (especifique)"] }`. La subpregunta se muestra solo si
 * entre lo elegido en el padre está alguna de esas opciones. Sin `show_if` vale la regla de siempre:
 * se muestra si el padre tiene cualquier respuesta.
 */
final class ShowIf
{
    public const PARENT_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'];

    /** @return list<string>|null */
    public static function optionsOf(mixed $properties): ?array
    {
        $showIf = is_array($properties) ? ($properties['show_if'] ?? null) : null;
        if (! is_array($showIf) || ! is_array($showIf['options'] ?? null)) {
            return null;
        }
        $options = array_values(array_unique(array_map('strval', array_filter($showIf['options'], 'is_scalar'))));

        return $options === [] ? null : $options;
    }

    /** ¿La respuesta del padre habilita la subpregunta? */
    public static function matches(array $options, mixed $parentAnswer): bool
    {
        $selected = is_array($parentAnswer)
            ? array_map('strval', array_filter($parentAnswer, 'is_scalar'))
            : (is_scalar($parentAnswer) && $parentAnswer !== '' ? [(string) $parentAnswer] : []);

        return array_intersect($options, $selected) !== [];
    }

    /**
     * Error de configuración o null si es válida.
     *
     * @param  Collection<string, FormQuestion>  $byId
     */
    public static function configurationError(FormQuestion $question, Collection $byId): ?string
    {
        $raw = is_array($question->properties) ? ($question->properties['show_if'] ?? null) : null;
        if ($raw === null) {
            return null;
        }
        $options = self::optionsOf($question->properties);
        if ($options === null) {
            return __('La condición «mostrar solo si» no tiene opciones.');
        }
        $parent = $question->parent_question_id ? ($byId[$question->parent_question_id] ?? null) : null;
        if (! $parent || ! in_array($parent->type, self::PARENT_TYPES, true)) {
            return __('Solo una subpregunta de una pregunta de opción única o múltiple puede mostrarse según la opción elegida.');
        }
        $parentOptions = array_map('strval', is_array($parent->options) ? array_values($parent->options) : []);
        if (array_diff($options, $parentOptions) !== []) {
            return __('La condición «mostrar solo si» menciona opciones que no tiene la pregunta padre.');
        }

        return null;
    }
}
