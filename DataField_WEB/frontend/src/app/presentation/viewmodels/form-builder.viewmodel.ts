import { Injectable, computed, inject, signal } from '@angular/core';
import { Form, FormQuestion, FormQuestionBranchRule, FormQuestionProperties, FormService, XlsFormImportPreview } from '@core/services/form.service';
import { Project, ProjectService } from '@core/services/project.service';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { TEXT_FORMATS, TextFormat } from '@core/utils/text-format';

export interface FormSectionDraft {
  tempId: string;
  title: string;
  order: number;
}

export interface FormQuestionDraft {
  id?: string;
  tempId: string;
  type: FormQuestion['type'];
  label: string;
  options: string[];
  likertRows: string[];
  likertColumns: string[];
  branchRules: FormQuestionBranchRuleDraft[];
  properties: FormQuestionProperties;
  required: boolean;
  order: number;
  sectionName: string | null;
  sectionTempId: string | null;
  parentQuestionId: string | null;
  parentTempId: string | null;
}

export interface FormQuestionTreeEntry {
  question: FormQuestionDraft;
  level: number;
  displayNumber: string;
  index: number;
  siblingCount: number;
}

/** Dónde se crea una pregunta nueva: al final de una sección o justo debajo de otra pregunta. */
export interface QuestionInsertTarget {
  sectionTempId?: string | null;
  afterTempId?: string;
}

export interface BuilderUndoState {
  message: string;
  questions: FormQuestionDraft[];
  sections: FormSectionDraft[];
  deletedQuestionIds: string[];
}

export interface FormQuestionBranchRuleDraft {
  optionIndex: number;
  action: 'CONTINUE' | 'GO_TO' | 'END_FORM';
  nextQuestionTempId: string | null;
}

const SELECT_TYPES: FormQuestion['type'][] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RANKING'];
const BRANCHABLE_TYPES: FormQuestion['type'][] = ['SINGLE_CHOICE'];
const DEFAULT_LIKERT_OPTIONS = [
  'Totalmente en desacuerdo',
  'En desacuerdo',
  'Neutral',
  'De acuerdo',
  'Totalmente de acuerdo',
];
const DEFAULT_LIKERT_ROWS = ['Nueva afirmacion'];

@Injectable()
export class FormBuilderViewModel {
  private formService = inject(FormService);
  private projectService = inject(ProjectService);
  private translate = inject(TranslateService);

