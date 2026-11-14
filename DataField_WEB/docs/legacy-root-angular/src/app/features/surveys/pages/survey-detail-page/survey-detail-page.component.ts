import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { Survey } from '../../models/survey.model';
import { FormShare } from '../../models/survey.model';
import { SurveysFacade } from '../../services/surveys.facade';
import { QuestionType } from '../../models/question.model';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-survey-detail-page',
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './survey-detail-page.component.html',
  styleUrl: './survey-detail-page.component.css',
})
export class SurveyDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly surveysFacade = inject(SurveysFacade);
  private readonly notification = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  protected readonly surveyId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly loading = signal(false);
  protected readonly survey = signal<Survey | null>(null);
  protected readonly shares = signal<FormShare[]>([]);
  protected readonly loadingShares = signal(false);
  protected readonly addingShare = signal(false);
  protected readonly editingShareId = signal<number | null>(null);
  protected readonly editTargetValue = signal<string>('');
  protected readonly savingTarget = signal(false);

  protected readonly shareForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['RECOLECTOR' as 'EDITOR' | 'RECOLECTOR', [Validators.required]],
    targetResponses: [null as number | null],
  });

  constructor() {
    if (!this.surveyId) {
      return;
    }

    this.loading.set(true);
    this.surveysFacade
      .findById(this.surveyId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((survey) => this.survey.set(survey));

    this.loadShares();
  }

  protected addShare(): void {
    if (this.shareForm.invalid) {
      this.shareForm.markAllAsTouched();
      return;
    }

    this.addingShare.set(true);
    const { email, role, targetResponses } = this.shareForm.getRawValue();

    this.surveysFacade
      .addShare(this.surveyId, { email, role, targetResponses })
      .pipe(finalize(() => this.addingShare.set(false)))
      .subscribe({
        next: () => {
          this.notification.info('Usuario asignado exitosamente.');
          this.shareForm.patchValue({ email: '', targetResponses: null });
          this.loadShares();
        },
        error: (err) => {
          const message = err?.error?.message ?? 'No fue posible asignar el usuario.';
          this.notification.error(message);
        },
      });
  }

  protected removeShare(shareId: number): void {
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

  protected statusLabel(status: Survey['status']): string {
    if (status === 'DRAFT') return 'Borrador';
    if (status === 'DEPLOYED') return 'Implementado';
    return 'Archivado';
  }

  protected questionTypeLabel(type: QuestionType): string {
    if (type === 'MULTIPLE_CHOICE') return 'Selección múltiple';
    if (type === 'SINGLE_CHOICE') return 'Selección única';
    if (type === 'LIKERT') return 'Escala de Likert';
    if (type === 'TEXT') return 'Texto';
    return 'Número';
  }

  private loadShares(): void {
    this.loadingShares.set(true);
    this.surveysFacade
      .getShares(this.surveyId)
      .pipe(finalize(() => this.loadingShares.set(false)))
      .subscribe({
        next: (shares) => this.shares.set(shares),
        error: () => this.notification.error('No fue posible cargar las asignaciones.'),
      });
  }
}
