import { Question } from './question.model';

export type SurveyStatus = 'DRAFT' | 'DEPLOYED' | 'ARCHIVED';

export interface FormShare {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  userRol: string;
  role: 'EDITOR' | 'RECOLECTOR';
  targetResponses: number | null;
  responsesCount: number;
}

export interface Survey {
  id: string;
  title: string;
  description?: string;
  status: SurveyStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  questions: Question[];
  linkUuid?: string;
  projectId?: string;
  projectName?: string;
  responsesCount?: number;
  shares?: FormShare[];
}
