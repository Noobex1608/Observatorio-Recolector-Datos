import { Injectable, computed, inject, signal } from '@angular/core';
import { Form, FormQuestion, FormQuestionBranchRule, FormService } from '@core/services/form.service';
import { Project, ProjectService } from '@core/services/project.service';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

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

export interface FormQuestionBranchRuleDraft {
  optionIndex: number;
  action: 'CONTINUE' | 'GO_TO' | 'END_FORM';
  nextQuestionTempId: string | null;
}

const SELECT_TYPES: FormQuestion['type'][] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'];
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
  questions = signal<FormQuestionDraft[]>([]);
  sections = signal<FormSectionDraft[]>([]);
  deletedQuestionIds = signal<string[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  isEditMode = computed(() => Boolean(this.formId()));
  questionsCount = computed(() => this.questions().length);
  canEditQuestions = computed(() => this.state() !== 'DEPLOYED');
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

    return hasTitle && hasProject && hasQuestions && allQuestionsValid && this.canEditQuestions();
  });

  async loadForm(id: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const form = await firstValueFrom(this.formService.getForm(id));
      this.formId.set(form.id);
      this.projectId.set(form.project_id ?? null);
      this.title.set(form.title);
      this.description.set(form.description ?? '');
      this.state.set(form.state);
      this.stepByStep.set(Boolean(form.step_by_step));
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
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.builder.errors.load'));
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

  addSection(title = ''): void {
    if (!this.canEditQuestions()) return;

    const newSection: FormSectionDraft = {
      tempId: this.createTempId(),
      title: title.trim(),
      order: this.sections().length,
    };

    this.sections.update((sections) => [...sections, newSection]);
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

  removeSection(tempId: string): void {
    if (!this.canEditQuestions()) return;

    this.sections.update((sections) =>
      sections.filter((section) => section.tempId !== tempId).map((section, index) => ({ ...section, order: index })),
    );

    this.questions.update((questions) =>
      questions.map((question) =>
        question.sectionTempId === tempId ? { ...question, sectionTempId: null, sectionName: null } : question,
      ),
    );
  }

  assignQuestionToSection(tempId: string, sectionTempId: string | null): void {
    if (!this.canEditQuestions()) return;

    const sectionTitle = sectionTempId ? this.sections().find((section) => section.tempId === sectionTempId)?.title.trim() || null : null;

    this.questions.update((questions) =>
      questions.map((question) =>
        question.tempId === tempId ? { ...question, sectionTempId, sectionName: sectionTitle } : question,
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

  addQuestion(type: FormQuestion['type']): void {
    if (!this.canEditQuestions()) return;

    const newQuestion: FormQuestionDraft = {
      tempId: this.createTempId(),
      type,
      label: '',
      options: this.getInitialOptions(type),
      likertRows: type === 'LIKERT' ? [...DEFAULT_LIKERT_ROWS] : [],
      likertColumns: type === 'LIKERT' ? [...DEFAULT_LIKERT_OPTIONS] : [],
      branchRules: this.getInitialBranchRules(type),
      required: true,
      order: this.getQuestionsForParent(null).length,
      sectionName: null,
      sectionTempId: null,
      parentQuestionId: null,
      parentTempId: null,
    };

    this.questions.update((questions) => [...questions, newQuestion]);
  }

  addSubquestion(parentTempId: string): void {
    if (!this.canEditQuestions()) return;

    const parent = this.questions().find((question) => question.tempId === parentTempId);
    if (!parent) return;

    const childQuestion: FormQuestionDraft = {
      tempId: this.createTempId(),
      type: 'TEXT',
      label: '',
      options: [],
      likertRows: [],
      likertColumns: [],
      branchRules: [],
      required: true,
      order: this.getQuestionsForParent(parentTempId).length,
      sectionName: parent.sectionName,
      sectionTempId: parent.sectionTempId,
      parentQuestionId: parent.id ?? null,
      parentTempId,
    };

    this.questions.update((questions) => [...questions, childQuestion]);
  }

  removeQuestion(tempId: string): void {
    if (!this.canEditQuestions()) return;

    const current = this.questions().find((question) => question.tempId === tempId);
    if (current?.id) {
      this.deletedQuestionIds.update((ids) => [...ids, current.id as string]);
    }

    this.questions.update((questions) =>
      questions
        .filter((question) => question.tempId !== tempId)
        .map((question) => ({
          ...question,
          branchRules: question.branchRules.map((rule) =>
            rule.nextQuestionTempId === tempId ? { ...rule, nextQuestionTempId: null } : rule,
          ),
        }))
        .map((question, index) => ({ ...question, order: index })),
    );
  }

  moveQuestion(tempId: string, direction: -1 | 1): void {
    if (!this.canEditQuestions()) return;

    const questions = [...this.questions()];
    const index = questions.findIndex((question) => question.tempId === tempId);
    const target = index + direction;

    if (index < 0 || target < 0 || target >= questions.length) return;

    [questions[index], questions[target]] = [questions[target], questions[index]];
    this.questions.set(questions.map((question, order) => ({ ...question, order })));
  }

  reorderQuestion(sourceTempId: string, targetTempId: string, position: 'before' | 'after' = 'after'): void {
    if (!this.canEditQuestions()) return;

    const questions = [...this.questions()];
    const sourceIndex = questions.findIndex((question) => question.tempId === sourceTempId);
    const targetIndex = questions.findIndex((question) => question.tempId === targetTempId);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const [movedQuestion] = questions.splice(sourceIndex, 1);

    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = position === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1;

    questions.splice(insertIndex, 0, movedQuestion);

    this.questions.set(questions.map((question, order) => ({ ...question, order })));
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

  async saveForm(): Promise<void> {
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

      const savedForm = formId
        ? await firstValueFrom(
            this.formService.updateForm(formId, {
              title: this.title().trim(),
              description: this.description().trim(),
              step_by_step: resolvedStepByStep,
            }),
          )
        : await firstValueFrom(
            this.formService.createForm({
              title: this.title().trim(),
              description: this.description().trim(),
              project_id: this.projectId(),
              step_by_step: resolvedStepByStep,
            }),
          );

      this.formId.set(savedForm.id);
      this.state.set(savedForm.state);
      this.stepByStep.set(Boolean(savedForm.step_by_step));

      const savedQuestionIds = new Map<string, string>();

      for (const questionId of this.deletedQuestionIds()) {
        await firstValueFrom(this.formService.deleteQuestion(questionId));
      }

      for (const question of this.questions()) {
        const payload = this.toQuestionPayload(question);

        if (question.id) {
          await firstValueFrom(this.formService.updateQuestion(question.id, payload));
          savedQuestionIds.set(question.tempId, question.id);
        } else {
          const created = await firstValueFrom(this.formService.createQuestion(savedForm.id, payload));
          savedQuestionIds.set(question.tempId, created.id);
          this.patchQuestion(question.tempId, { id: created.id, tempId: created.id });
        }
      }

      for (const question of this.questions()) {
        const resolvedParentQuestionId = question.parentTempId
          ? (savedQuestionIds.get(question.parentTempId) ?? question.parentQuestionId ?? null)
          : null;

        if (question.id) {
          await firstValueFrom(this.formService.updateQuestion(question.id, {
            parent_question_id: resolvedParentQuestionId,
          }));
        }

        this.patchQuestion(question.tempId, { parentQuestionId: resolvedParentQuestionId });
      }

      for (const question of this.questions()) {
        if (!this.supportsBranching(question.type) || question.branchRules.length === 0) {
          continue;
        }

        const resolvedRules = question.branchRules.map((rule) => ({
          option_index: rule.optionIndex,
          action: rule.action,
          next_question_id: rule.action === 'GO_TO' && rule.nextQuestionTempId
            ? (savedQuestionIds.get(rule.nextQuestionTempId) ?? rule.nextQuestionTempId)
            : null,
        }));

        const questionId = savedQuestionIds.get(question.tempId) ?? question.id;
        if (questionId) {
          await firstValueFrom(this.formService.updateQuestion(questionId, { branch_rules: resolvedRules }));
        }
      }

      this.deletedQuestionIds.set([]);
      this.successMessage.set(this.translate.instant('forms.builder.messages.saved'));
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.builder.errors.save'));
    } finally {
      this.isSaving.set(false);
    }
  }

  resetForm(): void {
    this.formId.set(null);
    this.projectId.set(null);
    this.title.set('');
    this.description.set('');
    this.state.set('DRAFT');
    this.stepByStep.set(false);
    this.questions.set([]);
    this.sections.set([]);
    this.deletedQuestionIds.set([]);
    this.clearMessages();
  }

  getTypeLabel(type: FormQuestion['type']): string {
    const labels: Record<FormQuestion['type'], string> = {
      SINGLE_CHOICE: 'forms.builder.types.SINGLE_CHOICE',
      MULTIPLE_CHOICE: 'forms.builder.types.MULTIPLE_CHOICE',
      LIKERT: 'forms.builder.types.LIKERT',
      TEXT: 'forms.builder.types.TEXT',
      NUMBER: 'forms.builder.types.NUMBER',
    };

    return labels[type];
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
      required: question.required,
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

    return SELECT_TYPES.includes(question.type) ? [''] : [];
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
    if (SELECT_TYPES.includes(type)) return [''];
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
      label: question.label.trim() || this.translate.instant('forms.builder.types.LIKERT'),
      required: question.required,
      order: question.order,
      options,
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

  private createTempId(): string {
    return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}