  formId = signal<string | null>(null);
  projectId = signal<string | null>(null);
  projects = signal<Project[]>([]);
  title = signal('');
  description = signal('');
  state = signal<Form['state']>('DRAFT');
  stepByStep = signal(false);
  requireConsent = signal(true);
  consentText = signal('Buenos días/tardes. Somos de la Universidad Laica Eloy Alfaro de Manabí (ULEAM). Estamos realizando una investigación académica y comunitaria. Su participación es completamente voluntaria y sus respuestas serán tratadas de manera anónima y confidencial. ¿Acepta participar en esta encuesta?');
  startDate = signal<string | null>(null);
  endDate = signal<string | null>(null);
  questions = signal<FormQuestionDraft[]>([]);
  sections = signal<FormSectionDraft[]>([]);
  deletedQuestionIds = signal<string[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  editingUnlocked = signal(true);
  instrumentLocked = signal(false);
  /** Última eliminación, para poder deshacerla. */
  undoState = signal<BuilderUndoState | null>(null);

  /** Estado comparable del formulario: si cambia respecto a lo guardado, hay cambios sin guardar. */
  private readonly snapshot = computed(() => JSON.stringify([
    this.projectId(), this.title(), this.description(), this.stepByStep(), this.consentText(),
    this.startDate(), this.endDate(),
    this.sections().map((section) => [section.tempId, section.title]),
    this.questions().map((q) => [
      q.tempId, q.type, q.label, q.options, q.likertRows, q.likertColumns, q.branchRules,
      q.properties, q.required, q.order, q.sectionTempId, q.parentTempId,
    ]),
  ]));
  private readonly savedSnapshot = signal('');
  readonly isDirty = computed(() => this.snapshot() !== this.savedSnapshot());

  /** Árbol de preguntas por sección (clave null = sin sección), calculado una sola vez por cambio. */
  readonly sectionTrees = computed(() => {
    const trees = new Map<string | null, FormQuestionTreeEntry[]>();
    for (const sectionTempId of [...this.sections().map((section) => section.tempId), null]) {
      trees.set(sectionTempId, this.buildTree(sectionTempId));
    }
    return trees;
  });

  /** Preguntas con datos faltantes (impiden guardar). */
  readonly incompleteQuestionIds = computed(() =>
    new Set(this.questions().filter((question) => this.questionIssue(question) !== null).map((question) => question.tempId)),
  );

  constructor() {
    this.markClean();
  }

  markClean(): void {
    this.savedSnapshot.set(this.snapshot());
  }

  isEditMode = computed(() => Boolean(this.formId()));
  questionsCount = computed(() => this.questions().length);
  canEditQuestions = computed(() => !this.instrumentLocked() && this.state() !== 'DEPLOYED' && this.editingUnlocked());
  isFormValid = computed(() => {
    const hasTitle = this.title().trim().length > 0;
    const hasProject = Boolean(this.projectId());
    const hasQuestions = this.questions().length > 0;
    const allQuestionsValid = this.questions().every((question) => {
      const hasLabel = question.label.trim().length > 0;
      if (question.type === 'LIKERT') {
        const filledRows = question.likertRows.filter((row) => row.trim().length > 0);
        const filledColumns = question.likertColumns.filter((column) => column.trim().length > 0);
        return filledRows.length > 0 && filledColumns.length > 0;
      }

      const needsOptions = SELECT_TYPES.includes(question.type);
      const filledOptions = question.options.filter((option) => option.trim().length > 0);
      const branchingIsValid = !BRANCHABLE_TYPES.includes(question.type) || (
        question.branchRules.length === question.options.length
        && question.branchRules.every((rule) =>
          rule.action !== 'GO_TO'
          || (typeof rule.nextQuestionTempId === 'string' && rule.nextQuestionTempId.length > 0),
        )
      );

      return hasLabel && (!needsOptions || filledOptions.length > 0) && branchingIsValid;
    });

    return hasTitle && hasProject && hasQuestions && allQuestionsValid
      && this.consentText().trim().length >= 10 && this.canEditQuestions();
  });

  async loadForm(id: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const form = await firstValueFrom(this.formService.getForm(id));
      this.formId.set(form.id);
      this.draftRevision = form.draft_revision ?? 0;
      this.projectId.set(form.project_id ?? null);
      this.title.set(form.title);
      this.description.set(form.description ?? '');
      this.state.set(form.state);
      this.instrumentLocked.set(Boolean(form.instrument_locked));
      this.stepByStep.set(Boolean(form.step_by_step));
      this.requireConsent.set(form.require_consent !== false);
      this.consentText.set(form.consent_text ?? 'Buenos días/tardes. Somos de la Universidad Laica Eloy Alfaro de Manabí (ULEAM). Estamos realizando una investigación académica y comunitaria. Su participación es completamente voluntaria y sus respuestas serán tratadas de manera anónima y confidencial. ¿Acepta participar en esta encuesta?');
      this.startDate.set(form.start_date ?? null);
      this.endDate.set(form.end_date ?? null);
      this.deletedQuestionIds.set([]);
      const draftQuestions = (form.questions ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((question, index) => this.toDraft(question, index));
      const hydratedQuestions = this.hydrateQuestionHierarchy(
        this.hydrateQuestionSections(draftQuestions),
      );
      this.questions.set(hydratedQuestions);
      this.sections.set(this.buildSectionsFromQuestions(hydratedQuestions));
      this.editingUnlocked.set(form.state !== 'DEPLOYED' && hydratedQuestions.length === 0);
      this.undoState.set(null);
      this.markClean();
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || error?.message || this.translate.instant('forms.builder.errors.load'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadProjects(): Promise<void> {
    try {
      const projects = await firstValueFrom(this.projectService.getProjects());
      this.projects.set(projects);
    } catch {
      this.projects.set([]);
    }
  }

  addSection(title = ''): string | null {
    if (!this.canEditQuestions()) return null;

    const newSection: FormSectionDraft = {
      tempId: this.createTempId(),
      title: title.trim(),
      order: this.sections().length,
    };

    this.sections.update((sections) => [...sections, newSection]);
    return newSection.tempId;
  }

  updateSectionTitle(tempId: string, title: string): void {
    if (!this.canEditQuestions()) return;

    this.sections.update((sections) =>
      sections.map((section) => section.tempId === tempId ? { ...section, title } : section),
    );

    this.questions.update((questions) =>
      questions.map((question) =>
        question.sectionTempId === tempId
          ? { ...question, sectionName: title.trim() || null }
          : question,
      ),
    );
  }

  /** Mueve la sección (con todas sus preguntas) una posición arriba o abajo. */
  moveSection(tempId: string, direction: -1 | 1): boolean {
    if (!this.canEditQuestions()) return false;

    const sections = [...this.sections()];
    const index = sections.findIndex((section) => section.tempId === tempId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return false;

    [sections[index], sections[target]] = [sections[target], sections[index]];
    this.sections.set(sections.map((section, order) => ({ ...section, order })));
    this.commit(this.questions());
    return true;
  }

  removeSection(tempId: string): void {
    if (!this.canEditQuestions()) return;

    const section = this.sections().find((item) => item.tempId === tempId);
    this.remember(`Sección «${section?.title.trim() || 'Sin título'}» eliminada; sus preguntas pasaron a «Sin sección».`);

    this.sections.update((sections) =>
      sections.filter((section) => section.tempId !== tempId).map((section, index) => ({ ...section, order: index })),
    );

    this.commit(
      this.questions().map((question) =>
        question.sectionTempId === tempId ? { ...question, sectionTempId: null, sectionName: null } : question,
      ),
    );
  }

  /** Lleva la pregunta (y sus subpreguntas) al final de otra sección. */
  assignQuestionToSection(tempId: string, sectionTempId: string | null): void {
    if (!this.canEditQuestions()) return;

    this.commit(
      this.questions().map((question) =>
        question.tempId === tempId
          ? {
              ...question,
              sectionTempId,
              sectionName: this.sectionTitle(sectionTempId),
              parentTempId: null,
              parentQuestionId: null,
              order: this.questions().length + 1,
            }
          : question,
      ),
    );
  }

  getSectionQuestionCount(sectionTempId: string | null): number {
    return this.questions().filter((question) => question.sectionTempId === sectionTempId).length;
  }

  getQuestionsForSection(sectionTempId: string | null): FormQuestionDraft[] {
    return this.questions().filter((question) => question.sectionTempId === sectionTempId && question.parentTempId === null);
  }

  getQuestionsForParent(parentTempId: string | null): FormQuestionDraft[] {
    return this.questions()
      .filter((question) => question.parentTempId === parentTempId)
      .sort((left, right) => left.order - right.order);
  }

  getQuestionTreeForSection(sectionTempId: string | null): FormQuestionTreeEntry[] {
    return this.sectionTrees().get(sectionTempId) ?? this.buildTree(sectionTempId);
  }

  private buildTree(sectionTempId: string | null): FormQuestionTreeEntry[] {
    const entries: FormQuestionTreeEntry[] = [];

    const visit = (parentTempId: string | null, level: number, path: number[]): void => {
      const siblings = this.getQuestionsForParent(parentTempId)
        .filter((question) => question.sectionTempId === sectionTempId)
        .sort((left, right) => left.order - right.order);

      siblings.forEach((question, index) => {
        const displayNumber = [...path, index + 1].join('.');
        entries.push({
          question,
          level,
          displayNumber,
          index,
          siblingCount: siblings.length,
        });
        visit(question.tempId, level + 1, [...path, index + 1]);
      });
    };

    visit(null, 0, []);
    return entries;
  }

  /**
   * Crea una pregunta y devuelve su id temporal.
   * Sin destino se agrega al final de la última sección (o en «Sin sección» si no hay secciones).
   */
  addQuestion(type: FormQuestion['type'], target: QuestionInsertTarget = {}): string | null {
    if (!this.canEditQuestions()) return null;

    const placement = this.resolvePlacement(target);
    const newQuestion: FormQuestionDraft = {
      tempId: this.createTempId(),
      type,
      label: '',
      options: this.getInitialOptions(type),
      likertRows: type === 'LIKERT' ? [...DEFAULT_LIKERT_ROWS] : [],
      likertColumns: type === 'LIKERT' ? [...DEFAULT_LIKERT_OPTIONS] : [],
      branchRules: this.getInitialBranchRules(type),
      properties: this.getDefaultProperties(type),
      required: type === 'NOTE' ? false : true,
      order: placement.order,
      sectionName: this.sectionTitle(placement.sectionTempId),
      sectionTempId: placement.sectionTempId,
      parentQuestionId: placement.parentQuestionId,
      parentTempId: placement.parentTempId,
    };

    this.commit([...this.questions(), newQuestion]);
    return newQuestion.tempId;
  }

  /** Atajo del menú: pregunta de texto con formato validado (correo, cédula o teléfono). */
  addTextQuestion(format: TextFormat, target: QuestionInsertTarget = {}): string | null {
    const tempId = this.addQuestion('TEXT', target);
    if (!tempId) return null;
    const label = TEXT_FORMATS.find((item) => item.value === format)?.defaultLabel ?? '';
    this.questions.update((questions) => questions.map((question) => question.tempId === tempId
      ? { ...question, label, properties: { ...question.properties, text_format: format } }
      : question));
    return tempId;
  }

  addSubquestion(parentTempId: string): string | null {
    if (!this.canEditQuestions()) return null;

    const parent = this.questions().find((question) => question.tempId === parentTempId);
    if (!parent) return null;

    const childQuestion: FormQuestionDraft = {
      tempId: this.createTempId(),
      type: 'TEXT',
      label: '',
      options: [],
      likertRows: [],
      likertColumns: [],
      branchRules: [],
      properties: this.getDefaultProperties('TEXT'),
      required: true,
      order: this.questions().length + 1,
      sectionName: parent.sectionName,
      sectionTempId: parent.sectionTempId,
      parentQuestionId: parent.id ?? null,
      parentTempId,
    };

    this.commit([...this.questions(), childQuestion]);
    return childQuestion.tempId;
  }

  /** Copia la pregunta (con sus subpreguntas) justo debajo de la original. Devuelve el id de la copia. */
  duplicateQuestion(tempId: string): string | null {
    if (!this.canEditQuestions()) return null;

    const source = this.questions().find((question) => question.tempId === tempId);
    if (!source) return null;

    const subtree = [source, ...this.getDescendantTempIds(tempId)
      .map((id) => this.questions().find((question) => question.tempId === id))
      .filter((question): question is FormQuestionDraft => Boolean(question))];
    const newIds = new Map(subtree.map((question) => [question.tempId, this.createTempId()]));
    const remap = (id: string | null): string | null => (id && newIds.get(id)) || id;

    const copies = subtree.map((question): FormQuestionDraft => {
      const properties: FormQuestionProperties = structuredClone(question.properties ?? {});
      if (typeof properties.expression === 'string') {
        for (const [oldId, newId] of newIds) {
          properties.expression = properties.expression.split('${' + oldId + '}').join('${' + newId + '}');
        }
      }
      return {
        ...question,
        id: undefined,
        tempId: newIds.get(question.tempId)!,
        options: [...question.options],
        likertRows: [...question.likertRows],
        likertColumns: [...question.likertColumns],
        branchRules: question.branchRules.map((rule) => ({ ...rule, nextQuestionTempId: remap(rule.nextQuestionTempId) })),
        properties,
        order: question.tempId === tempId ? source.order + 0.5 : question.order,
        parentTempId: question.tempId === tempId ? source.parentTempId : remap(question.parentTempId),
        parentQuestionId: question.tempId === tempId ? source.parentQuestionId : null,
      };
    });

    this.commit([...this.questions(), ...copies]);
    return newIds.get(tempId) ?? null;
  }

  /** Reemplaza las opciones por las líneas pegadas (una por línea). Devuelve cuántas quedaron. */
  setOptionsFromText(tempId: string, text: string): number {
    if (!this.canEditQuestions()) return 0;
    const lines = this.splitLines(text);
    if (lines.length === 0) return 0;

    this.questions.update((questions) => questions.map((question) => {
      if (question.tempId !== tempId) return question;
      return {
        ...question,
        options: lines,
        branchRules: this.supportsBranching(question.type)
          ? lines.map((_, optionIndex) => question.branchRules[optionIndex]
            ? { ...question.branchRules[optionIndex], optionIndex }
            : { optionIndex, action: 'CONTINUE' as const, nextQuestionTempId: null })
          : question.branchRules,
      };
    }));
    this.clearMessages();
    return lines.length;
  }

  /** Reemplaza las filas (afirmaciones) de una matriz Likert por las líneas pegadas. */
  setLikertRowsFromText(tempId: string, text: string): number {
    if (!this.canEditQuestions()) return 0;
    const lines = this.splitLines(text);
    if (lines.length === 0) return 0;

    this.patchQuestion(tempId, { likertRows: lines });
    return lines.length;
  }

  /**
   * Carga las preguntas de una importación desde Excel. «replace» reemplaza las actuales (se puede
   * deshacer); «append» las agrega al final. Las secciones con el mismo título se reutilizan.
   * Devuelve los ids temporales de las preguntas creadas.
   */
  importQuestions(preview: XlsFormImportPreview, mode: 'replace' | 'append'): string[] {
    if (!this.canEditQuestions() || preview.questions.length === 0) return [];

    if (mode === 'replace') {
      this.remember(`Se reemplazaron ${this.questions().length} pregunta(s) por las del Excel.`);
      const persisted = this.questions().filter((question) => question.id).map((question) => question.id as string);
      this.deletedQuestionIds.update((ids) => [...ids, ...persisted]);
    }

    const baseSections = mode === 'replace' ? [] : this.sections();
    const sections = [...baseSections];
    const sectionIdByTitle = new Map(sections.map((section) => [section.title.trim(), section.tempId]));
    for (const title of preview.sections) {
      const clean = title.trim();
      if (!clean || sectionIdByTitle.has(clean)) continue;
      const section: FormSectionDraft = { tempId: this.createTempId(), title: clean, order: sections.length };
      sections.push(section);
      sectionIdByTitle.set(clean, section.tempId);
    }
    this.sections.set(sections);

    const newIds = new Map(preview.questions.map((question) => [question.temp_id, this.createTempId()]));
    const offset = mode === 'replace' ? 0 : this.questions().length + 1;
    const imported = preview.questions.map((question, index): FormQuestionDraft => {
      const sectionTempId = question.section_name ? sectionIdByTitle.get(question.section_name.trim()) ?? null : null;
      const isLikert = question.type === 'LIKERT' && question.options && !Array.isArray(question.options);
      const likert = isLikert ? question.options as { rows: string[]; columns: string[] } : null;
      const options = Array.isArray(question.options) ? question.options.map(String) : [];
      const properties: FormQuestionProperties = { ...this.getDefaultProperties(question.type), ...(question.properties ?? {}) };
      if (typeof properties.expression === 'string') {
        for (const [oldId, newId] of newIds) {
          properties.expression = properties.expression.split('${' + oldId + '}').join('${' + newId + '}');
        }
      }
      return {
        tempId: newIds.get(question.temp_id)!,
        type: question.type,
        label: question.label,
        options,
        likertRows: likert ? [...likert.rows] : [],
        likertColumns: likert ? [...likert.columns] : [],
        branchRules: this.supportsBranching(question.type)
          ? options.map((_, optionIndex) => {
              const rule = question.branch_rules.find((item) => item.option_index === optionIndex);
              return {
                optionIndex,
                action: rule?.action ?? 'CONTINUE',
                nextQuestionTempId: rule?.next_temp_id ? newIds.get(rule.next_temp_id) ?? null : null,
              };
            })
          : [],
        properties,
        required: question.type === 'NOTE' ? false : question.required,
        order: offset + index,
        sectionName: question.section_name?.trim() || null,
        sectionTempId,
        parentQuestionId: null,
        parentTempId: question.parent_temp_id ? newIds.get(question.parent_temp_id) ?? null : null,
      };
    });

    this.commit(mode === 'replace' ? imported : [...this.questions(), ...imported]);
    if (mode === 'replace' && preview.title && !this.title().trim()) this.title.set(preview.title);
    return imported.map((question) => question.tempId);
  }

  removeQuestion(tempId: string): void {
    if (!this.canEditQuestions()) return;

    const current = this.questions().find((question) => question.tempId === tempId);
    if (!current) return;

    const removedIds = new Set([tempId, ...this.getDescendantTempIds(tempId)]);
    const label = current.label.trim() || this.translate.instant('forms.builder.untitledQuestion');
    const extra = removedIds.size > 1 ? ` y ${removedIds.size - 1} subpregunta(s)` : '';
    this.remember(`Pregunta «${label}»${extra} eliminada.`);

    const persistedIds = this.questions()
      .filter((question) => removedIds.has(question.tempId) && question.id)
      .map((question) => question.id as string);
    if (persistedIds.length > 0) {
      this.deletedQuestionIds.update((ids) => [...ids, ...persistedIds]);
    }

    this.commit(
      this.questions()
        .filter((question) => !removedIds.has(question.tempId))
        .map((question) => ({
          ...question,
          branchRules: question.branchRules.map((rule) =>
            rule.nextQuestionTempId && removedIds.has(rule.nextQuestionTempId) ? { ...rule, nextQuestionTempId: null } : rule,
          ),
        })),
    );
  }

  /** Deshace la última eliminación (pregunta o sección). */
  undo(): void {
    const state = this.undoState();
    if (!state) return;

    this.questions.set(state.questions);
    this.sections.set(state.sections);
    this.deletedQuestionIds.set(state.deletedQuestionIds);
    this.undoState.set(null);
    this.clearMessages();
  }

  dismissUndo(): void {
    this.undoState.set(null);
  }

  /** Mueve la pregunta una posición entre sus hermanas (misma sección y mismo padre). */
  moveQuestion(tempId: string, direction: -1 | 1): boolean {
    if (!this.canEditQuestions()) return false;

    const question = this.questions().find((item) => item.tempId === tempId);
    if (!question) return false;

    const siblings = this.siblingsOf(question);
    const index = siblings.findIndex((item) => item.tempId === tempId);
    const neighbor = siblings[index + direction];
    if (!neighbor) return false;

    this.commit(this.questions().map((item) => {
      if (item.tempId === tempId) return { ...item, order: neighbor.order };
      if (item.tempId === neighbor.tempId) return { ...item, order: question.order };
      return item;
    }));
    return true;
  }

  /** Arrastrar y soltar: la pregunta toma la sección y el nivel de la pregunta destino. */
  reorderQuestion(sourceTempId: string, targetTempId: string, position: 'before' | 'after' = 'after'): void {
    if (!this.canEditQuestions()) return;

    const source = this.questions().find((question) => question.tempId === sourceTempId);
    const target = this.questions().find((question) => question.tempId === targetTempId);
    if (!source || !target || sourceTempId === targetTempId) return;
    if (this.getDescendantTempIds(sourceTempId).includes(targetTempId)) return;

    this.commit(this.questions().map((question) => question.tempId === sourceTempId
      ? {
          ...question,
          sectionTempId: target.sectionTempId,
          sectionName: this.sectionTitle(target.sectionTempId),
          parentTempId: target.parentTempId,
          parentQuestionId: target.parentQuestionId,
          order: target.order + (position === 'before' ? -0.5 : 0.5),
        }
      : question));
  }

  /** Motivo por el que la pregunta impide guardar, o null si está completa. */
  questionIssue(question: FormQuestionDraft): string | null {
    if (question.type === 'LIKERT') {
      const rows = question.likertRows.filter((row) => row.trim().length > 0);
      const columns = question.likertColumns.filter((column) => column.trim().length > 0);
      return rows.length > 0 && columns.length > 0 ? null : 'Faltan filas o columnas';
    }
    if (question.label.trim().length === 0) return 'Falta el enunciado';
    if (SELECT_TYPES.includes(question.type) && !question.options.some((option) => option.trim().length > 0)) {
      return 'Faltan opciones';
    }
    if (BRANCHABLE_TYPES.includes(question.type) && question.branchRules.some((rule) => rule.action === 'GO_TO' && !rule.nextQuestionTempId)) {
      return 'Falta el destino de un salto';
    }
    return null;
  }

  updateTitle(value: string): void {
    this.title.set(value);
    this.clearMessages();
  }

  updateDescription(value: string): void {
    this.description.set(value);
    this.clearMessages();
  }

  updateStepByStep(value: boolean): void {
    this.stepByStep.set(value);
    this.clearMessages();
  }

  updateRequireConsent(value: boolean): void {
    this.requireConsent.set(value);
    this.clearMessages();
  }

  updateConsentText(value: string): void {
    this.consentText.set(value);
    this.clearMessages();
  }

  updateStartDate(value: string | null): void {
    this.startDate.set(value || null);
    this.clearMessages();
  }

  updateEndDate(value: string | null): void {
    this.endDate.set(value || null);
    this.clearMessages();
  }

  updateProject(projectId: string | null): void {
    this.projectId.set(projectId || null);
    this.clearMessages();
  }

  updateQuestionLabel(tempId: string, label: string): void {
    this.patchQuestion(tempId, { label });
  }

  updateQuestionType(tempId: string, type: FormQuestion['type']): void {
    if (!this.canEditQuestions()) return;

    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId) {
          return question;
        }

        if (question.type === type) {
          return question;
        }

        const nextOptions = type === 'LIKERT'
          ? []
          : SELECT_TYPES.includes(type)
            ? (question.options.length > 0 ? [...question.options] : [''])
            : [];

        const nextLikertRows = type === 'LIKERT'
          ? (question.likertRows.length > 0 ? [...question.likertRows] : [...DEFAULT_LIKERT_ROWS])
          : [];

        const nextLikertColumns = type === 'LIKERT'
          ? (question.likertColumns.length > 0 ? [...question.likertColumns] : [...DEFAULT_LIKERT_OPTIONS])
          : [];

        const nextBranchRules = this.supportsBranching(type)
          ? Array.from({ length: Math.max(nextOptions.length, 1) }, (_, optionIndex) => ({
              optionIndex,
              action: 'CONTINUE' as const,
              nextQuestionTempId: null,
            }))
          : [];

        return {
          ...question,
          type,
          options: nextOptions,
          likertRows: nextLikertRows,
          likertColumns: nextLikertColumns,
          branchRules: nextBranchRules,
        };
      }),
    );

    this.clearMessages();
  }

  updateQuestionRequired(tempId: string, required: boolean): void {
    this.patchQuestion(tempId, { required });
  }

  updateBranchTarget(tempId: string, optionIndex: number, nextQuestionTempId: string | null): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId) return question;

