import { TestBed } from '@angular/core/testing';
import { QuestionFactoryService } from './question-factory.service';

describe('QuestionFactoryService', () => {
  let service: QuestionFactoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuestionFactoryService);
  });

  it('crea una pregunta Likert con escala por defecto', () => {
    const question = service.create('LIKERT', 1);

    expect(question.type).toBe('LIKERT');
    if (question.type === 'LIKERT') {
      expect(question.scaleMin).toBe(1);
      expect(question.scaleMax).toBe(5);
    }
  });

  it('crea selección múltiple con opciones iniciales', () => {
    const question = service.create('MULTIPLE_CHOICE', 2);

    expect(question.type).toBe('MULTIPLE_CHOICE');
    if (question.type === 'MULTIPLE_CHOICE') {
      expect(question.options.length).toBeGreaterThanOrEqual(2);
    }
  });
});
