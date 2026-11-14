import { Injectable } from '@angular/core';
import {
  ChoiceQuestion,
  LikertQuestion,
  NumberQuestion,
  Question,
  QuestionType,
  TextQuestion,
} from '../models/question.model';

@Injectable({ providedIn: 'root' })
export class QuestionFactoryService {
  create(type: QuestionType, order: number): Question {
    const base = {
      id: `q-${crypto.randomUUID()}`,
      label: 'Nueva pregunta',
      required: false,
      order,
    };

    switch (type) {
      case 'MULTIPLE_CHOICE':
        return {
          ...base,
          type,
          options: this.defaultOptions(),
          allowOther: false,
        } satisfies ChoiceQuestion;
      case 'SINGLE_CHOICE':
        return {
          ...base,
          type,
          options: this.defaultOptions(),
          allowOther: false,
        } satisfies ChoiceQuestion;
      case 'LIKERT':
        return {
          ...base,
          type,
          scaleMin: 1,
          scaleMax: 5,
          labels: { 1: 'Muy en desacuerdo', 5: 'Muy de acuerdo' },
        } satisfies LikertQuestion;
      case 'TEXT':
        return {
          ...base,
          type,
          maxLength: 500,
          placeholder: 'Escribe tu respuesta',
        } satisfies TextQuestion;
      case 'NUMBER':
        return {
          ...base,
          type,
          min: 0,
          max: 100,
          step: 1,
        } satisfies NumberQuestion;
      default:
        throw new Error(`Tipo de pregunta no soportado: ${type}`);
    }
  }

  private defaultOptions() {
    return [
      { id: `opt-${crypto.randomUUID()}`, label: 'Opción 1', value: 'opcion_1' },
      { id: `opt-${crypto.randomUUID()}`, label: 'Opción 2', value: 'opcion_2' },
    ];
  }
}
