import { Injectable, computed, inject, signal } from '@angular/core';
import { FormQuestion, FormService, FormShare } from '@core/services/form.service';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface FormResponseRow {
  id: string;
  submitted_at: string;
  answers: Record<string, string>;
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
  private translate = inject(TranslateService);

  formId = signal<string | null>(null);
  formTitle = signal('');
  questions = signal<FormQuestion[]>([]);
  responses = signal<FormResponseRow[]>([]);
  stats = signal<Record<string, Record<string, number>>>({});
  shares = signal<FormShare[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  isExporting = signal(false);

  totalResponses = computed(() => this.responses().length);

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

      this.formTitle.set(form.title);
      this.questions.set(responseData.questions ?? form.questions ?? []);
      this.stats.set(statsData);
      this.shares.set(sharesData);

      const rows: FormResponseRow[] = (responseData.responses ?? []).map((r: any) => ({
        id: r.id,
        submitted_at: r.created_at,
        answers: this.flattenAnswers(r.data ?? {}, this.questions()),
      }));

      this.responses.set(rows);
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.responses.errors.load'));
    } finally {
      this.isLoading.set(false);
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
    return `${environment.apiUrl}/forms/fetch/${linkUuid}`;
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

