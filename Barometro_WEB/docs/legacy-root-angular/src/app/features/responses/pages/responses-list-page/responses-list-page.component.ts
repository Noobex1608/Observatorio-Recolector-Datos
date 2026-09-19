import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Response } from '../../models/response.model';
import { ResponsesFacade } from '../../services/responses.facade';
import { SurveysFacade } from '../../../surveys/services/surveys.facade';
import { Survey } from '../../../surveys/models/survey.model';

@Component({
  selector: 'app-responses-list-page',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './responses-list-page.component.html',
  styleUrl: './responses-list-page.component.css',
})
export class ResponsesListPageComponent {
  private readonly responsesFacade = inject(ResponsesFacade);
  private readonly surveysFacade = inject(SurveysFacade);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly responses = signal<Response[]>([]);
  protected readonly surveys = signal<Survey[]>([]);

  protected readonly filterForm = this.formBuilder.nonNullable.group({
    surveyId: [''],
    search: [''],
  });

  protected readonly filteredResponses = computed(() => {
    const { surveyId, search } = this.filterForm.getRawValue();
    const query = search.trim().toLowerCase();

    return this.responses().filter((response) => {
      const matchesSurvey = !surveyId || response.surveyId === surveyId;
      const matchesSearch =
        !query ||
        response.answers.some((answer) => String(answer.value).toLowerCase().includes(query)) ||
        response.id.toLowerCase().includes(query);

      return matchesSurvey && matchesSearch;
    });
  });

  constructor() {
    this.loadData();
  }

  protected applyFilters(): void {
    this.filterForm.patchValue(this.filterForm.getRawValue());
  }

  protected clearFilters(): void {
    this.filterForm.setValue({ surveyId: '', search: '' });
  }

  protected surveyTitle(surveyId: string): string {
    return this.surveys().find((survey) => survey.id === surveyId)?.title ?? surveyId;
  }

  protected answersPreview(response: Response): string {
    return response.answers
      .map((answer) => (Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value)))
      .join(' | ');
  }

  private loadData(): void {
    this.responsesFacade.listAll().subscribe((responses) => this.responses.set(responses));
    this.surveysFacade.list().subscribe((surveys) => this.surveys.set(surveys));
  }
}
