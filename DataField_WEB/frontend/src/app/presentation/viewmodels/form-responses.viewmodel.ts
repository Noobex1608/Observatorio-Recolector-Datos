import { Injectable, computed, inject, signal } from '@angular/core';
import { Form, FormQuestion, FormService, FormShare } from '@core/services/form.service';
import { PdfExportService } from '@core/services/pdf-export.service';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GpsResultPoint, GpsResultZone } from '../../features/forms/responses/gps-results-map.component';

export interface FormResponseRow {
  id: string;
  submitted_at: string;
  answers: Record<string, string>;
  rawAnswers: Record<string, any>;
}

export interface QuestionChart {
  questionId: string;
  label: string;
  type: FormQuestion['type'];
  categories: string[];
  values: number[];
}

@Injectable()
export class FormResponsesViewModel {
  private formService = inject(FormService);
  private pdfExportService = inject(PdfExportService);
  private translate = inject(TranslateService);

  form = signal<Form | null>(null);
  formId = signal<string | null>(null);
  formTitle = signal('');
  questions = signal<FormQuestion[]>([]);
  responses = signal<FormResponseRow[]>([]);
  stats = signal<Record<string, Record<string, number>>>({});
  shares = signal<FormShare[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  isExporting = signal(false);
  responseTotal = signal(0);
  nextResponsePage = signal<number | null>(null);
  isLoadingMore = signal(false);

  totalResponses = computed(() => this.responseTotal());
  gpsPoints = computed<GpsResultPoint[]>(() => {
    const result: GpsResultPoint[] = [];
    for (const response of this.responses()) {
      for (const question of this.questions().filter((item) => item.type === 'GPS')) {
        const raw = response.rawAnswers[question.id];
        if (!raw || typeof raw !== 'object') continue;
        const latitude = Number(raw.latitude ?? raw.lat);
        const longitude = Number(raw.longitude ?? raw.lng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
        result.push({ responseId: response.id, question: question.label, latitude, longitude,
          accuracy: raw.accuracy != null && Number.isFinite(Number(raw.accuracy)) ? Number(raw.accuracy) : null });
      }
    }
    return result;
  });
  gpsZones = computed<GpsResultZone[]>(() => (this.form()?.project_zones ?? []) as GpsResultZone[]);
  numericSummaries = computed(() => this.questions().filter((question) => question.type === 'NUMBER').map((question) => {
    const values = this.responses().map((response) => response.rawAnswers[question.id])
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    const count = values.length;
    return { label: question.label, count, min: values[0] ?? null, max: values[count - 1] ?? null,
      mean: count ? values.reduce((sum, value) => sum + value, 0) / count : null,
      median: count ? (values[Math.floor((count - 1) / 2)] + values[Math.floor(count / 2)]) / 2 : null };
  }));
  textSummaries = computed(() => this.questions().filter((question) => question.type === 'TEXT').map((question) => ({
    label: question.label,
    answered: this.responses().filter((response) => String(response.rawAnswers[question.id] ?? '').trim() !== '').length,
  })));

  shareProgress = computed(() =>
    this.shares().map((s) => ({
      ...s,
      progress: s.target_responses ? Math.min(100, Math.round(((s.responses_count ?? 0) / s.target_responses) * 100)) : null,
    })),
  );

  chartableQuestions = computed<QuestionChart[]>(() => {
    const statsData = this.stats();
    const questionList = this.questions();

    return questionList
      .filter((q) => ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'LIKERT'].includes(q.type))
      .map((q) => {
        const counts = statsData[q.id] ?? {};
        const configuredCategories = this.getChartCategories(q);
        const categories = configuredCategories.length > 0 ? configuredCategories : Object.keys(counts);
        return {
          questionId: q.id,
          label: q.label,
          type: q.type,
          categories,
          values: categories.map((c) => counts[c] ?? 0),
        };
      })
      .filter((c) => c.categories.length > 0);
  });

  tableColumns = computed(() => {
    const cols = this.questions().map((q) => ({
      key: q.id,
      label: q.label,
    }));
    return [{ key: '_submitted', label: this.translate.instant('forms.responses.submitted') }, ...cols];
  });

  getQuestionById(id: string): FormQuestion | undefined {
    return this.questions().find((q) => q.id === id);
  }

  async load(formId: string): Promise<void> {
    this.formId.set(formId);
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const [form, responseData, statsData, sharesData] = await Promise.all([
        firstValueFrom(this.formService.getForm(formId)),
        firstValueFrom(this.formService.getResponses(formId)),
        firstValueFrom(this.formService.getStats(formId)),
        firstValueFrom(this.formService.getShares(formId)),
      ]);

      this.form.set(form);
      this.formTitle.set(form.title);
      this.questions.set(responseData.questions ?? form.questions ?? []);
      this.stats.set(statsData);
      this.shares.set(sharesData);

      const rows: FormResponseRow[] = (responseData.responses ?? []).map((r: any) => ({
        id: r.id,
        submitted_at: r.created_at,
        answers: this.flattenAnswers(r.data ?? {}, this.questions()),
        rawAnswers: r.data ?? {},
      }));

      this.responses.set(rows);
      this.responseTotal.set(responseData.pagination?.total ?? rows.length);
      this.nextResponsePage.set(responseData.pagination && responseData.pagination.current_page < responseData.pagination.last_page
        ? responseData.pagination.current_page + 1 : null);
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.responses.errors.load'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadMoreResponses(): Promise<void> {
    const formId = this.formId();
    const page = this.nextResponsePage();
    if (!formId || !page || this.isLoadingMore()) return;
    this.isLoadingMore.set(true);
    try {
      const data = await firstValueFrom(this.formService.getResponses(formId, page));
      const rows: FormResponseRow[] = (data.responses ?? []).map((r: any) => ({
        id: r.id,
        submitted_at: r.created_at,
        answers: this.flattenAnswers(r.data ?? {}, this.questions()),
        rawAnswers: r.data ?? {},
      }));
      this.responses.update((existing) => [...existing, ...rows]);
      this.nextResponsePage.set(data.pagination && data.pagination.current_page < data.pagination.last_page
        ? data.pagination.current_page + 1 : null);
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || 'No se pudo cargar la siguiente página de respuestas.');
    } finally {
      this.isLoadingMore.set(false);
    }
  }

