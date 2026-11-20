import { describe, expect, it } from 'vitest';
import { allowedOptions, choiceFilterOf, pruneCascadeAnswers } from './choice-filter';

const cantones = ['Portoviejo', 'Manta', 'Guayaquil', 'Olmedo', 'Otro'];
const filter = { question_id: 'prov', parents: [['Manabí'], ['Manabí'], ['Guayas'], ['Manabí', 'Guayas'], []] };

describe('opciones en cascada', () => {
  it('muestra solo los cantones de la provincia elegida y los que no dependen de nada', () => {
    expect(allowedOptions(cantones, filter, 'Manabí')).toEqual(['Portoviejo', 'Manta', 'Olmedo', 'Otro']);
    expect(allowedOptions(cantones, filter, 'Guayas')).toEqual(['Guayaquil', 'Olmedo', 'Otro']);
    expect(allowedOptions(cantones, filter, ['Guayas', 'Manabí'])).toEqual(cantones);
  });

  it('sin respuesta en la pregunta origen solo quedan las opciones libres', () => {
    expect(allowedOptions(cantones, filter, undefined)).toEqual(['Otro']);
    expect(allowedOptions(cantones, null, undefined)).toEqual(cantones);
  });

  it('lee la configuración de forma tolerante', () => {
    expect(choiceFilterOf({ choice_filter: filter })).toEqual(filter);
    expect(choiceFilterOf({ choice_filter: { question_id: '', parents: [] } })).toBeNull();
    expect(choiceFilterOf(null)).toBeNull();
  });

  it('al cambiar la provincia quita el cantón y la parroquia que ya no corresponden', () => {
    const questions = [
      { id: 'prov', type: 'SINGLE_CHOICE', order: 1, options: ['Manabí', 'Guayas'] },
      { id: 'canton', type: 'SINGLE_CHOICE', order: 2, options: cantones, properties: { choice_filter: filter } },
      {
        id: 'parroquia', type: 'MULTIPLE_CHOICE', order: 3, options: ['Tarqui', 'Los Esteros'],
        properties: { choice_filter: { question_id: 'canton', parents: [['Manta'], ['Manta']] } },
      },
    ];
    const answers = { prov: 'Guayas', canton: 'Manta', parroquia: ['Tarqui'], otra: 'x' };

    expect(pruneCascadeAnswers(questions, answers)).toEqual({ prov: 'Guayas', parroquia: [], otra: 'x' });
    expect(pruneCascadeAnswers(questions, { ...answers, prov: 'Manabí' })).toEqual({ ...answers, prov: 'Manabí' });
  });
});

describe('subpregunta «mostrar solo si se elige…»', () => {
  it('lee la condición y la compara con opción única o múltiple', async () => {
    const { showIfOf, showIfMatches } = await import('./choice-filter');
    expect(showIfOf({ show_if: { options: ['Otro'] } })).toEqual(['Otro']);
    expect(showIfOf({ show_if: { options: [] } })).toBeNull();
    expect(showIfOf({})).toBeNull();
    expect(showIfMatches(['Otro'], ['Fuerzas Armadas', 'Otro'])).toBe(true);
    expect(showIfMatches(['Otro'], ['Fuerzas Armadas'])).toBe(false);
    expect(showIfMatches(['Otro'], 'Otro')).toBe(true);
    expect(showIfMatches(['Otro'], undefined)).toBe(false);
  });
});
