import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '@core/services/auth.service';
import { FormService, XlsFormImportPreview } from '@core/services/form.service';
import { NotificationService } from '@core/services/notification.service';
import { ProjectService } from '@core/services/project.service';
import { UserService } from '@core/services/user.service';
import { BuilderComponent } from './builder.component';
import { unsavedChangesGuard } from './unsaved-changes.guard';

const flush = () => new Promise((resolve) => setTimeout(resolve, 80));

function setup(formService: Record<string, unknown> = {}, routeId: string | null = null) {
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), confirm: vi.fn().mockResolvedValue(true) };
  const forms = {
    getForm: () => of({ id: 'f1', project_id: 'p1', title: 'T', state: 'DRAFT', questions: [] }),
    downloadImportTemplate: vi.fn(() => of(new Blob(['x']))),
    exportInstrument: vi.fn(() => of(new Blob(['x']))),
    previewImport: vi.fn(),
    getShares: vi.fn(() => of([])),
    createShare: vi.fn(() => of({})),
    deleteShare: vi.fn(() => of(undefined)),
    updateShareTarget: vi.fn(() => of({})),
    ...formService,
  };
  TestBed.overrideComponent(BuilderComponent, { set: { template: '', imports: [] } });
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } } },
      { provide: FormService, useValue: forms },
      { provide: ProjectService, useValue: { getProjects: () => of([]), getFormTechnicalSheet: () => of({ status: 'DRAFT' }) } },
      { provide: AuthService, useValue: { user: () => ({ id: 1 }), isAdmin: () => true } },
      { provide: UserService, useValue: { getUsers: () => of({ data: [{ id: 2, email: 'ana@uleam.edu.ec', name: 'Ana' }] }) } },
      { provide: TranslateService, useValue: { instant: (key: string) => key } },
      { provide: NotificationService, useValue: notify },
    ],
  });
  const fixture = TestBed.createComponent(BuilderComponent);
  const component = fixture.componentInstance;
  return { fixture, component, vm: component.vm, router, notify, forms };
}

const preview = (overrides: Partial<XlsFormImportPreview> = {}): XlsFormImportPreview => ({
  title: 'Excel', sections: ['A'], errors: [], warnings: [], valid: true, summary: { sections: 1, questions: 1 },
  questions: [{ temp_id: 'x', row: 2, name: 'p1', type: 'TEXT', label: 'Nombre', required: true, options: null,
    properties: {}, section_name: 'A', parent_temp_id: null, branch_rules: [] }],
  ...overrides,
});