  async exportPdfSummary(): Promise<void> {
    const formId = this.formId();
    this.isExporting.set(true);
    try {
      await this.pdfExportService.exportResponsesSummaryPdf({
        form: this.form(),
        formTitle: this.formTitle(),
        questions: this.questions(),
        responses: this.responses(),
        stats: this.stats(),
        shares: this.shares(),
      });

      if (formId) {
        this.formService.logExport(formId, 'pdf').subscribe({ error: () => {} });
      }
    } catch (error: any) {
      console.error('Error al generar PDF de resumen:', error);
      this.errorMessage.set(error?.message || 'Error al generar el reporte en PDF');
    } finally {
      this.isExporting.set(false);
    }
  }

  async exportData(format: 'csv' | 'xlsx'): Promise<void> {
    const formId = this.formId();
    if (!formId) return;

    this.isExporting.set(true);
    try {
      const blob = await firstValueFrom(this.formService.exportResponses(formId, format));
      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.formTitle() || this.translate.instant('forms.responses.filePrefix')}_${this.translate.instant('forms.responses.fileSuffix')}.${ext}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.responses.errors.export'));
    } finally {
      this.isExporting.set(false);
    }
  }

  getCollectUrl(linkUuid?: string): string {
    if (!linkUuid) return '';
    return `${window.location.origin}/collect/${linkUuid}`;
  }

  private flattenAnswers(
    data: Record<string, unknown>,
    questions: FormQuestion[],
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const q of questions) {
      const value = data[q.id];
      if (value === undefined || value === null) {
        result[q.id] = '';
      } else if (Array.isArray(value)) {
        result[q.id] = value.join(', ');
      } else if (typeof value === 'object') {
        result[q.id] = Object.entries(value as Record<string, unknown>)
          .map(([row, answer]) => `${row}: ${String(answer ?? '')}`)
          .join(' | ');
      } else {
        result[q.id] = String(value);
      }
    }

    return result;
  }

  private getChartCategories(question: FormQuestion): string[] {
    if (!question.options) return [];

    if (question.type === 'LIKERT' && !Array.isArray(question.options) && Array.isArray(question.options.columns)) {
      return question.options.columns.map((option) => String(option)).filter(Boolean);
    }

    if (Array.isArray(question.options)) {
      return question.options.map((option) => String(option)).filter(Boolean);
    }

    return [];
  }
}

