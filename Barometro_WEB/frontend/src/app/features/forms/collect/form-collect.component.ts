import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Form, FormQuestion, FormService } from '@core/services/form.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface QuestionVisualMeta {
  level: number;
  displayNumber: string;
  sectionName: string;
}

@Component({
  selector: 'app-form-collect',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  template: `
    <div class="collect-page">
      @if (loading()) {
        <div class="state-box">
          <mat-spinner diameter="40"></mat-spinner>
          <p>{{ 'forms.collect.loading' | translate }}</p>
        </div>
      } @else if (error()) {
        <div class="state-box error">
          <mat-icon>error_outline</mat-icon>
          <p>{{ error() }}</p>
        </div>
      } @else if (submitted()) {
        <div class="state-box success">
          <mat-icon>check_circle</mat-icon>
          <h2>{{ 'forms.collect.submittedTitle' | translate }}</h2>
          <p>{{ 'forms.collect.submittedText' | translate }}</p>
          <button mat-raised-button color="primary" (click)="resetForm()" type="button">
            {{ 'forms.collect.sendAnother' | translate }}
          </button>
        </div>
      } @else if (form()) {
        <div class="collect-card">
          <header class="collect-header">
            <h1>{{ form()!.title }}</h1>
            @if (form()!.description) {
              <p>{{ form()!.description }}</p>
            }
          </header>

          <form (ngSubmit)="onSubmit()" class="collect-form" novalidate>
            @if (form()!.step_by_step) {
              <div class="step-progress">
                <span>{{ currentStepNumber() }} / {{ totalStepCount() }}</span>
                <p>{{ 'forms.collect.stepMode' | translate }}</p>
              </div>
            }

            @for (question of orderedQuestions(); track question.id; let i = $index) {
              @if (!form()!.step_by_step || i === currentStepIndex()) {
                @if (shouldShowSectionHeader(i, question)) {
                  <div class="section-divider">
                    <span class="section-divider__line"></span>
                    <strong>{{ getQuestionSectionName(question) }}</strong>
                    <span class="section-divider__line"></span>
                  </div>
                }

                <div
                  class="question-block"
                  [class.invalid]="questionError(question.id)"
                  [class.subquestion]="getQuestionLevel(question.id) > 0"
                  [style.margin-left.px]="getQuestionIndent(question.id)"
                >
                  <label class="question-label">
                    {{ getQuestionDisplayNumber(question.id) }}. {{ question.label }}
                    @if (question.required) {
                      <span class="required">*</span>
                    }
                  </label>

                  @if (getQuestionLevel(question.id) > 0) {
                    <span class="subquestion-chip">{{ 'forms.collect.subquestion' | translate }}</span>
                  }

                  @switch (question.type) {
                    @case ('SINGLE_CHOICE') {
                      <div class="options-list">
                        @for (opt of getChoiceOptions(question); track $index) {
                          <label class="option">
                            <input
                              type="radio"
                              [name]="question.id"
                              [value]="opt"
                              [ngModel]="answers()[question.id]"
                              (ngModelChange)="setAnswer(question.id, $event)"
                              [required]="question.required"
                            />
                            {{ opt }}
                          </label>
                        }
                      </div>
                    }
                    @case ('MULTIPLE_CHOICE') {
                      <div class="options-list">
                        @for (opt of getChoiceOptions(question); track $index) {
                          <label class="option">
                            <input
                              type="checkbox"
                              [checked]="isSelected(question.id, opt)"
                              (change)="toggleMulti(question.id, opt, $any($event.target).checked)"
                            />
                            {{ opt }}
                          </label>
                        }
                      </div>
                    }
                    @case ('LIKERT') {
                      <div class="likert-table-wrap">
                        <div
                          class="likert-table"
                          [style.grid-template-columns]="'minmax(160px, 1.35fr) repeat(' + getLikertColumns(question).length + ', minmax(96px, 1fr))'"
                        >
                          <span></span>
                          @for (column of getLikertColumns(question); track $index) {
                            <strong>{{ column }}</strong>
                          }
                          @for (row of getLikertRows(question); track row; let rowIndex = $index) {
                            <span class="likert-row-label">{{ row }}</span>
                            @for (column of getLikertColumns(question); track column) {
                              <label class="likert-cell">
                                <input
                                  type="radio"
                                  [name]="question.id + '-' + rowIndex"
                                  [value]="column"
                                  [ngModel]="getLikertAnswer(question.id, row)"
                                  (ngModelChange)="setLikertAnswer(question.id, row, $event)"
                                  [required]="question.required"
                                />
                              </label>
                            }
                          }
                        </div>
                      </div>
                    }
                    @case ('TEXT') {
                      <textarea
                        class="text-input"
                        [name]="question.id"
                        rows="3"
                        [ngModel]="answers()[question.id]"
                        (ngModelChange)="setAnswer(question.id, $event)"
                        [required]="question.required"
                        [placeholder]="'forms.collect.textPlaceholder' | translate"
                      ></textarea>
                    }
                    @case ('NUMBER') {
                      <input
                        type="number"
                        class="number-input"
                        [name]="question.id"
                        [ngModel]="answers()[question.id]"
                        (ngModelChange)="setAnswer(question.id, $event)"
                        [required]="question.required"
                        placeholder="0"
                      />
                    }
                  }

                  @if (questionError(question.id)) {
                    <p class="question-error">{{ questionError(question.id) }}</p>
                  }
                </div>
              }
            }

            @if (form()!.step_by_step) {
              <div class="step-actions">
                <button
                  mat-stroked-button
                  color="primary"
                  type="button"
                  class="submit-btn secondary"
                  (click)="goBack()"
                  [disabled]="submitting() || !canGoBack()"
                >
                  {{ 'forms.collect.back' | translate }}
                </button>

                <button
                  mat-raised-button
                  color="primary"
                  type="button"
                  class="submit-btn"
                  (click)="onSubmit()"
                  [disabled]="submitting()"
                >
                  @if (submitting()) {
                    {{ 'forms.collect.submitting' | translate }}
                  } @else if (isLastStep()) {
                    {{ 'forms.collect.finish' | translate }}
                  } @else {
                    {{ 'forms.collect.next' | translate }}
                  }
                </button>
              </div>
            } @else {
              <button
                mat-raised-button
                color="primary"
                type="submit"
                class="submit-btn"
                [disabled]="submitting()"
              >
                @if (submitting()) {
                  {{ 'forms.collect.submitting' | translate }}
                } @else {
                  {{ 'forms.collect.submit' | translate }}
                }
              </button>
            }
          </form>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .collect-page {
        min-height: 100vh;
        background: var(--bg-primary);
        padding: 1.5rem 1rem;
        display: flex;
        justify-content: center;
      }

      .collect-card {
        width: 100%;
        max-width: 900px;
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: var(--radius-xl);
        overflow: hidden;
      }

      .collect-header {
        padding: 1.5rem;
        background: var(--primary-600);
        color: white;

        h1 {
          margin: 0 0 0.5rem;
          font-size: 1.5rem;
        }

        p {
          margin: 0;
          opacity: 0.9;
          font-size: 0.875rem;
        }
      }

      .collect-form {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }

      .step-progress {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.9rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);

        span {
          font-weight: 800;
          color: var(--primary-600);
        }

        p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
      }

      .question-block {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.9rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--bg-primary);
      }

      .question-block.subquestion {
        border-style: dashed;
        background: var(--bg-secondary);
      }

      .question-block.invalid {
        border: 1px solid rgba(239, 68, 68, 0.28);
        background: var(--error-bg);
      }

      .section-divider {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 0.75rem;
        margin: 0.35rem 0 0.15rem;

        strong {
          font-size: 0.8rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
      }

      .section-divider__line {
        height: 1px;
        background: var(--border-color);
      }

      .question-label {
        font-weight: 600;
        font-size: 0.9375rem;
        color: var(--text-primary);
      }

      .subquestion-chip {
        display: inline-flex;
        align-self: flex-start;
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--primary-700);
        background: var(--primary-100);
        border: 1px solid var(--primary-200);
        border-radius: var(--radius-full);
        padding: 0.16rem 0.5rem;
      }

      .required {
        color: #c8102e;
      }

      .question-error {
        margin: 0;
        color: var(--error-color);
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .options-list {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }

      .option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: var(--text-secondary);
        cursor: pointer;
      }

      .likert-table-wrap {
        overflow-x: auto;
      }

      .likert-table {
        display: grid;
        min-width: 100%;
        overflow: hidden;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
      }

      .likert-table > * {
        display: grid;
        min-height: 46px;
        place-items: center;
        border-right: 1px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
        padding: 0.55rem;
        color: var(--text-secondary);
        font-size: 0.8125rem;
        text-align: center;
      }

      .likert-table strong {
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-weight: 700;
      }

      .likert-row-label {
        justify-items: start;
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-weight: 600;
        text-align: left;
      }

      .likert-cell {
        cursor: pointer;

        input {
          accent-color: var(--primary-600);
        }
      }

      .text-input,
      .number-input {
        width: 100%;
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.875rem;
      }

      .submit-btn {
        width: 100%;
        margin-top: 0.5rem;
      }

      .step-actions {
        display: grid;
        grid-template-columns: 1fr 1.5fr;
        gap: 0.75rem;
      }

      .submit-btn.secondary {
        margin-top: 0.5rem;
      }

      .state-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 3rem 2rem;
        text-align: center;
        color: var(--text-secondary);

        mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }

        &.error mat-icon {
          color: var(--error-color);
        }

        &.success mat-icon {
          color: var(--text-primary);
        }

        h2 {
          margin: 0;
          color: var(--text-primary);
        }
      }
    `,
  ],
})
export class FormCollectComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private formService = inject(FormService);
  private translate = inject(TranslateService);

  form = signal<Form | null>(null);
  answers = signal<Record<string, unknown>>({});
  validationErrors = signal<Record<string, string>>({});
  loading = signal(true);
  submitting = signal(false);
  submitted = signal(false);
  error = signal('');
  currentStepIndex = signal(0);
  stepHistory = signal<number[]>([0]);

  orderedQuestions = computed(() =>
    [...(this.form()?.questions ?? [])].sort((left, right) => left.order - right.order),
  );

  questionVisualMeta = computed(() => this.buildQuestionVisualMeta(this.orderedQuestions()));

  currentQuestion = computed(() => {
    const form = this.form();
    if (!form?.step_by_step) {
      return null;
    }

    return this.orderedQuestions()[this.currentStepIndex()] ?? null;
  });

  isLastStep = computed(() => {
    const form = this.form();
    const questions = this.orderedQuestions();
    const currentQuestion = this.currentQuestion();

    if (!form?.step_by_step || questions.length === 0 || !currentQuestion) {
      return false;
    }

    return this.getNextStepIndex(currentQuestion, questions) >= questions.length;
  });

  totalStepCount = computed(() => {
    if (!this.form()?.step_by_step) {
      return this.orderedQuestions().length;
    }

    const flow = this.getFlowQuestions();
    return flow.length > 0 ? flow.length : 1;
  });

  currentStepNumber = computed(() => {
    const currentQuestion = this.currentQuestion();
    if (!currentQuestion || !this.form()?.step_by_step) {
      return 1;
    }

    const flow = this.getFlowQuestions();
    const currentPosition = flow.findIndex((question) => question.id === currentQuestion.id);
    return currentPosition >= 0 ? currentPosition + 1 : 1;
  });

  canGoBack = computed(() => {
    if (!this.form()?.step_by_step) {
      return false;
    }

    return this.stepHistory().length > 1;
  });

  private linkUuid = '';

  ngOnInit(): void {
    this.linkUuid = this.route.snapshot.paramMap.get('uuid') ?? '';
    if (!this.linkUuid) {
      this.error.set(this.translate.instant('forms.collect.errors.invalidLink'));
      this.loading.set(false);
      return;
    }
    this.loadForm();
  }

  loadForm(): void {
    this.formService.fetchPublicForm(this.linkUuid).subscribe({
      next: (form) => {
        this.form.set({ ...form, questions: form.questions ?? [] });
        this.currentStepIndex.set(0);
        this.stepHistory.set([0]);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('forms.collect.errors.load'));
        this.loading.set(false);
      },
    });
  }

  setAnswer(questionId: string, value: unknown): void {
    this.answers.update((answers) => ({ ...answers, [questionId]: value }));
    this.clearQuestionError(questionId);
  }

  isSelected(questionId: string, option: string): boolean {
    const value = this.answers()[questionId];
    return Array.isArray(value) && value.includes(option);
  }

  toggleMulti(questionId: string, option: string, checked: boolean): void {
    const current = this.answers()[questionId];
    const selected = Array.isArray(current) ? [...current] : [];

    if (checked && !selected.includes(option)) {
      selected.push(option);
    } else if (!checked) {
      const index = selected.indexOf(option);
      if (index >= 0) selected.splice(index, 1);
    }

    this.setAnswer(questionId, selected);
  }

  getChoiceOptions(question: FormQuestion): string[] {
    return Array.isArray(question.options)
      ? question.options.map((option) => String(option)).filter(Boolean)
      : [];
  }

  getLikertRows(question: FormQuestion): string[] {
    if (Array.isArray(question.likert_rows)) {
      return question.likert_rows.map((row) => String(row)).filter(Boolean);
    }

    if (question.options && !Array.isArray(question.options) && Array.isArray(question.options.rows)) {
      return question.options.rows.map((row) => String(row)).filter(Boolean);
    }

    return [question.label];
  }

  getLikertColumns(question: FormQuestion): string[] {
    if (Array.isArray(question.likert_columns)) {
      return question.likert_columns.map((column) => String(column)).filter(Boolean);
    }

    if (question.options && !Array.isArray(question.options) && Array.isArray(question.options.columns)) {
      return question.options.columns.map((column) => String(column)).filter(Boolean);
    }

    if (Array.isArray(question.options)) {
      return question.options.map((column) => String(column)).filter(Boolean);
    }

    return [];
  }

  getLikertAnswer(questionId: string, row: string): unknown {
    const value = this.answers()[questionId];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return (value as Record<string, unknown>)[row];
    }

    return value;
  }

  setLikertAnswer(questionId: string, row: string, value: unknown): void {
    const current = this.answers()[questionId];
    const matrix = current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};

    matrix[row] = value;
    this.setAnswer(questionId, matrix);
  }

  onSubmit(): void {
    if (this.submitting()) return;

    if (this.form()?.step_by_step) {
      this.advanceStep();
      return;
    }

    if (!this.validateRequiredQuestions()) return;

    this.submitAnswers();
  }

  goBack(): void {
    if (!this.form()?.step_by_step || this.stepHistory().length <= 1) {
      return;
    }

    this.stepHistory.update((history) => history.slice(0, -1));
    const history = this.stepHistory();
    this.currentStepIndex.set(history[history.length - 1] ?? 0);
    this.clearStepErrors();
  }

  advanceStep(): void {
    const form = this.form();
    const currentQuestion = this.currentQuestion();

    if (!form?.step_by_step || !currentQuestion) {
      return;
    }

    if (!this.validateQuestion(currentQuestion)) {
      return;
    }

    const orderedQuestions = this.orderedQuestions();
    const nextStep = this.getNextStepIndex(currentQuestion, orderedQuestions);

    if (nextStep >= orderedQuestions.length) {
      if (!this.validateFlowQuestions()) {
        return;
      }

      this.submitAnswers();
      return;
    }

    this.currentStepIndex.set(nextStep);
    this.stepHistory.update((history) => [...history, nextStep]);
  }

  resetForm(): void {
    this.answers.set({});
    this.validationErrors.set({});
    this.currentStepIndex.set(0);
    this.stepHistory.set([0]);
    this.submitted.set(false);
    this.error.set('');
  }

  questionError(questionId: string): string {
    return this.validationErrors()[questionId] ?? '';
  }

  getQuestionDisplayNumber(questionId: string): string {
    return this.questionVisualMeta().get(questionId)?.displayNumber ?? '0';
  }

  getQuestionLevel(questionId: string): number {
    return this.questionVisualMeta().get(questionId)?.level ?? 0;
  }

  getQuestionIndent(questionId: string): number {
    return this.getQuestionLevel(questionId) * 16;
  }

  getQuestionSectionName(question: FormQuestion): string {
    const section = this.questionVisualMeta().get(question.id)?.sectionName?.trim();
    return section || this.translate.instant('forms.collect.sectionGeneral');
  }

  shouldShowSectionHeader(index: number, question: FormQuestion): boolean {
    if (index === 0) return true;

    const questions = this.orderedQuestions();
    const previous = questions[index - 1];
    if (!previous) return true;

    return this.getQuestionSectionName(previous) !== this.getQuestionSectionName(question);
  }

  private submitAnswers(): void {
    this.submitting.set(true);

    this.formService.submitResponse(this.linkUuid, this.answers()).subscribe({
      next: () => {
        this.submitted.set(true);
        this.submitting.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('forms.collect.errors.submit'));
        this.submitting.set(false);
      },
    });
  }

  private validateRequiredQuestions(): boolean {
    const form = this.form();
    if (!form) return false;

    const errors = this.buildValidationErrors(form.questions ?? []);
    this.validationErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  private validateFlowQuestions(): boolean {
    const errors = this.buildValidationErrors(this.getFlowQuestions());
    this.validationErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  private validateQuestion(question: FormQuestion): boolean {
    if (!this.isQuestionActive(question)) {
      this.clearQuestionError(question.id);
      return true;
    }

    const errors = { ...this.validationErrors() };

    if (!question.required || this.hasRequiredAnswer(question)) {
      delete errors[question.id];
      this.validationErrors.set(errors);
      return true;
    }

    errors[question.id] = question.type === 'LIKERT'
      ? this.translate.instant('forms.collect.errors.requiredLikert')
      : this.translate.instant('forms.collect.errors.required');

    this.validationErrors.set(errors);
    return false;
  }

  private buildValidationErrors(questions: FormQuestion[]): Record<string, string> {
    const errors: Record<string, string> = {};

    for (const question of questions) {
      if (!this.isQuestionActive(question)) {
        continue;
      }

      if (!question.required || this.hasRequiredAnswer(question)) {
        continue;
      }

      errors[question.id] = question.type === 'LIKERT'
        ? this.translate.instant('forms.collect.errors.requiredLikert')
        : this.translate.instant('forms.collect.errors.required');
    }

    return errors;
  }

  private clearStepErrors(): void {
    const currentQuestion = this.currentQuestion();
    if (!currentQuestion) {
      return;
    }

    this.clearQuestionError(currentQuestion.id);
  }

  private getFlowQuestions(): FormQuestion[] {
    const form = this.form();
    const questions = this.orderedQuestions();

    if (!form?.step_by_step || questions.length === 0) {
      return questions;
    }

    const indexById = new Map(questions.map((question, index) => [question.id, index]));
    const conditionalTargetIds = this.getConditionalTargetIds(questions);
    const visited = new Set<string>();
    const flow: FormQuestion[] = [];
    let currentIndex = 0;

    while (currentIndex < questions.length) {
      const question = questions[currentIndex];

      if (visited.has(question.id)) {
        break;
      }

      visited.add(question.id);
      flow.push(question);

      const nextIndex = this.getNextStepIndex(question, questions, indexById, conditionalTargetIds);
      if (nextIndex <= currentIndex) {
        break;
      }

      currentIndex = nextIndex;
    }

    return flow;
  }

  private getNextStepIndex(
    question: FormQuestion,
    questions: FormQuestion[],
    indexById: Map<string, number> = new Map(questions.map((item, index) => [item.id, index])),
    conditionalTargetIds: Set<string> = this.getConditionalTargetIds(questions),
  ): number {
    const currentIndex = questions.findIndex((item) => item.id === question.id);
    if (currentIndex < 0) {
      return questions.length;
    }

    const sequentialNextIndex = this.getSequentialNextIndex(currentIndex, questions, conditionalTargetIds);

    if (!this.form()?.step_by_step || question.type !== 'SINGLE_CHOICE') {
      return sequentialNextIndex;
    }

    const answer = this.answers()[question.id];
    if (typeof answer !== 'string' || !Array.isArray(question.options)) {
      return sequentialNextIndex;
    }

    const selectedIndex = question.options.findIndex((option) => String(option) === answer);
    if (selectedIndex < 0) {
      return sequentialNextIndex;
    }

    const branchDecision = question.branch_rules?.find((rule) => rule.option_index === selectedIndex);
    const action = branchDecision?.action ?? (branchDecision?.next_question_id ? 'GO_TO' : 'CONTINUE');

    if (action === 'END_FORM') {
      return questions.length;
    }

    const branchTargetId = action === 'GO_TO' ? branchDecision?.next_question_id : null;
    if (!branchTargetId) {
      return sequentialNextIndex;
    }

    const branchTargetIndex = indexById.get(branchTargetId);
    if (branchTargetIndex === undefined || branchTargetIndex <= currentIndex) {
      return sequentialNextIndex;
    }

    return branchTargetIndex;
  }

  private getConditionalTargetIds(questions: FormQuestion[]): Set<string> {
    const targetIds = new Set<string>();

    for (const question of questions) {
      if (question.type !== 'SINGLE_CHOICE' || !Array.isArray(question.branch_rules)) {
        continue;
      }

      for (const rule of question.branch_rules) {
        const action = rule.action ?? (rule.next_question_id ? 'GO_TO' : 'CONTINUE');
        if (action !== 'GO_TO' || typeof rule.next_question_id !== 'string') {
          continue;
        }

        targetIds.add(rule.next_question_id);
      }
    }

    return targetIds;
  }

  private getSequentialNextIndex(
    currentIndex: number,
    questions: FormQuestion[],
    conditionalTargetIds: Set<string>,
  ): number {
    let nextIndex = currentIndex + 1;

    while (nextIndex < questions.length && conditionalTargetIds.has(questions[nextIndex].id)) {
      nextIndex += 1;
    }

    return nextIndex;
  }

  private hasRequiredAnswer(question: FormQuestion): boolean {
    const answer = this.answers()[question.id];

    if (question.type === 'MULTIPLE_CHOICE') {
      return Array.isArray(answer) && answer.length > 0;
    }

    if (question.type === 'LIKERT') {
      const rows = this.getLikertRows(question);
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;

      const matrix = answer as Record<string, unknown>;
      return rows.every((row) => matrix[row] !== undefined && matrix[row] !== null && String(matrix[row]).trim() !== '');
    }

    return answer !== undefined && answer !== null && String(answer).trim() !== '';
  }

  private isQuestionActive(question: FormQuestion): boolean {
    const parentId = question.parent_question_id;
    if (!parentId) {
      return true;
    }

    const parent = this.orderedQuestions().find((item) => item.id === parentId);
    if (!parent) {
      return true;
    }

    return this.hasRequiredAnswer(parent);
  }

  private clearQuestionError(questionId: string): void {
    if (!this.validationErrors()[questionId]) return;

    this.validationErrors.update((errors) => {
      const next = { ...errors };
      delete next[questionId];
      return next;
    });
  }

  private buildQuestionVisualMeta(questions: FormQuestion[]): Map<string, QuestionVisualMeta> {
    const byParent = new Map<string | null, FormQuestion[]>();

    for (const question of questions) {
      const parentId = question.parent_question_id ?? null;
      const siblings = byParent.get(parentId) ?? [];
      siblings.push(question);
      byParent.set(parentId, siblings);
    }

    for (const siblings of byParent.values()) {
      siblings.sort((left, right) => left.order - right.order);
    }

    const rootQuestions = (byParent.get(null) ?? []).slice().sort((left, right) => left.order - right.order);
    const meta = new Map<string, QuestionVisualMeta>();

    rootQuestions.forEach((root, rootIndex) => {
      const sectionName = (root.section_name ?? '').trim();
      this.walkQuestionTree(root, byParent, meta, [rootIndex + 1], 0, sectionName);
    });

    return meta;
  }

  private walkQuestionTree(
    question: FormQuestion,
    byParent: Map<string | null, FormQuestion[]>,
    meta: Map<string, QuestionVisualMeta>,
    path: number[],
    level: number,
    inheritedSection: string,
  ): void {
    const sectionName = (question.section_name ?? '').trim() || inheritedSection;

    meta.set(question.id, {
      level,
      displayNumber: path.join('.'),
      sectionName,
    });

    const children = (byParent.get(question.id) ?? []).slice().sort((left, right) => left.order - right.order);
    children.forEach((child, childIndex) => {
      this.walkQuestionTree(child, byParent, meta, [...path, childIndex + 1], level + 1, sectionName);
    });
  }
}