        const branchRules = [...question.branchRules];
        const currentRule = branchRules[optionIndex];
        branchRules[optionIndex] = {
          optionIndex,
          action: currentRule?.action ?? 'CONTINUE',
          nextQuestionTempId: nextQuestionTempId || null,
        };

        return { ...question, branchRules };
      }),
    );
  }

  updateBranchAction(tempId: string, optionIndex: number, action: 'CONTINUE' | 'GO_TO' | 'END_FORM'): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId) return question;

        const branchRules = [...question.branchRules];
        const currentRule = branchRules[optionIndex] ?? {
          optionIndex,
          action: 'CONTINUE' as const,
          nextQuestionTempId: null,
        };

        branchRules[optionIndex] = {
          ...currentRule,
          optionIndex,
          action,
          nextQuestionTempId: action === 'GO_TO' ? currentRule.nextQuestionTempId : null,
        };

        return { ...question, branchRules };
      }),
    );
  }

  addOption(tempId: string): void {
    this.questions.update((questions) =>
      questions.map((question) =>
        question.tempId === tempId
          ? {
              ...question,
              options: [...question.options, ''],
              branchRules: this.supportsBranching(question.type)
                ? [...question.branchRules, { optionIndex: question.options.length, action: 'CONTINUE', nextQuestionTempId: null }]
                : question.branchRules,
            }
          : question,
      ),
    );
  }

  updateOption(tempId: string, optionIndex: number, value: string): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId) return question;

        const options = [...question.options];
        options[optionIndex] = value;
        return { ...question, options };
      }),
    );
  }

  removeOption(tempId: string, optionIndex: number): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId || question.options.length <= 1) return question;

        return {
          ...question,
          options: question.options.filter((_, index) => index !== optionIndex),
          branchRules: this.supportsBranching(question.type)
            ? question.branchRules
                .filter((_, index) => index !== optionIndex)
                .map((rule, index) => ({ ...rule, optionIndex: index }))
            : question.branchRules,
        };
      }),
    );
  }

  addLikertRow(tempId: string): void {
    this.questions.update((questions) =>
      questions.map((question) =>
        question.tempId === tempId ? { ...question, likertRows: [...question.likertRows, ''] } : question,
      ),
    );
  }

  updateLikertRow(tempId: string, rowIndex: number, value: string): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId) return question;

        const likertRows = [...question.likertRows];
        likertRows[rowIndex] = value;
        return { ...question, likertRows };
      }),
    );
  }

  removeLikertRow(tempId: string, rowIndex: number): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId || question.likertRows.length <= 1) return question;

        return {
          ...question,
          likertRows: question.likertRows.filter((_, index) => index !== rowIndex),
        };
      }),
    );
  }

  addLikertColumn(tempId: string): void {
    this.questions.update((questions) =>
      questions.map((question) =>
        question.tempId === tempId ? { ...question, likertColumns: [...question.likertColumns, ''] } : question,
      ),
    );
  }

  updateLikertColumn(tempId: string, columnIndex: number, value: string): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId) return question;

        const likertColumns = [...question.likertColumns];
        likertColumns[columnIndex] = value;
        return { ...question, likertColumns };
      }),
    );
  }

  removeLikertColumn(tempId: string, columnIndex: number): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId || question.likertColumns.length <= 1) return question;

        return {
          ...question,
          likertColumns: question.likertColumns.filter((_, index) => index !== columnIndex),
        };
      }),
    );
  }

  private draftRevision = 0;

  async saveForm(): Promise<void> {
    if (this.isSaving()) return;

    if (!this.isFormValid()) {
      this.errorMessage.set(this.translate.instant('forms.builder.messages.invalid'));
      this.successMessage.set('');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const formId = this.formId();
      const hasConditionalRules = this.questions().some(
        (question) =>
          this.supportsBranching(question.type)
          && question.branchRules.some((rule) => rule.action !== 'CONTINUE'),
      );
      const resolvedStepByStep = this.stepByStep() || hasConditionalRules;

      const header = {
        title: this.title().trim(), description: this.description().trim(),
        step_by_step: resolvedStepByStep, require_consent: true,
        consent_text: this.consentText().trim() || null,
        start_date: this.startDate() || null, end_date: this.endDate() || null,
      };
      // Initial shell is a draft; normal flow creates it with the technical sheet first.
      const currentId = formId ?? (await firstValueFrom(this.formService.createForm({
        ...header, project_id: this.projectId(),
      }))).id;
      this.formId.set(currentId);
      const ids = new Map(this.questions().map(q => [q.tempId, q.id ?? crypto.randomUUID()]));
      const payload = this.questions().map(q => {
        const properties = { ...q.properties };
        if (typeof properties.expression === 'string') {
          for (const [temp, id] of ids) properties.expression = properties.expression.split('${' + temp + '}').join('${' + id + '}');
        }
        return {
          ...this.toQuestionPayload(q), id: ids.get(q.tempId)!, properties,
          parent_question_id: q.parentTempId ? ids.get(q.parentTempId) ?? q.parentQuestionId ?? null : null,
          branch_rules: q.branchRules.map(rule => ({
            option_index: rule.optionIndex, action: rule.action,
            next_question_id: rule.action === 'GO_TO' && rule.nextQuestionTempId
              ? ids.get(rule.nextQuestionTempId) ?? rule.nextQuestionTempId : null,
          })),
        };
      });
      const savedForm = await firstValueFrom(this.formService.saveDraft(currentId, {
        ...header, expected_revision: this.draftRevision, questions: payload,
      }));
      this.draftRevision = savedForm.draft_revision ?? 0;
      this.state.set(savedForm.state);
      this.stepByStep.set(Boolean(savedForm.step_by_step));
      for (const [tempId, id] of ids) this.patchQuestion(tempId, { id, tempId: id });
      this.deletedQuestionIds.set([]);
      this.undoState.set(null);
      this.successMessage.set(this.translate.instant('forms.builder.messages.saved'));
      this.editingUnlocked.set(false);
      this.markClean();
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.builder.errors.save'));
    } finally {
      this.isSaving.set(false);
    }
  }

  resetForm(): void {
    this.formId.set(null);
    this.draftRevision = 0;
    this.projectId.set(null);
    this.title.set('');
    this.description.set('');
    this.state.set('DRAFT');
    this.instrumentLocked.set(false);
    this.stepByStep.set(false);
    this.requireConsent.set(true);
    this.consentText.set('Buenos días/tardes. Somos de la Universidad Laica Eloy Alfaro de Manabí (ULEAM). Estamos realizando una investigación académica y comunitaria. Su participación es completamente voluntaria y sus respuestas serán tratadas de manera anónima y confidencial. ¿Acepta participar en esta encuesta?');
    this.startDate.set(null);
    this.endDate.set(null);
    this.questions.set([]);
    this.sections.set([]);
    this.deletedQuestionIds.set([]);
    this.undoState.set(null);
    this.clearMessages();
    this.markClean();
  }

  getTypeLabel(type: FormQuestion['type']): string {
    const labels: Record<FormQuestion['type'], string> = {
      SINGLE_CHOICE: 'forms.builder.types.SINGLE_CHOICE',
      MULTIPLE_CHOICE: 'forms.builder.types.MULTIPLE_CHOICE',
      LIKERT: 'forms.builder.types.LIKERT',
      TEXT: 'forms.builder.types.TEXT',
      NUMBER: 'forms.builder.types.NUMBER',
      NOTE: 'forms.builder.types.NOTE',
      DATE: 'forms.builder.types.DATE',
      TIME: 'forms.builder.types.TIME',
      DATETIME: 'forms.builder.types.DATETIME',
      GPS: 'forms.builder.types.GPS',
      MULTIMEDIA: 'forms.builder.types.MULTIMEDIA',
      SIGNATURE: 'forms.builder.types.SIGNATURE',
      RANKING: 'forms.builder.types.RANKING',
      RATING: 'forms.builder.types.RATING',
      BARCODE: 'forms.builder.types.BARCODE',
      CALCULATE: 'forms.builder.types.CALCULATE',
    };

    return labels[type] || type;
  }

  updateQuestionProperty(tempId: string, key: keyof FormQuestionProperties, value: any): void {
    this.questions.update((questions) =>
      questions.map((question) => {
        if (question.tempId !== tempId) return question;
        return {
          ...question,
          properties: {
            ...question.properties,
            [key]: value,
          },
        };
      }),
    );
    this.clearMessages();
  }

  getDefaultProperties(type: FormQuestion['type']): FormQuestionProperties {
    switch (type) {
      case 'NOTE':
        return { help_text: '' };
      case 'DATE':
      case 'TIME':
      case 'DATETIME':
        return { min_date: '', max_date: '', default_now: false };
      case 'GPS':
        return {
          capture_accuracy: true,
          allow_manual_fallback: true,
          target_lat: null,
          target_lng: null,
          radius_meters: 500,
          zone_name: '',
        };
      case 'MULTIMEDIA':
        return { allowed_media: 'all', max_file_size_mb: 20 };
      case 'SIGNATURE':
        return { pen_color: '#000000', background_color: '#ffffff' };
      case 'RATING':
        return { max_rating: 5, icon_type: 'star' };
      case 'BARCODE':
        return { allowed_formats: 'ALL', allow_manual_input: true };
      case 'CALCULATE':
        return { expression: '' };
      default:
        return {};
    }
  }

  getQuestionDisplayLabel(question: FormQuestionDraft): string {
    const label = question.label.trim();
    if (label.length > 0) return label;

    return question.type === 'LIKERT'
      ? this.translate.instant('forms.builder.types.LIKERT')
      : this.translate.instant('forms.builder.untitledQuestion');
  }

  private toDraft(question: FormQuestion, order: number): FormQuestionDraft {
    return {
      id: question.id,
      tempId: question.id,
      type: question.type,
      label: question.label,
      options: this.normalizeOptions(question),
      likertRows: this.normalizeLikertRows(question),
      likertColumns: this.normalizeLikertColumns(question),
      branchRules: this.normalizeBranchRules(question),
      properties: question.properties ?? this.getDefaultProperties(question.type),
      required: question.type === 'NOTE' ? false : question.required,
      order,
      sectionName: question.section_name ?? null,
      sectionTempId: null,
      parentQuestionId: question.parent_question_id ?? null,
      parentTempId: null,
    };
  }

  private hydrateQuestionSections(questions: FormQuestionDraft[]): FormQuestionDraft[] {
    const sectionNames = Array.from(new Set(
      questions
        .map((question) => question.sectionName?.trim())
        .filter((value): value is string => Boolean(value)),
    ));

    const sectionMap = new Map<string, string>();
    sectionNames.forEach((title, index) => {
      const sectionTempId = `section-${Date.now()}-${index}`;
      sectionMap.set(title, sectionTempId);
    });

    return questions.map((question) => {
      const normalizedSectionName = question.sectionName?.trim() ?? null;
      const resolvedSectionTempId = normalizedSectionName ? sectionMap.get(normalizedSectionName) ?? null : null;

      return {
        ...question,
        sectionName: normalizedSectionName,
        sectionTempId: resolvedSectionTempId,
      };
    });
  }

  private hydrateQuestionHierarchy(questions: FormQuestionDraft[]): FormQuestionDraft[] {
    const tempIdByQuestionId = new Map<string, string>();
    questions.forEach((question) => {
      if (question.id) {
        tempIdByQuestionId.set(question.id, question.tempId);
      }
    });

    return questions.map((question) => ({
      ...question,
      parentTempId: question.parentQuestionId ? tempIdByQuestionId.get(question.parentQuestionId) ?? null : null,
    }));
  }

  private buildSectionsFromQuestions(questions: FormQuestionDraft[]): FormSectionDraft[] {
    const sectionEntries = new Map<string, FormSectionDraft>();

    for (const question of questions) {
      const sectionName = question.sectionName?.trim();
      if (!sectionName) continue;

      const tempId = question.sectionTempId ?? this.createTempId();

      if (!sectionEntries.has(tempId)) {
        sectionEntries.set(tempId, {
          tempId,
          title: sectionName,
          order: sectionEntries.size,
        });
      }
    }

    return Array.from(sectionEntries.values()).map((section, index) => ({
      ...section,
      order: index,
    }));
  }

  private normalizeOptions(question: FormQuestion): string[] {
    if (Array.isArray(question.options) && question.options.length > 0) {
      return question.options.map((option) => String(option));
    }

    return SELECT_TYPES.includes(question.type) ? (question.type === 'RANKING' ? ['Opción 1', 'Opción 2'] : ['']) : [];
  }

  private normalizeLikertRows(question: FormQuestion): string[] {
    if (question.type !== 'LIKERT') return [];

    if (question.options && !Array.isArray(question.options) && Array.isArray(question.options.rows)) {
      return question.options.rows.length > 0 ? question.options.rows.map((row) => String(row)) : [...DEFAULT_LIKERT_ROWS];
    }

    return [question.label || DEFAULT_LIKERT_ROWS[0]];
  }

  private normalizeLikertColumns(question: FormQuestion): string[] {
    if (question.type !== 'LIKERT') return [];

    if (question.options && !Array.isArray(question.options) && Array.isArray(question.options.columns)) {
      return question.options.columns.length > 0
        ? question.options.columns.map((column) => String(column))
        : [...DEFAULT_LIKERT_OPTIONS];
    }

    if (Array.isArray(question.options) && question.options.length > 0) {
      return question.options.map((option) => String(option));
    }

    return [...DEFAULT_LIKERT_OPTIONS];
  }

  private normalizeBranchRules(question: FormQuestion): FormQuestionBranchRuleDraft[] {
    if (!this.supportsBranching(question.type)) {
      return [];
    }

    const rules = Array.isArray(question.branch_rules) ? question.branch_rules : [];

    if (rules.length > 0) {
      return rules.map((rule, index) => ({
        optionIndex: Number(rule?.option_index ?? index),
        action: this.normalizeBranchAction(rule?.action),
        nextQuestionTempId: typeof rule?.next_question_id === 'string' ? rule.next_question_id : null,
      }));
    }

    const optionCount = Array.isArray(question.options) ? question.options.length : 0;

    return Array.from({ length: optionCount }, (_, index) => ({
      optionIndex: index,
      action: 'CONTINUE',
      nextQuestionTempId: null,
    }));
  }

  private getInitialOptions(type: FormQuestion['type']): string[] {
    if (SELECT_TYPES.includes(type)) {
      return type === 'RANKING' ? ['Opción 1', 'Opción 2'] : [''];
    }
    return [];
  }

  private getInitialBranchRules(type: FormQuestion['type']): FormQuestionBranchRuleDraft[] {
    if (!this.supportsBranching(type)) {
      return [];
    }

    return [{ optionIndex: 0, action: 'CONTINUE', nextQuestionTempId: null }];
  }

  private toQuestionPayload(question: FormQuestionDraft): Partial<FormQuestion> {
    const options = question.type === 'LIKERT'
      ? {
          rows: question.likertRows.map((row) => row.trim()).filter(Boolean),
          columns: question.likertColumns.map((column) => column.trim()).filter(Boolean),
        }
      : SELECT_TYPES.includes(question.type)
        ? question.options.map((option) => option.trim()).filter(Boolean)
        : null;

    return {
      type: question.type,
      label: question.label.trim() || (question.type === 'NOTE' ? 'Nota Informativa' : this.translate.instant('forms.builder.types.LIKERT')),
      required: question.type === 'NOTE' ? false : question.required,
      order: question.order,
      options,
      properties: question.properties,
      section_name: question.sectionTempId
        ? this.sections().find((section) => section.tempId === question.sectionTempId)?.title.trim() || null
        : null,
      parent_question_id: question.parentQuestionId ?? null,
    };
  }

  getBranchTargetOptions(tempId: string): Array<{ value: string | null; label: string }> {
    const questions = this.questions();
    const currentIndex = questions.findIndex((question) => question.tempId === tempId);

    return [
      { value: null, label: this.translate.instant('forms.builder.branch.selectTarget') },
      ...questions.slice(currentIndex + 1).map((question) => ({
        value: question.tempId,
        label: `${question.order + 1}. ${this.getQuestionDisplayLabel(question)}`,
      })),
    ];
  }

  canConfigureBranching(type: FormQuestion['type']): boolean {
    return this.supportsBranching(type);
  }

  getBranchRuleValue(question: FormQuestionDraft, optionIndex: number): string | null {
    return question.branchRules.find((rule) => rule.optionIndex === optionIndex)?.nextQuestionTempId ?? null;
  }

  getBranchRuleAction(question: FormQuestionDraft, optionIndex: number): 'CONTINUE' | 'GO_TO' | 'END_FORM' {
    return question.branchRules.find((rule) => rule.optionIndex === optionIndex)?.action ?? 'CONTINUE';
  }

  private getDescendantTempIds(tempId: string): string[] {
    const descendants = this.questions().filter((question) => question.parentTempId === tempId);
    const result = new Set<string>();

    const visit = (currentTempId: string): void => {
      const children = this.questions().filter((question) => question.parentTempId === currentTempId);
      children.forEach((child) => {
        result.add(child.tempId);
        visit(child.tempId);
      });
    };

    visit(tempId);
    return Array.from(result);
  }

  private patchQuestion(tempId: string, patch: Partial<FormQuestionDraft>): void {
    const nextTempId = patch.tempId && patch.tempId !== tempId ? patch.tempId : null;

    this.questions.update((questions) =>
      questions.map((question) =>
        question.tempId === tempId ? { ...question, ...patch } : question,
      ),
    );

    if (nextTempId) {
      this.remapBranchTargets(tempId, nextTempId);
    }

    this.clearMessages();
  }

  private remapBranchTargets(oldTempId: string, newTempId: string): void {
    this.questions.update((questions) =>
      questions.map((question) => ({
        ...question,
        branchRules: question.branchRules.map((rule) =>
          rule.nextQuestionTempId === oldTempId ? { ...rule, nextQuestionTempId: newTempId } : rule,
        ),
      })),
    );
  }

  private supportsBranching(type: FormQuestion['type']): boolean {
    return BRANCHABLE_TYPES.includes(type);
  }

  private normalizeBranchAction(value: unknown): 'CONTINUE' | 'GO_TO' | 'END_FORM' {
    if (value === 'GO_TO' || value === 'END_FORM') {
      return value;
    }

    return 'CONTINUE';
  }

  /** Guarda el arreglo de preguntas en el mismo orden en que se muestran (secciones, luego árbol). */
  private commit(questions: FormQuestionDraft[]): void {
    this.questions.set(this.normalize(questions));
    this.clearMessages();
  }

  private normalize(questions: FormQuestionDraft[]): FormQuestionDraft[] {
    const knownSections = new Set(this.sections().map((section) => section.tempId));
    const ids = new Set(questions.map((question) => question.tempId));
    const byOrder = (left: FormQuestionDraft, right: FormQuestionDraft) => left.order - right.order;
    const isRoot = (question: FormQuestionDraft) => question.parentTempId === null || !ids.has(question.parentTempId);
    const sectionOf = (question: FormQuestionDraft) =>
      question.sectionTempId && knownSections.has(question.sectionTempId) ? question.sectionTempId : null;

    const result: FormQuestionDraft[] = [];
    const visited = new Set<string>();
    const visit = (question: FormQuestionDraft, sectionTempId: string | null): void => {
      if (visited.has(question.tempId)) return;
      visited.add(question.tempId);
      result.push({
        ...question,
        parentTempId: isRoot(question) ? null : question.parentTempId,
        sectionTempId,
        sectionName: this.sectionTitle(sectionTempId),
      });
      questions.filter((child) => child.parentTempId === question.tempId).sort(byOrder)
        .forEach((child) => visit(child, sectionTempId));
    };

    for (const sectionTempId of [...this.sections().map((section) => section.tempId), null]) {
      questions.filter((question) => isRoot(question) && sectionOf(question) === sectionTempId).sort(byOrder)
        .forEach((question) => visit(question, sectionTempId));
    }
    questions.filter((question) => !visited.has(question.tempId)).sort(byOrder)
      .forEach((question) => visit({ ...question, parentTempId: null }, sectionOf(question)));

    return result.map((question, order) => ({ ...question, order }));
  }

  private resolvePlacement(target: QuestionInsertTarget): {
    sectionTempId: string | null; parentTempId: string | null; parentQuestionId: string | null; order: number;
  } {
    const reference = target.afterTempId
      ? this.questions().find((question) => question.tempId === target.afterTempId)
      : undefined;
    if (reference) {
      return {
        sectionTempId: reference.sectionTempId,
        parentTempId: reference.parentTempId,
        parentQuestionId: reference.parentQuestionId,
        order: reference.order + 0.5,
      };
    }

    const sections = this.sections();
    const sectionTempId = target.sectionTempId !== undefined
      ? target.sectionTempId
      : (sections[sections.length - 1]?.tempId ?? null);
    return { sectionTempId, parentTempId: null, parentQuestionId: null, order: this.questions().length + 1 };
  }

  private siblingsOf(question: FormQuestionDraft): FormQuestionDraft[] {
    return this.questions()
      .filter((item) => item.parentTempId === question.parentTempId
        && (question.parentTempId !== null || item.sectionTempId === question.sectionTempId))
      .sort((left, right) => left.order - right.order);
  }

  private sectionTitle(sectionTempId: string | null): string | null {
    if (!sectionTempId) return null;
    return this.sections().find((section) => section.tempId === sectionTempId)?.title.trim() || null;
  }

  private remember(message: string): void {
    this.undoState.set({
      message,
      questions: this.questions(),
      sections: this.sections(),
      deletedQuestionIds: this.deletedQuestionIds(),
    });
  }

  private splitLines(text: string): string[] {
    return text.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  }

  private createTempId(): string {
    const [a, b] = crypto.getRandomValues(new Uint32Array(2));
    return `tmp-${Date.now()}-${a.toString(36)}${b.toString(36)}`;
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}
