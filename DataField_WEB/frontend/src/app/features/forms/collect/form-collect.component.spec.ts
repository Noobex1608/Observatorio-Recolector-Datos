import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { FormService } from '@core/services/form.service';
import { FormCollectComponent } from './form-collect.component';
import { provideSpanishTranslations } from '../../../testing/spanish-translations';

// Traducciones reales en español: las pruebas comprueban el texto que ve el usuario.
beforeEach(() => TestBed.configureTestingModule({ providers: provideSpanishTranslations() }));

const form = {
  id: 'f1', title: 'Encuesta pública', step_by_step: true,
  questions: [
    { id: 'q1', type: 'TEXT', label: 'Nombre', order: 0, required: true },
    { id: 'q2', type: 'TEXT', label: 'Comentario', order: 1, required: false },
  ],
};

function open(formService: Record<string, unknown>, route: { params?: Record<string, string>; data?: Record<string, unknown> } = {}) {
  TestBed.resetTestingModule();
  TestBed.overrideComponent(FormCollectComponent, { set: { template: '', imports: [] } });
  TestBed.configureTestingModule({
    providers: [
      ...provideSpanishTranslations(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(route.params ?? { uuid: 'abc' }), data: route.data ?? {} } } },
      { provide: FormService, useValue: formService },
    ],
  });
  const fixture = TestBed.createComponent(FormCollectComponent);
  fixture.detectChanges();
  TestBed.tick();
  return { fixture, component: fixture.componentInstance };
}

describe('Encuesta pública: el avance sobrevive a una recarga', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('restaura respuestas, consentimiento y paso; descarta claves ajenas al formulario', () => {
    const first = open({ fetchPublicForm: () => of(form) });
    first.component.acceptConsent();
    first.component.setAnswer('q1', 'Ana');
    first.component.onSubmit(); // avanza al paso 2
    TestBed.tick();

    const saved = JSON.parse(sessionStorage.getItem('uleam:collect:abc')!);
    saved.answers['pregunta-borrada'] = 'x';
    sessionStorage.setItem('uleam:collect:abc', JSON.stringify(saved));

    const reloaded = open({ fetchPublicForm: () => of(form) });
    expect(reloaded.component.answers()['q1']).toBe('Ana');
    expect(reloaded.component.answers()['pregunta-borrada']).toBeUndefined();
    expect(reloaded.component.consentAccepted()).toBe(true);
    expect(reloaded.component.currentStepIndex()).toBe(1);
  });

  it('tras enviar, recargar muestra la confirmación y reutiliza el mismo identificador de envío', () => {
    const submitResponse = vi.fn(() => of({ message: 'ok', id: 'r1' }));
    const first = open({ fetchPublicForm: () => of(form), submitResponse });
    first.component.acceptConsent();
    first.component.setAnswer('q1', 'Ana');
    first.component.onSubmit();
    first.component.onSubmit();
    TestBed.tick();
    expect(first.component.submitted()).toBe(true);
    const submissionId = (submitResponse.mock.calls[0] as unknown[])[2];

    const reloaded = open({ fetchPublicForm: () => of(form), submitResponse });
    expect(reloaded.component.submitted()).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('uleam:collect:abc')!).clientSubmissionId).toBe(submissionId);

    reloaded.component.resetForm();
    TestBed.tick();
    expect(reloaded.component.submitted()).toBe(false);
    expect(JSON.parse(sessionStorage.getItem('uleam:collect:abc')!).clientSubmissionId).not.toBe(submissionId);
  });

  it('un error al enviar se muestra sin borrar el formulario', () => {
    const { component } = open({
      fetchPublicForm: () => of(form),
      submitResponse: () => throwError(() => ({ error: { message: 'Formulario cerrado' } })),
    });
    component.acceptConsent();
    component.setAnswer('q1', 'Ana');
    component.onSubmit();
    component.onSubmit();

    expect(component.submitError()).toBe('Formulario cerrado');
    expect(component.error()).toBe('');
    expect(component.form()).not.toBeNull();
    expect(component.answers()['q1']).toBe('Ana');
  });
});

