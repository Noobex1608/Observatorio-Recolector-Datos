import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Survey, SurveyStatus } from '../../models/survey.model';
import { SurveysFacade } from '../../services/surveys.facade';

@Component({
  selector: 'app-surveys-list-page',
  imports: [RouterLink],
  templateUrl: './surveys-list-page.component.html',
  styleUrl: './surveys-list-page.component.css',
})
export class SurveysListPageComponent {
  private readonly surveysFacade = inject(SurveysFacade);

  protected readonly surveys = signal<Survey[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.loadSurveys();
  }

  protected duplicate(id: string): void {
    this.surveysFacade.duplicate(id).subscribe({
      next: () => this.loadSurveys(),
      error: () => this.error.set('No fue posible duplicar el formulario.'),
    });
  }

  protected changeStatus(id: string, status: SurveyStatus): void {
    this.surveysFacade.changeStatus(id, status).subscribe({
      next: () => this.loadSurveys(),
      error: () => this.error.set('No fue posible actualizar el estado del formulario.'),
    });
  }

  protected delete(id: string, title: string): void {
    const confirmed = globalThis.confirm(
      `¿Seguro que deseas eliminar el formulario "${title}"? Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    this.surveysFacade.delete(id).subscribe({
      next: () => this.loadSurveys(),
      error: () => this.error.set('No fue posible eliminar el formulario.'),
    });
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

  private loadSurveys(): void {
    this.loading.set(true);
    this.error.set('');

    this.surveysFacade.list().subscribe({
      next: (surveys) => {
        this.surveys.set(surveys);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar los formularios.');
        this.loading.set(false);
      },
    });
  }
}
