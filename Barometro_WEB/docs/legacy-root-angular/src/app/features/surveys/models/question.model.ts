export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'SINGLE_CHOICE'
  | 'LIKERT'
  | 'TEXT'
  | 'NUMBER';

export interface QuestionBase {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  order: number;
  helpText?: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  value: string;
}

export interface ChoiceQuestion extends QuestionBase {
  type: 'MULTIPLE_CHOICE' | 'SINGLE_CHOICE';
  options: ChoiceOption[];
  allowOther?: boolean;
}

export interface LikertQuestion extends QuestionBase {
  type: 'LIKERT';
  scaleMin: number;
  scaleMax: number;
  labels?: Record<number, string>;
  likertRows?: string[];
  likertColumns?: string[];
}

export interface TextQuestion extends QuestionBase {
  type: 'TEXT';
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}

export interface NumberQuestion extends QuestionBase {
  type: 'NUMBER';
  min?: number;
  max?: number;
  step?: number;
}

export type Question = ChoiceQuestion | LikertQuestion | TextQuestion | NumberQuestion;
