import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QuestionType } from '../../models/question.model';
import { Survey } from '../../models/survey.model';
import { SurveysFacade } from '../../services/surveys.facade';

@Component({
  selector: 'app-survey-preview-page',
  template: `
    <section>
      @if (survey(); as surveyData) {
        <h2>{{ surveyData.title }}</h2>
        <p>{{ surveyData.description }}</p>
        <ol>
          @for (question of surveyData.questions; track question.id) {
            <li>{{ question.label }} ({{ questionTypeLabel(question.type) }})</li>
          }
        </ol>
      } @else {
        <p>Formulario no encontrado.</p>
      }
    </section>
  `,
})
export class SurveyPreviewPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly surveysFacade = inject(SurveysFacade);

  protected readonly survey = signal<Survey | null>(null);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      return;
    }

    this.surveysFacade.findById(id).subscribe((data) => this.survey.set(data));
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
}
