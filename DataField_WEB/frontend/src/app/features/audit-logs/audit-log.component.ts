import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { AuditLogItem, AuditLogService, AuditStats, PermissionsSummary } from '@core/services/audit-log.service';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatChipsModule,
    MatTabsModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
  ],
  template: `
    <div class="audit-container">
      <!-- Top Title Header -->
      <div class="page-header">
        <div class="header-left">
          <div class="header-icon-badge">
            <mat-icon class="primary-icon">shield</mat-icon>
          </div>
          <div>
            <div class="header-title-row">
              <h1 class="page-title">Auditoría & Control de Datos</h1>
              <span class="super-badge">
                <mat-icon>lock</mat-icon> Exclusivo SuperAdministrador
              </span>
            </div>
            <p class="page-subtitle">
              Supervisión en lenguaje natural de quién modifica datos, descargas de información y control de permisos en la plataforma.
            </p>
          </div>
        </div>
        <div class="header-actions">
          <button mat-flat-button color="primary" class="refresh-btn" (click)="loadAllData()">
            <mat-icon>refresh</mat-icon>
            <span>Actualizar Registros</span>
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="kpi-grid" *ngIf="stats() as s">
        <div class="kpi-card download-kpi">
          <div class="kpi-icon-wrapper">
            <mat-icon>file_download</mat-icon>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Archivos generados por el servidor</span>
            <div class="kpi-value-row">
              <span class="kpi-number">{{ s.summary.total_downloads }}</span>
              <span class="kpi-unit">archivos</span>
            </div>
            <span class="kpi-detail">
              Respuestas incluidas: <strong>{{ s.summary.total_responses_exported }}</strong>.
              PDF declarados por el cliente: {{ s.summary.total_client_reported_exports }}.
              Registros históricos sin verificación: {{ s.summary.total_legacy_exports }}.
            </span>
          </div>
        </div>

        <div class="kpi-card permission-kpi">
          <div class="kpi-icon-wrapper">
            <mat-icon>verified_user</mat-icon>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Control de Permisos</span>
            <div class="kpi-value-row">
              <span class="kpi-number">{{ s.summary.total_permission_changes }}</span>
              <span class="kpi-unit">asignaciones</span>
            </div>
            <span class="kpi-detail">
              Asignación/revocación de roles y cuotas de formulario
            </span>
          </div>
        </div>

        <div class="kpi-card modification-kpi">
          <div class="kpi-icon-wrapper">
            <mat-icon>edit_note</mat-icon>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Tratamiento de Datos</span>
            <div class="kpi-value-row">
              <span class="kpi-number">{{ s.summary.total_data_modifications }}</span>
              <span class="kpi-unit">cambios</span>
            </div>
            <span class="kpi-detail">
              Modificaciones a formularios, usuarios y proyectos
            </span>
          </div>
        </div>

        <div class="kpi-card total-kpi">
          <div class="kpi-icon-wrapper">
            <mat-icon>history</mat-icon>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Actividad Total</span>
            <div class="kpi-value-row">
              <span class="kpi-number">{{ s.summary.total_logs }}</span>
              <span class="kpi-unit">eventos</span>
            </div>
            <span class="kpi-detail">
              Registros auditados en lenguaje natural
            </span>
          </div>
        </div>
      </div>

      <!-- Main Content Tabs -->
      <mat-card class="main-card">
        <mat-tab-group (selectedTabChange)="onTabChange($event.index)" class="custom-tabs">
          
          <!-- TAB 1: LOGS EN LENGUAJE NATURAL -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">record_voice_over</mat-icon>
              <span>Historial en Lenguaje Natural</span>
            </ng-template>

            <div class="tab-body">
              <!-- Filters Bar -->
              <div class="filters-row">
                <div class="search-field">
                  <mat-icon class="search-icon">search</mat-icon>
                  <input
                    type="text"
                    aria-label="Buscar en el registro"
                    placeholder="Buscar en el registro en lenguaje natural (ej. Juan, descargó, permiso)..."
                    [(ngModel)]="searchQuery"
                    (keyup.enter)="onSearch()"
                  />
                  <button *ngIf="searchQuery" class="clear-btn" type="button" aria-label="Limpiar búsqueda" (click)="clearSearch()">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>

                <div class="select-field">
                  <mat-select [(ngModel)]="selectedModule" (selectionChange)="onFilterChange()" placeholder="Filtrar por Módulo">
                    <mat-option value="">Todos los módulos</mat-option>
                    <mat-option value="descargas">📥 Descargas / Exportaciones</mat-option>
                    <mat-option value="permisos">🔑 Permisos & Accesos</mat-option>
                    <mat-option value="formularios">📝 Formularios & Encuestas</mat-option>
                    <mat-option value="usuarios">👥 Gestión de Usuarios</mat-option>
                    <mat-option value="proyectos">📁 Proyectos</mat-option>
                  </mat-select>
                </div>
              </div>

              <!-- Loading state -->
              <div *ngIf="loading()" class="loading-container">
                <mat-spinner diameter="40"></mat-spinner>
                <p>Cargando registros de auditoría...</p>
              </div>

              <!-- Log Stream / Activity Feed in Natural Language -->
              <div *ngIf="!loading() && logs().length > 0" class="log-stream">
                <div *ngFor="let item of logs()" class="log-item-card" [ngClass]="item.module">
                  <div class="log-icon-col">
                    <div class="action-icon-circle" [ngClass]="item.module">
                      <mat-icon>{{ getActionIcon(item.action, item.module) }}</mat-icon>
                    </div>
                  </div>

                  <div class="log-content-col">
                    <div class="log-header-meta">
                      <span class="module-chip" [ngClass]="item.module">{{ getModuleLabel(item.module) }}</span>
                      <span class="user-chip">
                        <mat-icon class="mini-icon">person</mat-icon> {{ item.user_name }} ({{ item.user_role }})
                      </span>
                      <span class="time-stamp">
                        <mat-icon class="mini-icon">schedule</mat-icon> {{ item.created_at | date: 'medium' }}
                      </span>
                    </div>

                    <!-- Natural Language Sentence -->
                    <div class="log-natural-text">
                      {{ item.description_es }}
                    </div>

                    <!-- Additional Details Footer -->
                    <div class="log-footer-meta">
                      <span class="ip-info">
                        <mat-icon class="mini-icon">router</mat-icon> IP: {{ item.ip_address }}
                      </span>
                      <span *ngIf="item.metadata?.format" class="format-tag">
                        Formato: <strong>{{ item.metadata.format }}</strong>
                      </span>
                      <span *ngIf="item.metadata?.responses_count" class="count-tag">
                        Respuestas: <strong>{{ item.metadata.responses_count }}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Empty state -->
              <div *ngIf="!loading() && logs().length === 0" class="empty-state">
                <mat-icon class="empty-icon">search_off</mat-icon>
                <h3>No se encontraron registros de auditoría</h3>
                <p>Intenta ajustar el filtro de búsqueda o el módulo seleccionado.</p>
              </div>

              <!-- Paginator -->
              <mat-paginator
                [length]="totalLogs()"
                [pageSize]="pageSize"
                [pageSizeOptions]="[10, 20, 50, 100]"
                (page)="onPageChange($event)"
                class="custom-paginator"
              ></mat-paginator>
            </div>
          </mat-tab>

          <!-- TAB 2: MATRIZ DE PERMISOS (¿Quién tiene permiso a qué?) -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">security</mat-icon>
              <span>Matriz de Permisos y Accesos</span>
            </ng-template>

            <div class="tab-body" *ngIf="permissions() as p">
              <div class="section-intro-box">
                <mat-icon>info</mat-icon>
                <div>
                  <strong>Control Centralizado de Permisos</strong>
                  <p>Revisa qué usuarios tienen acceso a qué formularios y proyectos, qué rol desempeñan y cuántas respuestas tienen asignadas recolectar.</p>
                </div>
              </div>

              <!-- Sub-section: Form Permissions Shares -->
              <div class="permission-section">
                <h3 class="section-heading">
                  <mat-icon>assignment_ind</mat-icon> Permisos Asignados por Formulario
                </h3>

                <table mat-table [dataSource]="p.shares" class="mat-elevation-z1 permission-table">
                  <ng-container matColumnDef="form">
                    <th mat-header-cell *matHeaderCellDef>Formulario</th>
                    <td mat-cell *matCellDef="let element">
                      <strong class="text-primary">{{ element.form_title }}</strong>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="user">
                    <th mat-header-cell *matHeaderCellDef>Usuario Asignado</th>
                    <td mat-cell *matCellDef="let element">
                      <div>
                        <strong>{{ element.user_name }}</strong>
                        <div class="user-subtext">{{ element.user_email }}</div>
                      </div>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="role">
                    <th mat-header-cell *matHeaderCellDef>Permiso Concedido</th>
                    <td mat-cell *matCellDef="let element">
                      <span class="role-badge" [ngClass]="element.granted_role">
                        {{ element.granted_role_label }}
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="target">
                    <th mat-header-cell *matHeaderCellDef>Meta de Respuestas</th>
                    <td mat-cell *matCellDef="let element">
                      <span *ngIf="element.target_responses !== null" class="target-badge">
                        🎯 {{ element.target_responses }} máximo
                      </span>
                      <span *ngIf="element.target_responses === null" class="text-muted">
                        Sin límite
                      </span>
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="['form', 'user', 'role', 'target']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['form', 'user', 'role', 'target'];"></tr>
                </table>

                <div *ngIf="p.shares.length === 0" class="mini-empty">
                  No hay permisos asignados explícitamente en ningún formulario aún.
                </div>
              </div>

              <!-- Sub-section: Project Leaders -->
              <div class="permission-section">
                <h3 class="section-heading">
                  <mat-icon>folder_special</mat-icon> Líderes de Proyecto y Formularios
                </h3>

                <div class="projects-grid">
                  <div *ngFor="let proj of p.projects" class="project-perm-card">
                    <div class="proj-header">
                      <mat-icon class="folder-icon">folder</mat-icon>
                      <span class="proj-name">{{ proj.name }}</span>
                      <span class="forms-count-chip">{{ proj.forms_count }} formularios</span>
                    </div>
                    <div class="proj-leaders-list">
                      <span class="leaders-title">Líderes de Proyecto con permiso total:</span>
                      <div *ngFor="let leader of proj.leaders" class="leader-item">
                        <mat-icon class="mini-icon">star</mat-icon>
                        <span>{{ leader.name }} ({{ leader.email }})</span>
                      </div>
                      <div *ngIf="proj.leaders.length === 0" class="text-muted small">
                        Sin líder directo asignado (SuperAdmin / Admin controlan globalmente).
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </mat-tab>

          <!-- TAB 3: AUDITORÍA DE DESCARGAS Y EXPORTACIONES -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">cloud_download</mat-icon>
              <span>Auditoría de Descargas</span>
            </ng-template>

            <div class="tab-body">
              <div class="section-intro-box download-intro">
                <mat-icon>download_done</mat-icon>
                <div>
                  <strong>Registro de Descargas y Exportaciones de Datos</strong>
                  <p>Mantiene la trazabilidad exacta de quién descargó datos de la plataforma, qué encuesta exportó, en qué formato y cuántas respuestas extrajo.</p>
                </div>
              </div>

              <div *ngIf="downloadLogs().length > 0" class="log-stream">
                <div *ngFor="let item of downloadLogs()" class="log-item-card descargas">
                  <div class="log-icon-col">
                    <div class="action-icon-circle descargas">
                      <mat-icon>file_download</mat-icon>
                    </div>
                  </div>
                  <div class="log-content-col">
                    <div class="log-header-meta">
                      <span class="module-chip descargas">DESCARGA REGISTRADA</span>
                      <span class="user-chip">
                        <mat-icon class="mini-icon">person</mat-icon> {{ item.user_name }} ({{ item.user_role }})
                      </span>
                      <span class="time-stamp">
                        <mat-icon class="mini-icon">schedule</mat-icon> {{ item.created_at | date: 'medium' }}
                      </span>
                    </div>
                    <div class="log-natural-text font-semibold">
                      {{ item.description_es }}
                    </div>
                    <div class="log-footer-meta">
                      <span>IP de Descarga: <strong>{{ item.ip_address }}</strong></span>
                      <span *ngIf="item.metadata?.format">Formato Archivo: <strong>{{ item.metadata.format }}</strong></span>
                      <span *ngIf="item.metadata?.responses_count">Registros: <strong>{{ item.metadata.responses_count }}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              <div *ngIf="downloadLogs().length === 0" class="empty-state">
                <mat-icon class="empty-icon">cloud_off</mat-icon>
                <h3>No hay descargas registradas en este período</h3>
                <p>Cada vez que un usuario exporte un archivo CSV o XLSX de respuestas, aparecerá detallado aquí.</p>
              </div>
            </div>
          </mat-tab>

          <!-- TAB 4: TRATAMIENTO Y CAMBIOS DE DATOS -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">data_thresholding</mat-icon>
              <span>Tratamiento y Cambios de Datos</span>
            </ng-template>

            <div class="tab-body">
              <div class="section-intro-box modification-intro">
                <mat-icon>published_with_changes</mat-icon>
                <div>
                  <strong>Integridad y Tratamiento de la Información</strong>
                  <p>Muestra el historial completo de modificaciones a la estructura de encuestas, publicación de formularios, creación de usuarios y cambios organizacionales.</p>
                </div>
              </div>

              <div *ngIf="modificationLogs().length > 0" class="log-stream">
                <div *ngFor="let item of modificationLogs()" class="log-item-card" [ngClass]="item.module">
                  <div class="log-icon-col">
                    <div class="action-icon-circle" [ngClass]="item.module">
                      <mat-icon>{{ getActionIcon(item.action, item.module) }}</mat-icon>
                    </div>
                  </div>
                  <div class="log-content-col">
                    <div class="log-header-meta">
                      <span class="module-chip" [ngClass]="item.module">{{ getModuleLabel(item.module) }}</span>
                      <span class="user-chip">
                        <mat-icon class="mini-icon">person</mat-icon> {{ item.user_name }} ({{ item.user_role }})
                      </span>
                      <span class="time-stamp">
                        <mat-icon class="mini-icon">schedule</mat-icon> {{ item.created_at | date: 'medium' }}
                      </span>
                    </div>
                    <div class="log-natural-text">
                      {{ item.description_es }}
                    </div>
                    <div class="log-footer-meta">
                      <span>Acción: <strong>{{ item.action }}</strong></span>
                      <span>IP Origen: <strong>{{ item.ip_address }}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              <div *ngIf="modificationLogs().length === 0" class="empty-state">
                <mat-icon class="empty-icon">rule</mat-icon>
                <h3>Sin modificaciones registradas</h3>
                <p>Las modificaciones a formularios, usuarios y proyectos se auditan automáticamente aquí.</p>
              </div>
            </div>
          </mat-tab>

        </mat-tab-group>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .audit-container {
        --audit-ocean: #005689;
        --audit-sky: #46a4ff;
        --audit-main: #0059a8;
        --audit-deep: #004499;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      :host-context(.dark) .audit-container {
        --audit-ocean: #46a4ff;
        --audit-main: #46a4ff;
        --audit-deep: #46a4ff;
      }

      :host-context(.dark) .super-badge {
        background: #004499;
      }

      :host-context(.dark) .refresh-btn {
        background: #0059a8 !important;
      }

      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1rem;
        background: var(--bg-secondary);
        padding: 1.25rem 1.5rem;
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-color);
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .header-icon-badge {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-md);
        background: rgba(70, 164, 255, 0.16);
        color: var(--audit-ocean);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .header-title-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .page-title {
        font-size: 1.35rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }

      .super-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        background: var(--audit-deep);
        color: white;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.2rem 0.5rem;
        border-radius: 9999px;
        text-transform: uppercase;
        letter-spacing: 0.05em;

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }

      .page-subtitle {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0.25rem 0 0 0;
      }

      .refresh-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        border-radius: var(--radius-md);
        background: var(--audit-main) !important;
        color: #fff !important;
      }

      /* KPI Cards */
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
      }

      .kpi-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        box-shadow: var(--shadow-sm);
        transition: transform var(--transition-fast);
      }

      .kpi-card:hover {
        transform: translateY(-2px);
      }

      .kpi-icon-wrapper {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .download-kpi .kpi-icon-wrapper { background: rgba(70, 164, 255, 0.18); color: var(--audit-deep); }
      .permission-kpi .kpi-icon-wrapper { background: rgba(0, 86, 137, 0.13); color: var(--audit-ocean); }
      .modification-kpi .kpi-icon-wrapper { background: rgba(0, 89, 168, 0.13); color: var(--audit-main); }
      .total-kpi .kpi-icon-wrapper { background: rgba(0, 68, 153, 0.13); color: var(--audit-deep); }

      .kpi-content {
        display: flex;
        flex-direction: column;
      }

      .kpi-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .kpi-value-row {
        display: flex;
        align-items: baseline;
        gap: 0.35rem;
        margin: 0.25rem 0;
      }

      .kpi-number {
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--text-primary);
      }

      .kpi-unit {
        font-size: 0.75rem;
        color: var(--text-secondary);
      }

      .kpi-detail {
        font-size: 0.725rem;
        color: var(--text-tertiary);
      }

      /* Main Card & Tabs */
      .main-card {
        background: var(--bg-secondary) !important;
        border-radius: var(--radius-lg) !important;
        border: 1px solid var(--border-color) !important;
        box-shadow: var(--shadow-sm) !important;
      }

      .custom-tabs {
        --mdc-tab-indicator-active-indicator-color: var(--audit-main);
        --mat-tab-header-active-label-text-color: var(--audit-deep);
        --mat-tab-header-active-focus-label-text-color: var(--audit-deep);
      }

      .tab-body {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }

      .tab-icon {
        margin-right: 0.5rem;
      }

      /* Filters Row */
      .filters-row {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        align-items: center;
      }

      .search-field {
        flex: 1;
        min-width: 280px;
        display: flex;
        align-items: center;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 0.5rem 0.75rem;
        gap: 0.5rem;
      }

      .search-field:focus-within {
        border-color: var(--audit-sky);
        box-shadow: 0 0 0 2px rgba(70, 164, 255, 0.16);
      }

      .search-field input {
        border: none;
        outline: none;
        background: transparent;
        width: 100%;
        color: var(--text-primary);
        font-size: 0.9rem;
      }

      .search-icon {
        color: var(--audit-ocean);
      }

      .clear-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        color: var(--text-tertiary);
      }

      .select-field {
        min-width: 220px;
      }

      /* Log Stream Cards */
      .log-stream {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }

      .log-item-card {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-left: 4px solid var(--audit-main);
        border-radius: var(--radius-md);
        padding: 1rem 1.25rem;
        transition: background var(--transition-fast);
      }

      .log-item-card:hover {
        background: var(--hover-bg);
      }

      .log-item-card.descargas { border-left-color: var(--audit-sky); }
      .log-item-card.permisos { border-left-color: var(--audit-ocean); }
      .log-item-card.formularios { border-left-color: var(--audit-main); }
      .log-item-card.usuarios { border-left-color: var(--audit-deep); }
      .log-item-card.proyectos { border-left-color: var(--audit-sky); }

      .action-icon-circle {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 89, 168, 0.12);
        color: var(--audit-main);
        flex-shrink: 0;
      }

      .action-icon-circle.descargas { background: rgba(70, 164, 255, 0.18); color: var(--audit-deep); }
      .action-icon-circle.permisos { background: rgba(0, 86, 137, 0.13); color: var(--audit-ocean); }
      .action-icon-circle.formularios { background: rgba(0, 89, 168, 0.13); color: var(--audit-main); }
      .action-icon-circle.usuarios { background: rgba(0, 68, 153, 0.13); color: var(--audit-deep); }
      .action-icon-circle.proyectos { background: rgba(70, 164, 255, 0.18); color: var(--audit-deep); }

      .log-content-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .log-header-meta {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .module-chip {
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
      }

      .module-chip.descargas { background: rgba(70, 164, 255, 0.2); color: var(--audit-deep); }
      .module-chip.permisos { background: rgba(0, 86, 137, 0.14); color: var(--audit-ocean); }
      .module-chip.formularios { background: rgba(0, 89, 168, 0.14); color: var(--audit-main); }
      .module-chip.usuarios { background: rgba(0, 68, 153, 0.14); color: var(--audit-deep); }
      .module-chip.proyectos { background: rgba(70, 164, 255, 0.2); color: var(--audit-deep); }

      .user-chip {
        font-size: 0.775rem;
        font-weight: 600;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .time-stamp {
        font-size: 0.725rem;
        color: var(--text-tertiary);
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin-left: auto;
      }

      .mini-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .log-natural-text {
        font-size: 0.95rem;
        font-weight: 500;
        color: var(--text-primary);
        line-height: 1.45;
        background: rgba(255, 255, 255, 0.02);
        padding: 0.35rem 0.5rem;
        border-radius: var(--radius-sm);
      }

      .log-footer-meta {
        display: flex;
        gap: 1rem;
        font-size: 0.75rem;
        color: var(--text-tertiary);
      }

      /* Sections & Permission Matrix */
      .section-intro-box {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        background: rgba(70, 164, 255, 0.1);
        border: 1px solid rgba(0, 89, 168, 0.22);
        border-radius: var(--radius-md);
        padding: 0.85rem 1rem;
        color: var(--text-primary);

        mat-icon {
          color: var(--audit-main);
        }

        strong {
          display: block;
          font-size: 0.9rem;
        }

        p {
          font-size: 0.825rem;
          color: var(--text-secondary);
          margin: 0.15rem 0 0 0;
        }
      }

      .permission-section {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 0.5rem;
      }

      .section-heading {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;

        mat-icon {
          color: var(--audit-main);
        }
      }

      .permission-table {
        width: 100%;
        background: var(--bg-primary) !important;
        border-radius: var(--radius-md);
        overflow: hidden;
      }

      .role-badge {
        padding: 0.2rem 0.6rem;
        border-radius: 9999px;
        font-size: 0.725rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      .role-badge.PROJECT { background: rgba(0, 68, 153, 0.14); color: var(--audit-deep); }
      .role-badge.RECOLECTOR { background: rgba(0, 86, 137, 0.14); color: var(--audit-ocean); }

      .target-badge {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--audit-main);
      }

      .user-subtext {
        font-size: 0.75rem;
        color: var(--text-tertiary);
      }

      /* Projects Grid */
      .projects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1rem;
      }

      .project-perm-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .proj-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .folder-icon {
        color: var(--audit-ocean);
      }

      .proj-name {
        font-weight: 700;
        font-size: 0.95rem;
        color: var(--text-primary);
      }

      .forms-count-chip {
        margin-left: auto;
        font-size: 0.7rem;
        background: var(--bg-tertiary);
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
        color: var(--text-secondary);
      }

      .leaders-title {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-tertiary);

      }

      .leader-item {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.825rem;
        color: var(--text-secondary);
        margin-top: 0.2rem;

        mat-icon {
          color: var(--audit-main);
        }
      }

      .loading-container, .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1rem;
        text-align: center;
        color: var(--text-tertiary);
      }

      .empty-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 0.5rem;
      }

      .custom-paginator {
        background: transparent !important;
        border-top: 1px solid var(--border-color);
        margin-top: 0.5rem;
      }

      @media (max-width: 640px) {
        .page-header {
          flex-direction: column;
          align-items: flex-start;
        }
        .header-actions {
          width: 100%;
        }
        .refresh-btn {
          width: 100%;
          justify-content: center;
        }
      }
    `,
  ],
})
export class AuditLogComponent implements OnInit {
  private readonly auditService = inject(AuditLogService);

