export interface ReportFilter {
  surveyId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ReportDataset {
  surveyId: string;
  totalResponses: number;
  byQuestion: Array<{
    questionId: string;
    questionLabel: string;
    answersCount: number;
  }>;
}
