export interface Answer {
  questionId: string;
  value: string | number | string[];
}

export interface Response {
  id: string;
  surveyId: string;
  answers: Answer[];
  submittedAt: string;
  respondentMeta?: Record<string, unknown>;
}
