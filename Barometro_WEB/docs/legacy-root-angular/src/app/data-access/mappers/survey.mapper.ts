import { Survey } from '../../features/surveys/models/survey.model';
import { Question } from '../../features/surveys/models/question.model';
import { FormShare } from '../../features/surveys/models/survey.model';

interface BackendQuestion {
  id: string;
  type: string;
  label: string;
  required: boolean;
  order: number;
  help_text?: string;
  options?: unknown;
  likert_rows?: string[];
  likert_columns?: string[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  min_length?: number;
  max_length?: number;
  allow_other?: boolean;
  scale_min?: number;
  scale_max?: number;
  labels?: Record<number, string>;
}

interface BackendForm {
  id: string;
  title: string;
  description?: string;
  state: string;
  user_id: number;
  project_id?: string;
  link_uuid?: string;
  created_at: string;
  updated_at: string;
  owner?: { id: number; name: string; email: string; rol: string };
  project?: { id: string; name: string };
  questions?: BackendQuestion[];
  responses_count?: number;
  shares?: unknown[];
  access_role?: string;
  version?: number;
}

interface BackendShare {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  user_rol: string;
  role: string;
  target_responses: number | null;
  responses_count: number;
}

export function mapDtoToSurvey(dto: unknown): Survey {
  const d = dto as BackendForm;
  const statusMap: Record<string, Survey['status']> = {
    DRAFT: 'DRAFT',
    DEPLOYED: 'DEPLOYED',
    ARCHIVED: 'ARCHIVED',
    IMPLEMENTED: 'DEPLOYED',
  };

  return {
    id: d.id,
    title: d.title,
    description: d.description,
    status: statusMap[d.state] ?? 'DRAFT',
    version: d.version ?? 1,
    createdBy: d.owner?.name ?? '',
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    questions: (d.questions ?? []).map(mapDtoToQuestion),
    linkUuid: d.link_uuid,
    projectId: d.project_id,
    projectName: d.project?.name,
    responsesCount: d.responses_count,
    shares: d.shares ? mapDtoToShares(d.shares) : undefined,
  };
}

export function mapSurveyToDto(survey: Survey): Record<string, unknown> {
  const statusMap: Record<string, string> = {
    DRAFT: 'DRAFT',
    DEPLOYED: 'DEPLOYED',
    ARCHIVED: 'ARCHIVED',
  };

  return {
    title: survey.title,
    description: survey.description,
    state: statusMap[survey.status] ?? 'DRAFT',
    project_id: survey.projectId,
  };
}

export function mapDtoToShares(shares: unknown[]): FormShare[] {
  return (shares as BackendShare[]).map((s) => ({
    id: s.id,
    userId: s.user_id,
    userName: s.user_name,
    userEmail: s.user_email,
    userRol: s.user_rol,
    role: s.role as FormShare['role'],
    targetResponses: s.target_responses,
    responsesCount: s.responses_count,
  }));
}

function mapDtoToQuestion(dto: BackendQuestion): Question {
  const base = {
    id: dto.id,
    label: dto.label,
    required: dto.required,
    order: dto.order,
    helpText: dto.help_text,
  };

  switch (dto.type) {
    case 'MULTIPLE_CHOICE':
    case 'SINGLE_CHOICE': {
      const rawOptions = Array.isArray(dto.options)
        ? dto.options
        : [];
      const options = rawOptions
        .filter((o): o is string => typeof o === 'string' && o !== '')
        .map((o) => ({ id: o, label: o, value: o }));
      return { ...base, type: dto.type, options, allowOther: dto.allow_other };
    }
    case 'LIKERT':
      return {
        ...base,
        type: 'LIKERT',
        scaleMin: dto.scale_min ?? 0,
        scaleMax: dto.scale_max ?? (dto.likert_columns?.length ?? 5) - 1,
        labels: dto.labels,
        likertRows: dto.likert_rows,
        likertColumns: dto.likert_columns,
      };
    case 'TEXT':
      return {
        ...base,
        type: 'TEXT',
        minLength: dto.min_length,
        maxLength: dto.max_length,
        placeholder: dto.placeholder,
      };
    case 'NUMBER':
      return { ...base, type: 'NUMBER', min: dto.min, max: dto.max, step: dto.step };
    default:
      return { ...base, type: 'TEXT' };
  }
}
