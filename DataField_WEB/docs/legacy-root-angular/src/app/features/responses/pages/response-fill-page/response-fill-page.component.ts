import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ResponseValidationService } from '../../services/response-validation.service';
import { ResponsesFacade } from '../../services/responses.facade';
import { Survey, SurveyStatus } from '../../../surveys/models/survey.model';
import { Question } from '../../../surveys/models/question.model';
import { SurveysFacade } from '../../../surveys/services/surveys.facade';

@Component({
  selector: 'app-response-fill-page',
  imports: [ReactiveFormsModule],
  templateUrl: './response-fill-page.component.html',
  styleUrl: './response-fill-page.component.css',
})
export class ResponseFillPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly surveysFacade = inject(SurveysFacade);
  private readonly responsesFacade = inject(ResponsesFacade);
  private readonly validationService = inject(ResponseValidationService);

  protected readonly surveyId = this.route.snapshot.paramMap.get('surveyId') ?? 'sin-id';
  protected readonly survey = signal<Survey | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = new FormGroup({});

  protected readonly canSubmit = computed(
    () => !!this.survey() && this.form.valid && !this.submitting() && !this.submitted(),
  );

  constructor() {
    this.loadSurvey();
  }

  protected toggleMultiple(questionId: string, optionValue: string, checked: boolean): void {
    const control = this.form.get(questionId) as FormControl<string[]> | null;
    if (!control) {
      return;
    }

    const current = control.value ?? [];
    const next = checked ? [...current, optionValue] : current.filter((value) => value !== optionValue);
    control.setValue(next);
    control.markAsTouched();
  }

  protected isMultipleChecked(questionId: string, optionValue: string): boolean {
    const control = this.form.get(questionId) as FormControl<string[]> | null;
    return !!control?.value?.includes(optionValue);
  }

  protected setLikertValue(questionId: string, point: number): void {
    const control = this.form.get(questionId) as FormControl<number | null> | null;
    if (!control) {
      return;
    }

    control.setValue(point);
    control.markAsTouched();
  }

  protected isLikertSelected(questionId: string, point: number): boolean {
    const control = this.form.get(questionId) as FormControl<number | null> | null;
    return control?.value === point;
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (!this.canSubmit()) {
      return;
    }

    const survey = this.survey();
    if (!survey) {
      return;
    }

    const answers = survey.questions.map((question) => {
      const value = this.form.get(question.id)?.value;
      const normalizedValue =
        question.type === 'LIKERT' && value !== null && value !== undefined
          ? Number(value)
          : value;

      return {
        questionId: question.id,
        value: normalizedValue,
      };
    });

    this.submitting.set(true);
    this.responsesFacade
      .submit(survey.id, answers)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.submitted.set(true);
          this.error.set(null);
          void this.router.navigate(['/responses/success']);
        },
        error: () => this.error.set('No se pudo enviar la respuesta. Intenta nuevamente.'),
      });
  }

  protected likertRange(question: Question): number[] {
    if (question.type !== 'LIKERT') {
      return [];
    }

    return Array.from({ length: question.scaleMax - question.scaleMin + 1 }, (_, index) =>
      index + question.scaleMin,
    );
  }

  protected likertEndpointLabel(question: Question, point: number): string {
    if (question.type !== 'LIKERT') {
      return '';
    }

    return question.labels?.[point] ?? '';
  }

  protected getError(questionId: string): string {
    const control = this.form.get(questionId);
    if (!control || !control.touched || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return 'Campo obligatorio';
    }

    if (control.errors['minlength']) {
      return `Minimo ${control.errors['minlength'].requiredLength} caracteres`;
    }

    if (control.errors['maxlength']) {
      return `Maximo ${control.errors['maxlength'].requiredLength} caracteres`;
    }

    if (control.errors['min']) {
      return `El valor minimo permitido es ${control.errors['min'].min}`;
    }

    if (control.errors['max']) {
      return `El valor maximo permitido es ${control.errors['max'].max}`;
    }

    return 'Valor invalido';
  }

  protected isPublished(status: SurveyStatus): boolean {
    return status === 'DEPLOYED';
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

  private loadSurvey(): void {
    this.loading.set(true);
    this.surveysFacade
      .findById(this.surveyId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((survey) => {
        if (!survey) {
          this.error.set('Formulario no encontrado.');
          return;
        }

        this.survey.set(survey);
        this.configureForm(survey.questions);
      });
  }

  private configureForm(questions: Question[]): void {
    for (const question of questions) {
      const initialValue = question.type === 'MULTIPLE_CHOICE' ? [] : null;
      this.form.addControl(
        question.id,
        new FormControl(initialValue, {
          validators: this.validationService.buildValidators(question),
          nonNullable: false,
        }),
      );
    }
  }
}