describe('Constructor de formularios: vista y acciones', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('sin id de formulario vuelve a proyectos; con ficha sin validar va a la ficha', async () => {
    const plain = setup();
    plain.component.ngOnInit();
    expect(plain.router.navigate).toHaveBeenCalledWith(['/admin/proyectos']);
    TestBed.resetTestingModule();

    const withId = setup({}, 'f1');
    withId.component.ngOnInit();
    await flush();
    expect(withId.router.navigate).toHaveBeenCalledWith(['/admin/proyectos'], { queryParams: { project: 'p1', form: 'f1', tab: 'sheet' } });
  });

  it('agrega preguntas desde cada menú, las abre y las anuncia', async () => {
    const { component, vm } = setup();
    const s1 = vm.addSection('Uno')!;
    component.addSection();
    const s2 = vm.sections()[1].tempId;

    component.toggleAddMenu('palette');
    expect(component.openAddMenu()).toBe('palette');
    component.paletteSection.set(s1);
    component.addFromMenu('SINGLE_CHOICE');
    const first = vm.questions()[0];
    expect(first.sectionTempId).toBe(s1);
    expect(component.isExpanded(first.tempId)).toBe(true);

    component.toggleAddMenu(`section:${s2}`);
    component.addFromMenu('TEXT', 'cedula_ec');
    expect(vm.questions().find((q) => q.sectionTempId === s2)?.properties.text_format).toBe('cedula_ec');

    component.toggleAddMenu(`after:${first.tempId}`);
    component.addFromMenu('NUMBER');
    expect(vm.getQuestionTreeForSection(s1).map((e) => e.question.type)).toEqual(['SINGLE_CHOICE', 'NUMBER']);

    component.toggleAddMenu(`section:${component.noSection}`);
    component.addFromMenu('NOTE');
    expect(vm.getQuestionsForSection(null)).toHaveLength(1);

    component.paletteSection.set(component.noSection);
    expect(component.paletteTargetSection()).toBe(component.noSection);
    component.paletteSection.set('borrada');
    expect(component.paletteTargetSection()).toBe(s2);

    component.toggleAddMenu('palette');
    component.closeAddMenu();
    expect(component.openAddMenu()).toBeNull();
    await flush();
    expect(component.announcement()).toContain('Pregunta agregada');
    expect(component.sectionName(null)).toBe('«Sin sección»');
    expect(component.sectionName(s1)).toBe('«Uno»');
  });

  it('contrae, expande, mueve, duplica, borra y deshace', async () => {
    const { component, vm } = setup();
    const section = vm.addSection('S')!;
    const a = vm.addQuestion('SINGLE_CHOICE', { sectionTempId: section })!;
    vm.updateQuestionLabel(a, '¿Trabaja?');
    vm.setOptionsFromText(a, 'Sí\nNo');
    vm.updateBranchAction(a, 1, 'END_FORM');
    const b = vm.addQuestion('LIKERT', { sectionTempId: section })!;

    component.toggleQuestion(a);
    expect(component.isExpanded(a)).toBe(true);
    component.toggleQuestion(a);
    component.expandAll();
    expect(component.isExpanded(b)).toBe(true);
    component.collapseAll();
    expect(component.isExpanded(b)).toBe(false);

    component.toggleSection(section);
    expect(component.isSectionCollapsed(section)).toBe(true);
    component.goToSection(section);
    expect(component.isSectionCollapsed(section)).toBe(false);
    component.toggleSection(null);
    component.toggleSection(null);

    const entries = vm.getQuestionTreeForSection(section);
    expect(component.questionSummary(entries[0])).toBe('Obligatoria · 2 opciones · Con saltos');
    expect(component.questionSummary(entries[1])).toContain('1 × 5');
    expect(component.sectionIncompleteCount(section)).toBe(0);

    component.moveQuestion(entries[1], -1);
    expect(vm.questions()[0].tempId).toBe(b);
    component.moveQuestion(vm.getQuestionTreeForSection(section)[0], -1);

    component.duplicateQuestion(a);
    component.addSubquestion(a);
    expect(vm.questions()).toHaveLength(4);

    component.removeQuestion(a);
    expect(vm.undoState()).not.toBeNull();
    component.undo();
    expect(vm.questions()).toHaveLength(4);

    const other = vm.addSection('Otra')!;
    component.moveSection(other, -1);
    expect(vm.sections()[0].tempId).toBe(other);
    component.moveSection(other, -1);
    component.removeSection(other);
    expect(vm.sections()).toHaveLength(1);
    await flush();
  });

  it('pega listas de opciones y filas de matriz', () => {
    const { component, vm } = setup();
    const q = vm.addQuestion('SINGLE_CHOICE')!;
    const m = vm.addQuestion('LIKERT')!;

    component.openPaste(q, 'options');
    component.pasteText = '   ';
    component.applyPaste();
    expect(component.pasteTarget()).not.toBeNull();
    component.pasteText = 'A\nB\nC';
    component.applyPaste();
    expect(vm.questions()[0].options).toEqual(['A', 'B', 'C']);
    expect(component.pasteTarget()).toBeNull();

    component.openPaste(m, 'rows');
    component.pasteText = 'Uno\nDos';
    component.applyPaste();
    expect(vm.questions()[1].likertRows).toEqual(['Uno', 'Dos']);

    component.openPaste(q, 'options');
    component.cancelPaste();
    expect(component.pasteTarget()).toBeNull();
    component.applyPaste();
  });

  it('importa desde Excel con vista previa, errores y modos', () => {
    const previewImport = vi.fn().mockReturnValueOnce(of(preview())).mockReturnValueOnce(throwError(() => ({ error: { message: 'Muy grande' } })));
    const { component, vm } = setup({ previewImport });
    const input = document.createElement('input');
    input.click = vi.fn();
    component.chooseImportFile(input);
    expect(input.click).toHaveBeenCalled();

    const file = new File(['x'], 'encuesta.xlsx');
    component.onImportFile({ target: { files: [file] } } as unknown as Event);
    expect(component.importFileName()).toBe('encuesta.xlsx');
    expect(component.importMode()).toBe('replace');
    component.applyImport();
    expect(vm.questions()).toHaveLength(1);
    expect(component.importPreview()).toBeNull();

    component.onImportFile({ target: { files: [file] } } as unknown as Event);
    expect(component.importPreview()?.valid).toBe(false);
    expect(component.importError()).toBe('Muy grande');
    component.applyImport();
    component.closeImport();
    expect(component.importPreview()).toBeNull();

    component.onImportFile({ target: { files: [] } } as unknown as Event);
    expect(component.issueLocation({ row: 3, sheet: 'survey' })).toBe('Hoja survey, fila 3');
    expect(component.issueLocation({ row: 0, sheet: 'archivo' })).toBe('Archivo');
    expect(component.issueLocation({ row: 0, sheet: 'choices' })).toBe('Hoja choices');
  });

  it('descarga plantillas y exportaciones en ambos formatos', () => {
    const { component, vm, forms, notify } = setup();
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });

    component.downloadTemplate();
    component.downloadTemplate('xlsform');
    expect(forms.downloadImportTemplate).toHaveBeenCalledWith('xlsform');
    component.exportInstrument();
    expect(forms.exportInstrument).not.toHaveBeenCalled();
    vm.formId.set('f1');
    vm.title.set('Encuesta Ñandú 2026');
    component.exportInstrument('xlsform');
    expect(forms.exportInstrument).toHaveBeenCalledWith('f1', 'xlsform');
    expect(createObjectURL).toHaveBeenCalledTimes(3);

    forms.exportInstrument.mockReturnValueOnce(throwError(() => new Error('x')));
    component.exportInstrument();
    expect(vm.errorMessage()).toBe('No se pudo descargar el archivo de Excel.');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('protege los cambios sin guardar y cierra el menú al hacer clic fuera', async () => {
    const { component, vm, notify } = setup();
    expect(component.canLeave()).toBe(true);
    const event = { preventDefault: vi.fn(), returnValue: 'x' } as unknown as BeforeUnloadEvent;
    component.onBeforeUnload(event);
    expect(event.preventDefault).not.toHaveBeenCalled();

    vm.addQuestion('TEXT');
    component.onBeforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalled();
    await expect(component.canLeave()).resolves.toBe(true);
    expect(notify.confirm).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
    await expect(TestBed.runInInjectionContext(() => unsavedChangesGuard(component, {} as any, {} as any, {} as any))).resolves.toBe(true);

    component.onDocumentClick({ target: document.body } as unknown as MouseEvent);
    component.toggleAddMenu('palette');
    component.onDocumentClick({ target: document.body } as unknown as MouseEvent);
    expect(component.openAddMenu()).toBeNull();
  });

  it('cierra solo el aviso de deshacer', () => {
    vi.useFakeTimers();
    const { component, vm, fixture } = setup();
    const q = vm.addQuestion('TEXT')!;
    component.removeQuestion(q);
    fixture.detectChanges();
    vi.advanceTimersByTime(12500);
    expect(vm.undoState()).toBeNull();
    component.ngOnDestroy();
  });

  it('arrastra preguntas, vista previa, ubicación y compartir', async () => {
    const { component, vm, notify, forms } = setup();
    const a = vm.addQuestion('TEXT')!;
    const b = vm.addQuestion('NUMBER')!;
    const drag = { dataTransfer: { setData: vi.fn(), effectAllowed: '' }, preventDefault: vi.fn(), clientY: 50,
      currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 200 }) } } as unknown as DragEvent;
    window.scrollBy = vi.fn();
    component.onDragStart(drag, b);
    component.onDragOver(drag, a);
    expect(component.isDropTarget(a, 'before')).toBe(true);
    component.onDrop(drag, a);
    expect(vm.questions()[0].tempId).toBe(b);
    component.onDragEnd();

    component.openPreview('web');
    expect(component.modalPreviewQuestions()).toHaveLength(2);
    component.setPreviewMode('mobile');
    component.closePreview();
    expect(component.hiddenPreviewQuestions()).toBe(0);

    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_ok: unknown, fail: (e: { message: string }) => void) => fail({ message: 'denegado' }) }, configurable: true });
    component.setCurrentLocationAsZoneCenter(a);
    expect(notify.error).toHaveBeenCalledWith('No se pudo obtener la ubicación actual: denegado');

    component.openShareModal();
    expect(component.shareError).toContain('Guarda el formulario');
    vm.formId.set('f1');
    component.openShareModal();
    expect(forms.getShares).toHaveBeenCalled();
    component.setShareRole('PROJECT');
    expect(component.roleLabel('RECOLECTOR')).toBe('Recolector');
    expect(component.roleLabel(null)).toBe('');
    await component.removeShare('s1');
    expect(forms.deleteShare).toHaveBeenCalledWith('f1', 's1');
    component.closeShareModal();
  });
});
