import { Pipe, PipeTransform } from '@angular/core';
import { QuestionType } from '../../features/surveys/models/question.model';

@Pipe({
  name: 'questionType',
})
export class QuestionTypePipe implements PipeTransform {
  transform(value: QuestionType): string {
    if (value === 'MULTIPLE_CHOICE') {
      return 'Selección múltiple';
    }

    if (value === 'SINGLE_CHOICE') {
      return 'Selección única';
    }

    if (value === 'LIKERT') {
      return 'Escala de Likert';
    }

    if (value === 'TEXT') {
      return 'Texto';
    }

    return 'Número';
  }
}
