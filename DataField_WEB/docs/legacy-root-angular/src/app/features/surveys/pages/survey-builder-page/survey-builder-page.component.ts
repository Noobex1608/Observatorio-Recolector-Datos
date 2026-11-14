import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { UnsavedChangesComponent } from '../../../../core/guards/unsaved-changes.guard';
import { SURVEY_REPOSITORY, USER_REPOSITORY } from '../../../../core/tokens/repository.tokens';
import { Question, QuestionType } from '../../models/question.model';
import { FormShare, SurveyStatus } from '../../models/survey.model';
import { QuestionFactoryService } from '../../services/question-factory.service';
import { SurveysFacade } from '../../services/surveys.facade';
import { User } from '../../../users/models/user.model';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthSessionService } from '../../../../core/services/auth-session.service';

@Component({
  selector: 'app-survey-builder-page',
  imports: [ReactiveFormsModule],
  templateUrl: './survey-builder-page.component.html',
  styleUrl: './survey-builder-page.component.css',
})
export class SurveyBuilderPageComponent implements UnsavedChangesComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly surveysFacade = inject(SurveysFacade);
  private readonly questionFactory = inject(QuestionFactoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);
  private readonly surveyRepo = inject(SURVEY_REPOSITORY);
  private readonly userRepo = inject(USER_REPOSITORY);
  private readonly sessionService = inject(AuthSessionService);

  protected readonly canManageShares = computed(() => {
    const role = this.sessionService.session()?.role;
    return role === 'SUPER_ADMIN' || role === 'ADMIN';
  });

  protected readonly questionTypes: QuestionType[] = [
    'MULTIPLE_CHOICE',
    'SINGLE_CHOICE',
    'LIKERT',
    'TEXT',
    'NUMBER',
  ];

  protected readonly statusOptions: SurveyStatus[] = ['DRAFT', 'DEPLOYED', 'ARCHIVED'];

  protected readonly form = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(5)]],
    description: [''],
    status: ['DRAFT' as SurveyStatus, [Validators.required]],
  });

  protected readonly questions = signal<Question[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);
  protected readonly selectedType = signal<QuestionType>('SINGLE_CHOICE');
  protected readonly pageTitle = computed(() => (this.surveyId ? 'Editar formulario' : 'Nuevo formulario'));
  protected readonly isFormInvalid = computed(
    () => this.form.invalid || this.questions().length === 0 || this.saving(),
  );

  protected readonly surveyId = this.route.snapshot.paramMap.get('id');

  // --- Share modal state ---
  protected readonly shareModalOpen = signal(false);
  protected readonly users = signal<User[]>([]);
  protected readonly shares = signal<FormShare[]>([]);
  protected readonly loadingShares = signal(false);
  protected readonly addingShare = signal(false);
  protected readonly editingShareId = signal<number | null>(null);
  protected readonly editTargetValue = signal<string>('');
  protected readonly savingTarget = signal(false);

  protected readonly shareForm = this.formBuilder.nonNullable.group({
    userId: [null as number | null, [Validators.required]],
    role: ['RECOLECTOR' as 'EDITOR' | 'RECOLECTOR', [Validators.required]],
    targetResponses: [null as number | null],
  });

  constructor() {
    if (!this.surveyId) {
      this.loadUsers();
      return;
    }

    this.loading.set(true);
    this.surveysFacade
      .findById(this.surveyId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((survey) => {
        if (!survey) {
          return;
        }

        this.form.patchValue({
          title: survey.title,
          description: survey.description ?? '',
          status: survey.status,
        });
        this.questions.set(structuredClone(survey.questions));
        this.dirty.set(false);
      });

    this.loadUsers();
  }

  // --- Share modal ---

  protected openShareModal(): void {
    if (!this.surveyId) {
      this.notification.info('Guarda el formulario primero para poder compartirlo.');
      return;
    }
    this.shareModalOpen.set(true);
    this.loadShares();
  }

  protected closeShareModal(): void {
    this.shareModalOpen.set(false);
  }

  protected onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeShareModal();
    }
  }

  protected addShare(): void {
    if (this.shareForm.invalid || !this.surveyId) {
      this.shareForm.markAllAsTouched();
      return;
    }

    this.addingShare.set(true);
    const { userId, role, targetResponses } = this.shareForm.getRawValue();
    const user = this.users().find((u) => u.id === userId);

    if (!user) {
      this.notification.error('Seleccione un usuario válido.');
      this.addingShare.set(false);
      return;
    }

    this.surveysFacade
      .addShare(this.surveyId, { email: user.email, role, targetResponses })
      .pipe(finalize(() => this.addingShare.set(false)))
      .subscribe({
        next: () => {
          this.notification.info('Usuario asignado exitosamente.');
          this.shareForm.patchValue({ userId: null, targetResponses: null });
          this.loadShares();
        },
        error: (err) => {
          const message = err?.error?.message ?? 'No fue posible asignar el usuario.';
          this.notification.error(message);
        },
      });
  }

  protected removeShare(shareId: number): void {
    if (!this.surveyId) return;
    const confirmed = globalThis.confirm('¿Retirar la invitación de este usuario?');
    if (!confirmed) return;

    this.surveysFacade.removeShare(this.surveyId, shareId).subscribe({
      next: () => {
        this.notification.info('Invitación retirada.');
        this.loadShares();
      },
      error: () => this.notification.error('No fue posible retirar la invitación.'),
    });
  }

  protected startEditTarget(share: FormShare): void {
    this.editingShareId.set(share.id);
    this.editTargetValue.set(share.targetResponses?.toString() ?? '');
  }

  protected cancelEditTarget(): void {
    this.editingShareId.set(null);
    this.editTargetValue.set('');
  }

  protected saveEditTarget(shareId: number): void {
    if (!this.surveyId) return;
    const raw = this.editTargetValue();
    const value = raw.trim() === '' ? null : parseInt(raw, 10);

    if (raw.trim() !== '' && (isNaN(value!) || value! < 1)) {
      this.notification.error('Ingrese un número válido mayor a 0.');
      return;
    }

    this.savingTarget.set(true);
    this.surveysFacade
      .updateShareTarget(this.surveyId, shareId, value)
      .pipe(finalize(() => this.savingTarget.set(false)))
      .subscribe({
        next: () => {
          this.notification.info('Objetivo actualizado. El formulario se reactivó para este usuario.');
          this.editingShareId.set(null);
          this.loadShares();
        },
        error: () => this.notification.error('No fue posible actualizar el objetivo.'),
      });
  }

  protected progressPercent(share: FormShare): number {
    if (!share.targetResponses || share.targetResponses <= 0) return 0;
    return Math.min(100, Math.round((share.responsesCount / share.targetResponses) * 100));
  }

  // --- Builder methods ---

  protected selectType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as QuestionType;
    this.selectedType.set(value);
  }

  protected addQuestion(): void {
    const question = this.questionFactory.create(this.selectedType(), this.questions().length + 1);
    this.questions.update((prev) => [...prev, question]);
    this.markDirty();
  }

  protected removeQuestion(questionId: string): void {
    this.questions.update((prev) =>
      prev.filter((question) => question.id !== questionId).map((question, index) => ({ ...question, order: index + 1 })),
    );
    this.markDirty();
  }

  protected moveQuestion(questionId: string, direction: 'up' | 'down'): void {
    const list = [...this.questions()];
    const index = list.findIndex((question) => question.id === questionId);
    const target = direction === 'up' ? index - 1 : index + 1;

    if (index < 0 || target < 0 || target >= list.length) {
      return;
    }

    [list[index], list[target]] = [list[target], list[index]];
    this.questions.set(list.map((question, idx) => ({ ...question, order: idx + 1 })));
    this.markDirty();
  }

  protected updateQuestionLabel(questionId: string, label: string): void {
    this.questions.update((prev) =>
      prev.map((question) => (question.id === questionId ? { ...question, label } : question)),
    );
    this.markDirty();
  }

  protected toggleRequired(questionId: string, required: boolean): void {
    this.questions.update((prev) =>
      prev.map((question) => (question.id === questionId ? { ...question, required } : question)),
    );
    this.markDirty();
  }

  protected addOption(questionId: string): void {
    this.questions.update((prev) =>
      prev.map((question) => {
        if (question.id !== questionId || (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE')) {
          return question;
        }

        return {
          ...question,
          options: [
            ...question.options,
            {
              id: `opt-${crypto.randomUUID()}`,
              label: `Opción ${question.options.length + 1}`,
              value: `opcion_${question.options.length + 1}`,
            },
          ],
        };
      }),
    );
    this.markDirty();
  }

  protected updateOptionLabel(questionId: string, optionId: string, label: string): void {
    this.questions.update((prev) =>
      prev.map((question) => {
        if (question.id !== questionId || (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE')) {
          return question;
        }

        return {
          ...question,
          options: question.options.map((option) =>
            option.id === optionId
              ? {
                  ...option,
                  label,
                  value: label.trim().toLowerCase().replace(/\s+/g, '_') || option.value,
                }
              : option,
          ),
        };
      }),
    );
    this.markDirty();
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.isFormInvalid()) {
      return;
    }

    const payload = {
      ...this.form.getRawValue(),
      description: this.form.getRawValue().description || undefined,
      createdBy: 'u-admin',
      questions: this.questions(),
    };

    this.saving.set(true);

    const request$ = this.surveyId
      ? this.surveysFacade.update(this.surveyId, payload)
      : this.surveysFacade.create(payload);

    request$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (result: any) => {
        this.dirty.set(false);
        if (!this.surveyId && result?.id) {
          this.router.navigateByUrl(`/surveys/${result.id}/edit`);
        } else {
          this.router.navigateByUrl('/surveys');
        }
      },
    });
  }

  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  protected trackByQuestionId(_: number, question: Question): string {
    return question.id;
  }

  protected questionTypeLabel(type: QuestionType): string {
    if (type === 'MULTIPLE_CHOICE') {
      return 'Selección múltiple';
    }

    if (type === 'SINGLE_CHOICE') {
      return 'Selección única';
    }

    if (type === 'LIKERT') {
      return 'Escala de Likert';
    }

    if (type === 'TEXT') {
      return 'Texto';
    }

    return 'Número';
  }

  protected statusLabel(status: SurveyStatus): string {
    if (status === 'DRAFT') {
      return 'Borrador';
    }

    if (status === 'DEPLOYED') {
      return 'Implementado';
    }

    return 'Archivado';
  }

  private loadUsers(): void {
    this.userRepo.list().subscribe({
      next: (users) => this.users.set(users),
    });
  }

  private loadShares(): void {
    if (!this.surveyId) return;
    this.loadingShares.set(true);
    this.surveysFacade
      .getShares(this.surveyId)
      .pipe(finalize(() => this.loadingShares.set(false)))
      .subscribe({
        next: (shares) => this.shares.set(shares),
        error: () => this.notification.error('No fue posible cargar las asignaciones.'),
      });
  }

  private markDirty(): void {
    this.dirty.set(true);
  }
}
