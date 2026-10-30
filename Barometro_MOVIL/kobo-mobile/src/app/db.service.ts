import { Injectable } from '@angular/core';
import Dexie from 'dexie';
import { trimTrailingSlashes } from './utils/url';

export const ACCOUNT_SCOPE_KEY = 'kobo_account_scope';

export function accountScope(userId: number, servidor: string): string {
  const normalizedServer = trimTrailingSlashes(new URL(servidor).toString());
  return `${encodeURIComponent(normalizedServer)}:${userId}`;
}

function databaseName(): string {
  if (typeof localStorage === 'undefined') return 'KoboMobileDB:unassigned';
  const scope = localStorage.getItem('kobo_token') && localStorage.getItem(ACCOUNT_SCOPE_KEY);
  return scope ? `KoboMobileDB:${scope}` : 'KoboMobileDB:unassigned';
}

export interface BranchRule {
  option_index: number;
  action?: 'CONTINUE' | 'GO_TO' | 'END_FORM';
  next_question_id?: string | null;
}

export interface ProjectZoneInfo {
  id: string;
  name: string;
  description?: string;
  geofence_type: 'radius' | 'manzana_polygon' | 'custom_polygon';
  target_lat: number | null;
  target_lng: number | null;
  radius_meters: number;
  hierarchy_json?: any;
  geometry_json?: any;
  /** Meta de encuestas de la zona (null = sin meta). */
  target_responses?: number | null;
  /** Encuestas que el servidor ya recibió para la zona, al último dato descargado. */
  responses_count?: number;
}

export interface FormDefinition {
  id: string;
  title: string;
  description?: string;
  link_uuid: string;
  questions: FormQuestion[];
  downloadedAt: number;
  target_responses?: number;
  responses_count?: number;
  step_by_step?: boolean;
  require_consent?: boolean;
  consent_text?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  project_id?: string;
  project_name?: string;
  project_zones?: ProjectZoneInfo[];
}

export type QuestionType =
  | 'TEXT'
  | 'NUMBER'
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'LIKERT'
  | 'NOTE'
  | 'DATE'
  | 'TIME'
  | 'DATETIME'
  | 'GPS'
  | 'MULTIMEDIA'
  | 'SIGNATURE'
  | 'RANKING'
  | 'RATING'
  | 'BARCODE'
  | 'CALCULATE';

export interface FormQuestionProperties {
  help_text?: string;
  text_format?: 'email' | 'cedula_ec' | 'telefono_ec' | null;
  capture_accuracy?: boolean;
  allow_manual_fallback?: boolean;
  target_lat?: number | null;
  target_lng?: number | null;
  radius_meters?: number | null;
  zone_name?: string | null;
  geofencing?: {
    name?: string;
    lat?: number | null;
    lng?: number | null;
    radius?: number;
    [key: string]: any;
  } | null;
  allowed_media?: 'image' | 'audio' | 'video' | 'both' | 'all';
  max_file_size_mb?: number;
  [key: string]: any;
}

export interface FormQuestion {
  id: string;
  type: QuestionType;
  label: string;
  options?: string[];
  required: boolean;
  order: number;
  likert_rows?: string[];
  likert_columns?: string[];
  branch_rules?: BranchRule[];
  properties?: FormQuestionProperties;
  hint?: string;
  calculation_expression?: string;
  media_type?: 'IMAGE' | 'AUDIO' | 'VIDEO';
  section_name?: string | null;
  parent_question_id?: string | null;
}

export interface MediaBlob {
  id?: number;
  blobId: string;
  responseId?: number;
  questionId: string;
  blob: Blob;
  mimeType: string;
  fileName?: string;
  createdAt: string;
}

export interface SavedResponse {
  clientSubmissionId?: string;
  id?: number;
  formId: string;
  link_uuid: string;
  formTitle: string;
  answers: Record<string, any>;
  estado: 'borrador' | 'listo-para-enviar' | 'enviado';
  createdAt: string;
  duration: string;
}

export interface FormInfo {
  id: string;
  title: string;
  description?: string;
  link_uuid?: string;
  questionCount: number;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class DbService extends Dexie {
  forms!: Dexie.Table<FormDefinition, string>;
  responses!: Dexie.Table<SavedResponse, number>;
  formList!: Dexie.Table<FormInfo, string>;
  mediaBlobs!: Dexie.Table<MediaBlob, number>;

  constructor() {
    super(databaseName());
    this.version(4).stores({
      forms: 'id, title, link_uuid',
      responses: '++id, formId, estado, createdAt, [formId+estado]',
      formList: 'id, title',
      mediaBlobs: '++id, blobId, responseId, questionId'
    });
    this.version(5).stores({
      forms: 'id, title, link_uuid',
      responses: '++id, formId, estado, createdAt, [formId+estado]',
      formList: 'id, title',
      mediaBlobs: '++id, blobId, responseId, questionId',
      pendingFieldTracking: '++id, formId, kind, createdAt'
    });
    // La jornada en vivo se reemplazó por el trazado dentro de cada respuesta.
    this.version(6).stores({ pendingFieldTracking: null });
    this.responses.hook('creating', (_key, response) => {
      response.clientSubmissionId ??= crypto.randomUUID();
    });
  }
}
