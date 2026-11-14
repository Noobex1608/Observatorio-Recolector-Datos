import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { FormService } from '@core/services/form.service';
import { FormCollectComponent } from './form-collect.component';

const form = {
  id: 'f1', title: 'Encuesta pública', step_by_step: true,
  questions: [
    { id: 'q1', type: 'TEXT', label: 'Nombre', order: 0, required: true },
    { id: 'q2', type: 'TEXT', label: 'Comentario', order: 1, required: false },
  ],
};

function open(formService: Record<string, unknown>) {
  TestBed.resetTestingModule();
  TestBed.overrideComponent(FormCollectComponent, { set: { template: '', imports: [] } });
  TestBed.configureTestingModule({
    providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ uuid: 'abc' }) } } },
      { provide: FormService, useValue: formService },
      { provide: TranslateService, useValue: { instant: (key: string) => key } },
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
