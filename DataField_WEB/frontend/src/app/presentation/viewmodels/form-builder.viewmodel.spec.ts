import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { FormBuilderViewModel } from './form-builder.viewmodel';
import { FormService } from '@core/services/form.service';
import { ProjectService } from '@core/services/project.service';

describe('FormBuilderViewModel sections', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormBuilderViewModel,
        {
          provide: FormService,
          useValue: {
            getForm: () => ({})
          },
        },
        {
          provide: ProjectService,
          useValue: {
            getProjects: () => []
          },
        },
        {
          provide: TranslateService,
          useValue: {
            instant: (key: string) => key,
          },
        },
      ],
    });
  });

  it('creates a section and assigns a question to it', () => {
    const vm = TestBed.inject(FormBuilderViewModel);

    vm.addSection('Salud');
    vm.addQuestion('TEXT');

    expect(vm.sections().length).toBe(1);
    expect(vm.sections()[0].title).toBe('Salud');

    vm.assignQuestionToSection(vm.questions()[0].tempId, vm.sections()[0].tempId);

    expect(vm.getQuestionsForSection(vm.sections()[0].tempId).length).toBe(1);
    expect(vm.getQuestionsForSection(null).length).toBe(0);
  });

  it('reorders questions by dragging one to another position', () => {
    const vm = TestBed.inject(FormBuilderViewModel);

    vm.addQuestion('TEXT');
    vm.addQuestion('NUMBER');

    const firstTempId = vm.questions()[0].tempId;
    const secondTempId = vm.questions()[1].tempId;

    vm.reorderQuestion(secondTempId, firstTempId, 'before');

    expect(vm.questions()[0].tempId).toBe(secondTempId);
    expect(vm.questions()[1].tempId).toBe(firstTempId);
    expect(vm.questions()[0].order).toBe(0);
    expect(vm.questions()[1].order).toBe(1);
  });

  it('adds questions at the end of the chosen section or right below another one', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    const salud = vm.addSection('Salud')!;
    const empleo = vm.addSection('Empleo')!;

    const a = vm.addQuestion('TEXT', { sectionTempId: salud })!;
    const b = vm.addQuestion('TEXT', { sectionTempId: empleo })!;
    const c = vm.addQuestion('NUMBER', { sectionTempId: salud })!;
    const d = vm.addQuestion('TEXT', { afterTempId: a })!;
    const e = vm.addQuestion('TEXT')!; // sin destino: última sección

    expect(vm.getQuestionTreeForSection(salud).map((entry) => entry.question.tempId)).toEqual([a, d, c]);
    expect(vm.getQuestionTreeForSection(empleo).map((entry) => entry.question.tempId)).toEqual([b, e]);
    expect(vm.questions().map((question) => question.tempId)).toEqual([a, d, c, b, e]);
    expect(vm.questions().map((question) => question.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('moves sections with all their questions and keeps the saved order in sync', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    const first = vm.addSection('Uno')!;
    const second = vm.addSection('Dos')!;
    const q1 = vm.addQuestion('TEXT', { sectionTempId: first })!;
    const q2 = vm.addQuestion('TEXT', { sectionTempId: second })!;

    expect(vm.moveSection(second, -1)).toBe(true);
    expect(vm.sections().map((section) => section.tempId)).toEqual([second, first]);
    expect(vm.questions().map((question) => question.tempId)).toEqual([q2, q1]);
    expect(vm.moveSection(second, -1)).toBe(false);
  });

  it('moves a question only among its siblings and carries its subquestions', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    const section = vm.addSection('S')!;
    const a = vm.addQuestion('TEXT', { sectionTempId: section })!;
    const child = vm.addSubquestion(a)!;
    const b = vm.addQuestion('TEXT', { sectionTempId: section })!;

    expect(vm.moveQuestion(b, -1)).toBe(true);
    expect(vm.questions().map((question) => question.tempId)).toEqual([b, a, child]);
    expect(vm.moveQuestion(b, -1)).toBe(false);
    expect(vm.moveQuestion(child, -1)).toBe(false);
  });

  it('assigning a section moves the subquestions too', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    const s1 = vm.addSection('A')!;
    const s2 = vm.addSection('B')!;
    const parent = vm.addQuestion('TEXT', { sectionTempId: s1 })!;
    const child = vm.addSubquestion(parent)!;

    vm.assignQuestionToSection(parent, s2);

    expect(vm.getQuestionTreeForSection(s2).map((entry) => entry.question.tempId)).toEqual([parent, child]);
    expect(vm.getQuestionTreeForSection(s1)).toEqual([]);
  });

  it('duplicates a question with new ids right below the original', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    const original = vm.addQuestion('SINGLE_CHOICE')!;
    vm.updateQuestionLabel(original, '¿Trabaja?');
    vm.setOptionsFromText(original, 'Sí\nNo');
    const other = vm.addQuestion('TEXT')!;

    const copy = vm.duplicateQuestion(original)!;

    expect(vm.questions().map((question) => question.tempId)).toEqual([original, copy, other]);
    const copied = vm.questions()[1];
    expect(copied.label).toBe('¿Trabaja?');
    expect(copied.options).toEqual(['Sí', 'No']);
    expect(copied.id).toBeUndefined();
    expect(copied.branchRules).toHaveLength(2);
  });

  it('pastes options one per line, removing bullets and empty lines', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    const q = vm.addQuestion('SINGLE_CHOICE')!;

    expect(vm.setOptionsFromText(q, '- Manabí\n\n2. Guayas\r\n• Pichincha  ')).toBe(3);
    expect(vm.questions()[0].options).toEqual(['Manabí', 'Guayas', 'Pichincha']);
    expect(vm.questions()[0].branchRules.map((rule) => rule.optionIndex)).toEqual([0, 1, 2]);
    expect(vm.setOptionsFromText(q, '   \n')).toBe(0);
  });

  it('removes a question with its subquestions and can undo it', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    const parent = vm.addQuestion('TEXT')!;
    vm.addSubquestion(parent);
    vm.addQuestion('TEXT');

    vm.removeQuestion(parent);
    expect(vm.questions()).toHaveLength(1);
    expect(vm.undoState()?.message).toContain('1 subpregunta');

    vm.undo();
    expect(vm.questions()).toHaveLength(3);
    expect(vm.undoState()).toBeNull();
  });

  it('tracks unsaved changes and flags incomplete questions', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    expect(vm.isDirty()).toBe(false);

    const q = vm.addQuestion('SINGLE_CHOICE')!;
    expect(vm.isDirty()).toBe(true);
    expect(vm.incompleteQuestionIds().has(q)).toBe(true);
    expect(vm.questionIssue(vm.questions()[0])).toBe('Falta el enunciado');

    vm.updateQuestionLabel(q, 'Pregunta');
    expect(vm.questionIssue(vm.questions()[0])).toBe('Faltan opciones');
    vm.setOptionsFromText(q, 'A\nB');
    expect(vm.incompleteQuestionIds().size).toBe(0);

    vm.markClean();
    expect(vm.isDirty()).toBe(false);
  });

  it('loads questions imported from Excel, reusing sections and linking jumps, subquestions and calculations', () => {
    const vm = TestBed.inject(FormBuilderViewModel);
    const existingSection = vm.addSection('Hogar')!;
    const existing = vm.addQuestion('TEXT', { sectionTempId: existingSection })!;
    const preview = {
      title: 'Hogares', sections: ['Hogar', 'Opinión'], errors: [], warnings: [], valid: true,
      summary: { sections: 2, questions: 4 },
      questions: [
        { temp_id: 'a', row: 2, name: 'hijos', type: 'SINGLE_CHOICE' as const, label: '¿Tiene hijos?', required: true,
          options: ['Sí', 'No'], properties: {}, section_name: 'Hogar', parent_temp_id: null,
          branch_rules: [{ option_index: 1, action: 'GO_TO' as const, next_temp_id: 'c' }] },
        { temp_id: 'b', row: 3, name: 'cuantos', type: 'NUMBER' as const, label: '¿Cuántos?', required: true,
          options: null, properties: {}, section_name: 'Hogar', parent_temp_id: 'a', branch_rules: [] },
        { temp_id: 'c', row: 4, name: 'sat', type: 'LIKERT' as const, label: 'Satisfacción', required: false,
          options: { rows: ['Salud'], columns: ['Malo', 'Bueno'] }, properties: {}, section_name: 'Opinión', parent_temp_id: null, branch_rules: [] },
        { temp_id: 'd', row: 5, name: 'doble', type: 'CALCULATE' as const, label: 'Doble', required: false,
          options: null, properties: { expression: '${b} * 2' }, section_name: 'Opinión', parent_temp_id: null, branch_rules: [] },
      ],
    };

    const ids = vm.importQuestions(preview, 'append');

    expect(ids).toHaveLength(4);
    expect(vm.sections().map((section) => section.title)).toEqual(['Hogar', 'Opinión']);
    const [hijos, cuantos, sat, doble] = ids.map((id) => vm.questions().find((question) => question.tempId === id)!);
    expect(vm.getQuestionTreeForSection(existingSection).map((entry) => entry.question.tempId)).toEqual([existing, hijos.tempId, cuantos.tempId]);
    expect(cuantos.parentTempId).toBe(hijos.tempId);
    expect(hijos.branchRules[1]).toEqual({ optionIndex: 1, action: 'GO_TO', nextQuestionTempId: sat.tempId });
    expect(sat.likertRows).toEqual(['Salud']);
    expect(doble.properties.expression).toBe('${' + cuantos.tempId + '} * 2');

    vm.importQuestions(preview, 'replace');
    expect(vm.questions()).toHaveLength(4);
    vm.undo();
    expect(vm.questions()).toHaveLength(5);
  });
});