  logs = signal<AuditLogItem[]>([]);
  downloadLogs = signal<AuditLogItem[]>([]);
  modificationLogs = signal<AuditLogItem[]>([]);
  stats = signal<AuditStats | null>(null);
  permissions = signal<PermissionsSummary | null>(null);
  loading = signal<boolean>(true);
  totalLogs = signal<number>(0);

  searchQuery = '';
  selectedModule = '';
  currentPage = 1;
  pageSize = 20;

  ngOnInit(): void {
    this.loadAllData();
  }

  loadAllData(): void {
    this.loading.set(true);
    this.loadLogs();

    this.auditService.getStats().subscribe({
      next: (data) => this.stats.set(data),
      error: (err) => console.error('Error fetching audit stats:', err),
    });

    this.auditService.getPermissionsSummary().subscribe({
      next: (data) => this.permissions.set(data),
      error: (err) => console.error('Error fetching permissions summary:', err),
    });
  }

  loadLogs(): void {
    this.loading.set(true);
    this.auditService
      .getLogs({
        page: this.currentPage,
        per_page: this.pageSize,
        module: this.selectedModule,
        search: this.searchQuery,
      })
      .subscribe({
        next: (res) => {
          this.logs.set(res.data);
          this.totalLogs.set(res.meta.total);
          this.loading.set(false);

          // Separate logs for quick tab filtering
          this.downloadLogs.set(res.data.filter((item) => item.module === 'descargas'));
          this.modificationLogs.set(
            res.data.filter((item) => ['formularios', 'proyectos', 'usuarios'].includes(item.module))
          );
        },
        error: (err) => {
          console.error('Error fetching audit logs:', err);
          this.loading.set(false);
        },
      });
  }

