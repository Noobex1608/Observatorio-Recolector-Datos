import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { Response } from '../../responses/models/response.model';
import { ReportDataset } from '../models/report.model';
import { Question, QuestionType } from '../../surveys/models/question.model';
import { Survey } from '../../surveys/models/survey.model';

@Injectable({ providedIn: 'root' })
export class ExportService {
  exportResponsesToXlsx(
    responses: Response[],
    surveys: Survey[],
    fileName = 'respuestas.xlsx',
  ): void {
    const normalized = responses.map((response, index) => this.buildWideRow(response, index + 1, surveys));

    this.exportJson(normalized, fileName, 'Respuestas');
  }

  exportReportToXlsx(dataset: ReportDataset[], fileName = 'reporte_barometro.xlsx'): void {
    const rows = dataset.flatMap((entry) =>
      entry.byQuestion.map((question) => ({
        surveyId: entry.surveyId,
        totalResponses: entry.totalResponses,
        questionId: question.questionId,
        questionLabel: question.questionLabel,
        answersCount: question.answersCount,
      })),
    );

    this.exportJson(rows, fileName, 'Reporte');
  }

  private exportJson(rows: Record<string, unknown>[], fileName: string, sheetName: string): void {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  }

  private buildWideRow(response: Response, index: number, surveys: Survey[]): Record<string, unknown> {
    const survey = surveys.find((item) => item.id === response.surveyId);
    const row: Record<string, unknown> = {
      start: response.submittedAt,
      end: response.submittedAt,
    };

    if (!survey) {
      row['_id'] = index;
      row['_uuid'] = response.id;
      row['_submission_time'] = response.submittedAt;
      row['_status'] = 'submitted_via_web';
      row['_index'] = index;
      return row;
    }

    const answersByQuestionId = new Map(response.answers.map((answer) => [answer.questionId, answer.value]));

    for (const question of survey.questions) {
      const value = answersByQuestionId.get(question.id);
      row[question.label] = this.toMainCellValue(value, question.type);

      if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
        const selected = this.toSelectedOptions(value, question.type);
        for (const option of question.options) {
          row[`${question.label}/${option.label}`] = selected.has(option.value) ? 1 : 0;
        }
      }
    }

    row['_id'] = index;
    row['_uuid'] = response.id;
    row['_submission_time'] = response.submittedAt;
    row['_validation_status'] = '';
    row['_notes'] = '';
    row['_status'] = 'submitted_via_web';
    row['_submitted_by'] = '';
    row['__version__'] = '';
    row['_tags'] = '';
    row['_index'] = index;

    return row;
  }

  private toMainCellValue(value: unknown, type: QuestionType): string | number {
    if (value === null || value === undefined) {
      return '';
    }

    if (type === 'MULTIPLE_CHOICE' && Array.isArray(value)) {
      return value.join(' ');
    }

    if (Array.isArray(value)) {
      return value.join(' ');
    }

    return typeof value === 'number' ? value : String(value);
  }

  private toSelectedOptions(value: unknown, type: QuestionType): Set<string> {
    if (type === 'MULTIPLE_CHOICE') {
      return new Set(Array.isArray(value) ? value.map((item) => String(item)) : []);
    }

    if (type === 'SINGLE_CHOICE') {
      return value ? new Set([String(value)]) : new Set<string>();
    }

    return new Set<string>();
  }
}
