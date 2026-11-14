import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  user_name: string;
  user_email: string;
  user_role: string;
  action: string;
  module: 'descargas' | 'permisos' | 'formularios' | 'usuarios' | 'proyectos' | string;
  description_es: string;
  ip_address: string;
  user_agent: string;
  metadata: any;
  created_at: string;
}

export interface AuditLogsResponse {
  data: AuditLogItem[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface AuditStats {
  summary: {
    total_logs: number;
    total_downloads: number;
    total_responses_exported: number;
    total_client_reported_exports: number;
    total_legacy_exports: number;
    total_permission_changes: number;
    total_data_modifications: number;
  };
  by_module: Record<string, number>;
  by_format: Record<string, number>;
  top_users: Array<{
    user_name: string;
    user_email: string;
    user_role: string;
    actions_count: number;
  }>;
  recent_activity: Array<{
    date: string;
    total: number;
    descargas: number;
    permisos: number;
    modificaciones: number;
  }>;
}

export interface PermissionsSummary {
  users: Array<{
    id: number;
    name: string;
    email: string;
    rol: string;
    rol_label: string;
    is_active: boolean;
  }>;
  shares: Array<{
    id: number;
    form_id: string;
    form_title: string;
    user_id: number;
    user_name: string;
    user_email: string;
    granted_role: string;
    granted_role_label: string;
    target_responses: number | null;
  }>;
  projects: Array<{
    id: string;
    name: string;
    description: string;
    leaders: Array<{ id: number; name: string; email: string }>;
    forms_count: number;
  }>;
}

@Injectable({
  providedIn: 'root',
})
export class AuditLogService {
  private readonly apiService = inject(ApiService);

  getLogs(filters?: {
    module?: string;
    action?: string;
    user_id?: number;
    search?: string;
    page?: number;
    per_page?: number;
    date_from?: string;
    date_to?: string;
  }): Observable<AuditLogsResponse> {
    return this.apiService.get<AuditLogsResponse>('/audit-logs', filters);
  }

  getStats(): Observable<AuditStats> {
    return this.apiService.get<AuditStats>('/audit-logs/stats');
  }

  getPermissionsSummary(): Observable<PermissionsSummary> {
    return this.apiService.get<PermissionsSummary>('/audit-logs/permissions');
  }
}