describe('Encuesta pública: formatos de correo, cédula y teléfono', () => {
  const formatted = {
    id: 'f2', title: 'Datos', step_by_step: false,
    questions: [
      { id: 'ced', type: 'TEXT', label: 'Cédula', order: 0, required: false, properties: { text_format: 'cedula_ec' } },
      { id: 'tel', type: 'TEXT', label: 'Teléfono', order: 1, required: true, properties: { text_format: 'telefono_ec' } },
    ],
  };
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('bloquea el envío con valores inválidos, aunque la pregunta sea opcional', () => {
    const submitResponse = vi.fn(() => of({ message: 'ok', id: 'r1' }));
    const { component } = open({ fetchPublicForm: () => of(formatted), submitResponse });
    component.acceptConsent();
    component.setAnswer('ced', '1710034066');
    component.setAnswer('tel', '0991234567');
    component.onSubmit();

    expect(submitResponse).not.toHaveBeenCalled();
    expect(component.questionError('ced')).toBe('La cédula no es válida: revise el último dígito.');
  });

  it('avisa al salir del campo y envía los valores normalizados', () => {
    const submitResponse = vi.fn(() => of({ message: 'ok', id: 'r1' }));
    const { component } = open({ fetchPublicForm: () => of(formatted), submitResponse });
    component.acceptConsent();
    component.setAnswer('tel', '12');
    component.checkTextFormat(formatted.questions[1] as never);
    expect(component.questionError('tel')).toContain('celular');

    component.setAnswer('ced', '171003406-5');
    component.setAnswer('tel', '+593 99 123 4567');
    component.checkTextFormat(formatted.questions[1] as never);
    expect(component.questionError('tel')).toBe('');
    component.onSubmit();

    const answers = (submitResponse.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(answers).toEqual(expect.objectContaining({ ced: '1710034065', tel: '0991234567' }));
  });
});

const cascade = {
  id: 'f2', title: 'Hogares por cantón', step_by_step: false,
  questions: [
    { id: 'prov', type: 'SINGLE_CHOICE', label: 'Provincia', order: 0, required: true, options: ['Manabí', 'Guayas'] },
    {
      id: 'canton', type: 'SINGLE_CHOICE', label: 'Cantón', order: 1, required: true,
      options: ['Portoviejo', 'Manta', 'Guayaquil'],
      properties: { choice_filter: { question_id: 'prov', parents: [['Manabí'], ['Manabí'], ['Guayas']] } },
    },
  ],
};

describe('Opciones en cascada y modo de prueba', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('filtra los cantones por provincia y quita el que deja de corresponder', () => {
    const { component } = open({ fetchPublicForm: () => of(cascade) });
    const canton = cascade.questions[1] as never;

    expect(component.getChoiceOptions(canton)).toEqual([]);
    expect(component.cascadeHint(canton)).toBe('Primero responde «Provincia» para ver las opciones.');

    component.setAnswer('prov', 'Manabí');
    expect(component.getChoiceOptions(canton)).toEqual(['Portoviejo', 'Manta']);
    component.setAnswer('canton', 'Manta');

    component.setAnswer('prov', 'Guayas');
    expect(component.getChoiceOptions(canton)).toEqual(['Guayaquil']);
    expect(component.answers()['canton']).toBeUndefined();
  });

  it('en modo de prueba carga el borrador, valida en el servidor y no usa el enlace público', () => {
    const fetchPublicForm = vi.fn();
    const submitResponse = vi.fn();
    const submitTestResponse = vi.fn(() => of({ message: 'ok', answered: 2, active_questions: 2 }));
    const { component } = open(
      { fetchTestForm: () => of({ ...cascade, test_mode: true }), fetchPublicForm, submitResponse, submitTestResponse },
      { params: { formId: 'f2' }, data: { testMode: true } },
    );

    expect(component.testMode).toBe(true);
    expect(component.form()?.title).toBe('Hogares por cantón');
    component.acceptConsent();
    component.setAnswer('prov', 'Guayas');
    component.setAnswer('canton', 'Guayaquil');
    component.onSubmit();

    expect(fetchPublicForm).not.toHaveBeenCalled();
    expect(submitResponse).not.toHaveBeenCalled();
    expect(submitTestResponse).toHaveBeenCalledWith('f2', expect.objectContaining({ prov: 'Guayas', canton: 'Guayaquil' }));
    expect(component.submitted()).toBe(true);
    expect(component.testAnswered()).toBe(2);
  });

  it('en modo de prueba marca las preguntas que el servidor rechaza', () => {
    const submitTestResponse = vi.fn(() => throwError(() => ({
      error: { message: 'Revise las respuestas.', errors: { 'data.canton': ['No corresponde a la provincia.'] } },
    })));
    const { component } = open(
      { fetchTestForm: () => of(cascade), submitTestResponse },
      { params: { formId: 'f2' }, data: { testMode: true } },
    );
    component.acceptConsent();
    component.setAnswer('prov', 'Manabí');
    component.setAnswer('canton', 'Manta');
    component.onSubmit();

    expect(component.submitted()).toBe(false);
    expect(component.questionError('canton')).toBe('No corresponde a la provincia.');
    expect(component.submitError()).toBe('Revise las respuestas.');
  });
});

const otro = {
  id: 'f3', title: 'Recinto electoral', step_by_step: true,
  questions: [
    { id: 'actores', type: 'MULTIPLE_CHOICE', label: '¿Quién obstaculizó?', order: 0, required: true, options: ['Fuerzas Armadas', 'Otro'] },
    { id: 'cual', type: 'TEXT', label: 'Especifique', order: 1, required: true, parent_question_id: 'actores', properties: { show_if: { options: ['Otro'] } } },
    { id: 'fin', type: 'TEXT', label: 'Comentario', order: 2, required: false },
  ],
};

describe('Subpregunta «solo si se elige Otro»', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('se oculta y se salta en el paso a paso si no se marcó Otro; lo escrito no se envía', () => {
    const submitResponse = vi.fn(() => of({ message: 'ok', id: 'r1' }));
    const { component } = open({ fetchPublicForm: () => of(otro), submitResponse });
    const cual = otro.questions[1] as never;
    component.acceptConsent();

    component.toggleMulti('actores', 'Fuerzas Armadas', true);
    expect(component.isQuestionActive(cual)).toBe(false);
    component.advanceStep();
    expect(component.currentQuestion()?.id).toBe('fin');

    component.goBack();
    component.toggleMulti('actores', 'Otro', true);
    expect(component.isQuestionActive(cual)).toBe(true);
    component.advanceStep();
    expect(component.currentQuestion()?.id).toBe('cual');
    component.setAnswer('cual', 'Delegados');

    // Si después desmarca «Otro», la especificación ya no se envía.
    component.toggleMulti('actores', 'Otro', false);
    component.currentStepIndex.set(2);
    component.stepHistory.set([0, 2]);
    component.advanceStep();
    const sent = (submitResponse.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(sent['actores']).toEqual(['Fuerzas Armadas']);
    expect('cual' in sent).toBe(false);
  });
});
