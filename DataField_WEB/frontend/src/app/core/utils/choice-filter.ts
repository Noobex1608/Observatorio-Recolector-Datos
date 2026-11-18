import type { ChoiceFilter } from '@core/services/form.service';

/** Lectura tolerante de `properties.choice_filter` (opciones en cascada). */
export function choiceFilterOf(properties: unknown): ChoiceFilter | null {
  const filter = properties && typeof properties === 'object' ? (properties as Record<string, unknown>)['choice_filter'] : null;
  if (!filter || typeof filter !== 'object') return null;
  const { question_id, parents } = filter as Record<string, unknown>;
  if (typeof question_id !== 'string' || !question_id || !Array.isArray(parents)) return null;
  return {
    question_id,
    parents: parents.map((entry) => (Array.isArray(entry) ? entry.filter((item) => typeof item === 'string' || typeof item === 'number').map(String) : [])),
  };
}

/** Respuestas elegidas en la pregunta origen, como lista de textos. */
export function selectedValues(answer: unknown): string[] {
  if (Array.isArray(answer)) return answer.filter((item) => typeof item === 'string' || typeof item === 'number').map(String);
  if (typeof answer === 'string' || typeof answer === 'number') return String(answer) === '' ? [] : [String(answer)];
  return [];
}

/**
 * Opciones que se muestran según lo respondido en la pregunta origen. Las opciones sin padre se
 * muestran siempre; mientras la pregunta origen no tenga respuesta, solo esas.
 */
export function allowedOptions(options: string[], filter: ChoiceFilter | null, sourceAnswer: unknown): string[] {
  if (!filter) return options;
  const selected = new Set(selectedValues(sourceAnswer));
  return options.filter((_, index) => {
    const parents = filter.parents[index] ?? [];
    return parents.length === 0 || parents.some((parent) => selected.has(parent));
  });
}

interface CascadeQuestion {
  id: string;
  type: string;
  order?: number;
  options?: unknown;
  properties?: unknown;
}

/**
 * Quita de las respuestas las opciones que dejaron de corresponder (cambió la provincia, el cantón
 * elegido ya no aplica). Recorre en orden para que la limpieza siga la cadena provincia → cantón → parroquia.
 */
export function pruneCascadeAnswers<T extends Record<string, unknown>>(questions: CascadeQuestion[], answers: T): T {
  let next = answers;
  const ordered = [...questions].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  for (const question of ordered) {
    if (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE') continue;
    const filter = choiceFilterOf(question.properties);
    const current = next[question.id];
    if (!filter || current === undefined || current === null || current === '') continue;
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    const allowed = new Set(allowedOptions(options, filter, next[filter.question_id]));
    if (Array.isArray(current)) {
      const kept = current.filter((value) => allowed.has(String(value)));
      if (kept.length !== current.length) next = { ...next, [question.id]: kept };
    } else if (!allowed.has(String(current))) {
      const copy = { ...next };
      delete copy[question.id];
      next = copy as T;
    }
  }
  return next;
}
