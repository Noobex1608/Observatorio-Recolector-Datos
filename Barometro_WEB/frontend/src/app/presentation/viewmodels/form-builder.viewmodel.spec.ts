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

    vm.reorderQuestion(secondTempId, firstTempId);

    expect(vm.questions()[0].tempId).toBe(secondTempId);
    expect(vm.questions()[1].tempId).toBe(firstTempId);
    expect(vm.questions()[0].order).toBe(0);
    expect(vm.questions()[1].order).toBe(1);
  });
});