  onTabChange(index: number): void {
    if (index === 0) {
      this.selectedModule = '';
    } else if (index === 2) {
      this.selectedModule = 'descargas';
    } else if (index === 3) {
      this.selectedModule = 'formularios';
    }
    this.loadLogs();
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadLogs();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.currentPage = 1;
    this.loadLogs();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadLogs();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadLogs();
  }

  getModuleLabel(module: string): string {
    switch (module) {
      case 'descargas':
        return '📥 Descargas';
      case 'permisos':
        return '🔑 Permisos';
      case 'formularios':
        return '📝 Formularios';
      case 'usuarios':
        return '👥 Usuarios';
      case 'proyectos':
        return '📁 Proyectos';
      default:
        return module.toUpperCase();
    }
  }

  getActionIcon(action: string, module: string): string {
    if (action.includes('EXPORT') || module === 'descargas') return 'file_download';
    if (action.includes('PERMISSION') || module === 'permisos') return 'verified_user';
    if (action.includes('USER')) return 'person';
    if (action.includes('PROJECT')) return 'folder';
    if (action.includes('DEPLOY')) return 'rocket_launch';
    if (action.includes('ARCHIVE')) return 'inventory_2';
    if (action.includes('DELETE')) return 'delete';
    return 'edit_note';
  }
}
