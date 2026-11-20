import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '@core/services/language.service';
import { AuditLogItem, AuditLogService, AuditStats, PermissionsSummary } from '@core/services/audit-log.service';

interface LogDay {
  key: string;
  label: string;
  items: AuditLogItem[];
}

/** Módulos con nombre traducido (audit.modules.*). */
const MODULES = ['descargas', 'permisos', 'formularios', 'usuarios', 'proyectos', 'autenticacion'];
/** Roles con nombre traducido (audit.roles.*). */
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'PROJECT', 'SUPERVISOR', 'USER', 'RECOLECTOR'];

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
  ],
  template: `
    <div class="audit-container">
      <header class="page-header">
        <div class="page-heading">
          <div class="title-row">
            <h1 class="page-title">{{ 'audit.title' | translate }}</h1>
            <span class="access-tag">
              <mat-icon aria-hidden="true">lock</mat-icon>
              {{ 'audit.superOnly' | translate }}
            </span>
          </div>
          <p class="page-subtitle">
            {{ 'audit.subtitle' | translate }}
          </p>
        </div>
        <button class="btn-secondary" type="button" (click)="loadAllData()" [disabled]="loading()">
          <mat-icon aria-hidden="true" [class.is-spinning]="loading()">refresh</mat-icon>
          {{ 'audit.refresh' | translate }}
        </button>
      </header>

      @if (stats(); as s) {
        <section class="summary-strip" [attr.aria-label]="'audit.summaryLabel' | translate">
          <button type="button" class="stat" [class.is-active]="activeTab() === 0" (click)="selectTab(0)">
            <span class="stat-label">{{ 'audit.stats.total' | translate }}</span>
            <strong class="stat-value">{{ s.summary.total_logs | number }} <small>{{ 'audit.stats.events' | translate }}</small></strong>
            <span class="stat-detail">{{ 'audit.stats.totalDetail' | translate }}</span>
          </button>
          <button type="button" class="stat" [class.is-active]="activeTab() === 1" (click)="selectTab(1)">
            <span class="stat-label">{{ 'audit.stats.permissions' | translate }}</span>
            <strong class="stat-value">{{ s.summary.total_permission_changes | number }} <small>{{ 'audit.stats.assignments' | translate }}</small></strong>
            <span class="stat-detail">{{ 'audit.stats.permissionsDetail' | translate }}</span>
          </button>
          <button type="button" class="stat" [class.is-active]="activeTab() === 2" (click)="selectTab(2)">
            <span class="stat-label">{{ 'audit.stats.downloads' | translate }}</span>
            <strong class="stat-value">{{ s.summary.total_downloads | number }} <small>{{ 'audit.stats.files' | translate }}</small></strong>
            <span class="stat-detail">
              {{ 'audit.stats.downloadsDetail' | translate: { responses: (s.summary.total_responses_exported | number), pdf: s.summary.total_client_reported_exports, legacy: s.summary.total_legacy_exports } }}
            </span>
          </button>
          <button type="button" class="stat" [class.is-active]="activeTab() === 3" (click)="selectTab(3)">
            <span class="stat-label">{{ 'audit.stats.changes' | translate }}</span>
            <strong class="stat-value">{{ s.summary.total_data_modifications | number }} <small>{{ 'audit.stats.changesUnit' | translate }}</small></strong>
            <span class="stat-detail">{{ 'audit.stats.changesDetail' | translate }}</span>
          </button>
        </section>
      }

      <section class="main-panel">
        <mat-tab-group
          class="audit-tabs"
          animationDuration="0ms"
          mat-stretch-tabs="false"
          [selectedIndex]="activeTab()"
          (selectedIndexChange)="onTabChange($event)"
        >
          <!-- Historial -->
          <mat-tab [label]="'audit.tabs.history' | translate">
            <div class="tab-body">
              <div class="filters-row">
                <label class="search-field">
                  <mat-icon class="search-icon" aria-hidden="true">search</mat-icon>
                  <input
                    type="search"
                    [attr.aria-label]="'audit.search.label' | translate"
                    [placeholder]="'audit.search.placeholder' | translate"
                    [(ngModel)]="searchQuery"
                    (ngModelChange)="onSearchInput()"
                    (keyup.enter)="onSearch()"
                  />
                  @if (searchQuery) {
                    <button class="clear-btn" type="button" [attr.aria-label]="'audit.search.clear' | translate" (click)="clearSearch()">
                      <mat-icon>close</mat-icon>
                    </button>
                  }
                </label>

                <label class="select-field">
                  <span class="visually-hidden">{{ 'audit.filters.module' | translate }}</span>
                  <select [attr.aria-label]="'audit.filters.moduleLabel' | translate" [(ngModel)]="selectedModule" (ngModelChange)="onFilterChange()">
                    <option value="">{{ 'audit.filters.allModules' | translate }}</option>
                    @for (option of moduleOptions; track option.value) {
                      <option [value]="option.value">{{ 'audit.modules.' + option.value | translate }}</option>
                    }
                  </select>
                </label>
              </div>

              <p class="results-count" role="status">
                @if (!loading()) {
                  {{ (totalLogs() === 1 ? 'audit.results.one' : 'audit.results.many') | translate: { count: (totalLogs() | number) } }}
                  @if (searchQuery || selectedModule) { {{ 'audit.results.filtered' | translate }} }
                }
              </p>

              @if (loading()) {
                <div class="loading-container">
                  <mat-spinner diameter="32"></mat-spinner>
                  <p>{{ 'audit.loading.history' | translate }}</p>
                </div>
              } @else if (logs().length > 0) {
                <ng-container [ngTemplateOutlet]="feed" [ngTemplateOutletContext]="{ $implicit: logDays() }" />
              } @else {
                <div class="empty-state">
                  <mat-icon aria-hidden="true">search_off</mat-icon>
                  <h3>{{ 'audit.empty.history' | translate }}</h3>
                  <p>{{ 'audit.empty.historyHint' | translate }}</p>
                </div>
              }

              <mat-paginator
                [length]="totalLogs()"
                [pageSize]="pageSize"
                [pageIndex]="currentPage - 1"
                [pageSizeOptions]="[10, 20, 50, 100]"
                (page)="onPageChange($event)"
                class="audit-paginator"
                [attr.aria-label]="'audit.pagination' | translate"
              ></mat-paginator>
            </div>
          </mat-tab>

          <!-- Permisos -->
          <mat-tab [label]="'audit.tabs.permissions' | translate">
            <div class="tab-body">
              <p class="tab-intro">{{ 'audit.permissions.intro' | translate }}</p>

              @if (permissions(); as p) {
                <h2 class="block-title">{{ 'audit.permissions.byForm' | translate }}</h2>
                @if (p.shares.length > 0) {
                  <div class="table-frame">
                    <table mat-table [dataSource]="p.shares" class="permission-table">
                      <ng-container matColumnDef="form">
                        <th mat-header-cell *matHeaderCellDef>{{ 'audit.permissions.form' | translate }}</th>
                        <td mat-cell *matCellDef="let element"><strong>{{ element.form_title }}</strong></td>
                      </ng-container>
                      <ng-container matColumnDef="user">
                        <th mat-header-cell *matHeaderCellDef>{{ 'audit.permissions.person' | translate }}</th>
                        <td mat-cell *matCellDef="let element">
                          <span class="person">
                            <strong>{{ element.user_name }}</strong>
                            <span>{{ element.user_email }}</span>
                          </span>
                        </td>
                      </ng-container>
                      <ng-container matColumnDef="role">
                        <th mat-header-cell *matHeaderCellDef>{{ 'audit.permissions.role' | translate }}</th>
                        <td mat-cell *matCellDef="let element">
                          <span class="role-tag">{{ element.granted_role_label }}</span>
                        </td>
                      </ng-container>
                      <ng-container matColumnDef="target">
                        <th mat-header-cell *matHeaderCellDef>{{ 'audit.permissions.target' | translate }}</th>
                        <td mat-cell *matCellDef="let element" class="numeric">
                          {{ element.target_responses !== null ? element.target_responses : ('audit.permissions.noTarget' | translate) }}
                        </td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="['form', 'user', 'role', 'target']"></tr>
                      <tr mat-row *matRowDef="let row; columns: ['form', 'user', 'role', 'target']"></tr>
                    </table>
                  </div>
                } @else {
                  <p class="mini-empty">{{ 'audit.permissions.empty' | translate }}</p>
                }

                <h2 class="block-title">{{ 'audit.permissions.leaders' | translate }}</h2>
                <p class="block-note">{{ 'audit.permissions.leadersNote' | translate }}</p>
                <ul class="project-list">
                  @for (proj of p.projects; track proj.id) {
                    <li class="project-row">
                      <div class="project-name">
                        <mat-icon aria-hidden="true">folder</mat-icon>
                        <strong>{{ proj.name }}</strong>
                        <span>{{ (proj.forms_count === 1 ? 'audit.permissions.formsOne' : 'audit.permissions.formsMany') | translate: { count: proj.forms_count } }}</span>
                      </div>
                      <div class="project-leaders">
                        @for (leader of proj.leaders; track leader.email) {
                          <span class="person">
                            <strong>{{ leader.name }}</strong>
                            <span>{{ leader.email }}</span>
                          </span>
                        } @empty {
                          <span class="muted">{{ 'audit.permissions.noLeader' | translate }}</span>
                        }
                      </div>
                    </li>
                  }
                </ul>
              } @else {
                <div class="loading-container">
                  <mat-spinner diameter="32"></mat-spinner>
                  <p>{{ 'audit.loading.permissions' | translate }}</p>
                </div>
              }
            </div>
          </mat-tab>

          <!-- Descargas -->
          <mat-tab [label]="'audit.tabs.downloads' | translate">
            <div class="tab-body">
              <p class="tab-intro">{{ 'audit.downloads.intro' | translate }}</p>
              @if (loading()) {
                <div class="loading-container"><mat-spinner diameter="32"></mat-spinner><p>{{ 'audit.loading.downloads' | translate }}</p></div>
              } @else if (downloadLogs().length > 0) {
                <ng-container [ngTemplateOutlet]="feed" [ngTemplateOutletContext]="{ $implicit: downloadDays() }" />
              } @else {
                <div class="empty-state">
                  <mat-icon aria-hidden="true">cloud_off</mat-icon>
                  <h3>{{ 'audit.downloads.empty' | translate }}</h3>
                  <p>{{ 'audit.downloads.emptyHint' | translate }}</p>
                </div>
              }
            </div>
          </mat-tab>

          <!-- Cambios de datos -->
          <mat-tab [label]="'audit.stats.changes' | translate">
            <div class="tab-body">
              <p class="tab-intro">{{ 'audit.changes.intro' | translate }}</p>
              @if (loading()) {
                <div class="loading-container"><mat-spinner diameter="32"></mat-spinner><p>{{ 'audit.loading.changes' | translate }}</p></div>
              } @else if (modificationLogs().length > 0) {
                <ng-container [ngTemplateOutlet]="feed" [ngTemplateOutletContext]="{ $implicit: modificationDays() }" />
              } @else {
                <div class="empty-state">
                  <mat-icon aria-hidden="true">rule</mat-icon>
                  <h3>{{ 'audit.changes.empty' | translate }}</h3>
                  <p>{{ 'audit.changes.emptyHint' | translate }}</p>
                </div>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      </section>
    </div>

    <!-- Historial agrupado por día: una línea por evento -->
    <ng-template #feed let-days>
      <div class="feed">
        @for (day of days; track day.key) {
          <section class="feed-day" [attr.aria-label]="day.label | translate">
            <h3 class="feed-day-title">{{ day.label | translate }}</h3>
            <ol class="feed-list">
              @for (item of day.items; track item.id) {
                <li class="feed-row">
                  <time class="feed-time" [attr.datetime]="item.created_at">{{ item.created_at | date: 'HH:mm' }}</time>
                  <span class="feed-icon" [class.is-destructive]="isDestructive(item.action)" aria-hidden="true">
                    <mat-icon>{{ getActionIcon(item.action, item.module) }}</mat-icon>
                  </span>
                  <div class="feed-body">
                    <p class="feed-text">{{ item.description || item.description_es }}</p>
                    <p class="feed-meta">
                      <span class="module-tag">{{ getModuleLabel(item.module) | translate }}</span>
                      <span>{{ item.user_name }} · {{ getRoleLabel(item.user_role) | translate }}</span>
                      @if (item.metadata?.format) { <span>{{ 'audit.feed.format' | translate: { format: (item.metadata.format | uppercase) } }}</span> }
                      @if (item.metadata?.responses_count) { <span>{{ (item.metadata.responses_count == 1 ? 'audit.feed.responsesOne' : 'audit.feed.responsesMany') | translate: { count: (item.metadata.responses_count | number) } }}</span> }
                      @if (item.ip_address) { <span class="feed-ip">{{ 'audit.feed.ip' | translate: { ip: item.ip_address } }}</span> }
                    </p>
                  </div>
                </li>
              }
            </ol>
          </section>
        }
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .audit-container {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        max-width: 1400px;
        margin: 0 auto;
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      /* ---- Encabezado ---- */
      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1rem;
      }

      .title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.75rem;
      }

      .page-title {
        margin: 0;
        color: var(--text-primary);
        font-size: 1.75rem;
        font-weight: 700;
        text-wrap: balance;
      }

      .access-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.15rem 0.55rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-full);
        color: var(--text-secondary);
        font-size: 0.75rem;
        font-weight: 600;

        mat-icon {
          width: 14px;
          height: 14px;
          font-size: 14px;
        }
      }

      .page-subtitle {
        max-width: 70ch;
        margin: 0.35rem 0 0;
        color: var(--text-secondary);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      .btn-secondary {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-height: 38px;
        padding: 0.5rem 0.9rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--card-bg);
        color: var(--text-primary);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color var(--transition-fast), border-color var(--transition-fast);

        mat-icon {
          width: 18px;
          height: 18px;
          font-size: 18px;
          color: var(--primary-text-600);
        }

        &:hover:not(:disabled) {
          background: var(--hover-bg);
          border-color: var(--border-hover);
        }

        &:disabled {
          cursor: progress;
          opacity: 0.7;
        }

        &:focus-visible {
          outline: 2px solid var(--primary-600);
          outline-offset: 2px;
        }
      }

      .is-spinning {
        animation: spin 0.9s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* ---- Resumen ---- */
      .summary-strip {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 1px;
        overflow: hidden;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-lg);
        background: var(--border-color);
      }

      .stat {
        display: grid;
        align-content: start;
        gap: 0.3rem;
        padding: 1rem 1.25rem;
        border: 0;
        background: var(--card-bg);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background-color var(--transition-fast);

        &:hover {
          background: var(--hover-bg);
        }

        &.is-active {
          background: var(--primary-50);

          .stat-label {
            color: var(--primary-text-600);
          }
        }

        &:focus-visible {
          outline: 2px solid var(--primary-600);
          outline-offset: -2px;
        }
      }

      .stat-label {
        color: var(--text-secondary);
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .stat-value {
        color: var(--text-primary);
        font-size: 1.625rem;
        font-weight: 700;
        line-height: 1.15;
        font-variant-numeric: tabular-nums;

        small {
          color: var(--text-secondary);
          font-size: 0.8125rem;
          font-weight: 500;
        }
      }

      .stat-detail {
        color: var(--text-secondary);
        font-size: 0.75rem;
        line-height: 1.45;
        font-variant-numeric: tabular-nums;
      }

      /* ---- Panel y pestañas ---- */
      .main-panel {
        overflow: hidden;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-lg);
        background: var(--card-bg);
      }

      .audit-tabs {
        --mat-tab-header-active-label-text-color: var(--primary-text-600);
        --mat-tab-header-active-focus-label-text-color: var(--primary-text-600);
        --mat-tab-header-active-hover-label-text-color: var(--primary-text-600);
        --mat-tab-header-inactive-label-text-color: var(--text-secondary);
        --mat-tab-header-inactive-hover-label-text-color: var(--text-primary);
        --mat-tab-header-inactive-focus-label-text-color: var(--text-primary);
        --mat-tab-header-active-ripple-color: var(--primary-600);
        --mat-tab-header-inactive-ripple-color: var(--primary-600);
        --mat-tab-header-label-text-tracking: 0;
        --mat-tab-header-label-text-weight: 600;
        --mat-tab-header-label-text-size: 0.875rem;
        --mat-tab-header-divider-color: var(--border-color);
        --mat-tab-header-divider-height: 1px;
        --mdc-tab-indicator-active-indicator-color: var(--primary-600);
        --mat-tab-header-active-indicator-color: var(--primary-600);
        --mdc-tab-indicator-active-indicator-height: 2px;
      }

      ::ng-deep .audit-tabs .mat-mdc-tab-header {
        padding: 0 0.75rem;
      }

      ::ng-deep .audit-tabs .mdc-tab__text-label {
        letter-spacing: 0;
        font-weight: 600;
      }

      .tab-body {
        padding: 1.25rem;
      }

      .tab-intro {
        max-width: 72ch;
        margin: 0 0 1.25rem;
        color: var(--text-secondary);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      /* ---- Filtros ---- */
      .filters-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .search-field {
        position: relative;
        display: flex;
        align-items: center;
        flex: 1 1 320px;

        .search-icon {
          position: absolute;
          left: 0.75rem;
          width: 20px;
          height: 20px;
          font-size: 20px;
          color: var(--text-tertiary);
          pointer-events: none;
        }

        input {
          width: 100%;
          min-height: 42px;
          padding: 0.5rem 2.5rem;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          background: var(--bg-primary);
          color: var(--text-primary);
          font: inherit;
          font-size: 0.875rem;

          &::placeholder {
            color: var(--text-tertiary);
          }

          &::-webkit-search-cancel-button {
            display: none;
          }
        }
      }

      .search-field input:hover,
      .select-field select:hover {
        border-color: var(--border-hover);
      }

      .search-field input:focus-visible,
      .select-field select:focus-visible {
        outline: 2px solid var(--primary-600);
        outline-offset: 1px;
        border-color: var(--primary-600);
      }

      .clear-btn {
        position: absolute;
        right: 0.4rem;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;

        mat-icon {
          width: 18px;
          height: 18px;
          font-size: 18px;
        }

        &:hover {
          background: var(--hover-bg);
        }
      }

      .select-field {
        flex: 0 1 240px;

        select {
          width: 100%;
          min-height: 42px;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          background: var(--bg-primary);
          color: var(--text-primary);
          font: inherit;
          font-size: 0.875rem;
          color-scheme: light dark;
        }
      }

      .results-count {
        min-height: 1.25rem;
        margin: 0.75rem 0 0.25rem;
        color: var(--text-secondary);
        font-size: 0.8125rem;
        font-variant-numeric: tabular-nums;
      }

      /* ---- Historial ---- */
      .feed {
        display: grid;
        gap: 1.25rem;
        margin-top: 0.5rem;
      }

      .feed-day-title {
        position: sticky;
        top: 0;
        z-index: 1;
        margin: 0;
        padding: 0.4rem 0;
        background: var(--card-bg);
        color: var(--text-primary);
        font-size: 0.8125rem;
        font-weight: 700;
        border-bottom: 1px solid var(--border-color);

        &::first-letter {
          text-transform: uppercase;
        }
      }

      .feed-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .feed-row {
        display: grid;
        grid-template-columns: 3rem 32px minmax(0, 1fr);
        align-items: start;
        gap: 0.75rem;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--border-color);

        &:last-child {
          border-bottom: 0;
        }
      }

      .feed-time {
        padding-top: 0.4rem;
        color: var(--text-secondary);
        font-size: 0.8125rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      .feed-icon {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: var(--radius-lg);
        background: var(--primary-50);
        color: var(--primary-text-600);

        mat-icon {
          width: 18px;
          height: 18px;
          font-size: 18px;
        }

        &.is-destructive {
          background: var(--error-bg);
          color: var(--error-color);
        }
      }

      .feed-body {
        min-width: 0;
      }

      .feed-text {
        margin: 0;
        padding-top: 0.3rem;
        color: var(--text-primary);
        font-size: 0.9375rem;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      .feed-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem 0.9rem;
        margin: 0.35rem 0 0;
        color: var(--text-secondary);
        font-size: 0.78rem;
        font-variant-numeric: tabular-nums;
      }

      .module-tag {
        padding: 0.05rem 0.5rem;
        border-radius: var(--radius-full);
        background: var(--bg-tertiary);
        color: var(--text-primary);
        font-weight: 600;
      }

      .feed-ip {
        color: var(--text-tertiary);
      }

      .audit-paginator {
        margin-top: 0.75rem;
        border-top: 1px solid var(--border-color);
        background: transparent;
      }

      /* ---- Permisos ---- */
      .block-title {
        margin: 0 0 0.6rem;
        color: var(--text-primary);
        font-size: 1rem;
        font-weight: 700;
      }

      .block-title + .block-note {
        margin-top: -0.35rem;
      }

      .block-note {
        margin: 0 0 0.75rem;
        color: var(--text-secondary);
        font-size: 0.8125rem;
      }

      .table-frame {
        margin-bottom: 2rem;
        overflow-x: auto;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-lg);
      }

      .permission-table {
        width: 100%;
        background: transparent;

        th {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-weight: 700;
          white-space: nowrap;
        }

        td {
          color: var(--text-primary);
          font-size: 0.8125rem;
        }

        .numeric {
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .person {
          min-width: 15rem;
        }
      }

      .person {
        display: grid;
        gap: 0.05rem;

        strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        span {
          color: var(--text-secondary);
          font-size: 0.78rem;
          overflow-wrap: anywhere;
        }
      }

      .role-tag {
        display: inline-block;
        padding: 0.1rem 0.55rem;
        border-radius: var(--radius-full);
        background: var(--primary-50);
        color: var(--primary-text-600);
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
      }

      .project-list {
        margin: 0;
        padding: 0;
        list-style: none;
        border: 1px solid var(--card-border);
        border-radius: var(--radius-lg);
      }

      .project-row {
        display: grid;
        grid-template-columns: minmax(200px, 1fr) minmax(0, 2fr);
        gap: 0.5rem 1.5rem;
        padding: 0.875rem 1rem;
        border-bottom: 1px solid var(--border-color);

        &:last-child {
          border-bottom: 0;
        }
      }

      .project-name {
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr);
        align-items: center;
        column-gap: 0.5rem;

        mat-icon {
          width: 20px;
          height: 20px;
          font-size: 20px;
          color: var(--primary-text-600);
        }

        strong {
          color: var(--text-primary);
          font-size: 0.875rem;
        }

        span {
          grid-column: 2;
          color: var(--text-secondary);
          font-size: 0.78rem;
        }
      }

      .project-leaders {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1.75rem;
        align-content: center;
        font-size: 0.8125rem;
      }

      .muted,
      .mini-empty {
        color: var(--text-secondary);
        font-size: 0.8125rem;
      }

      .mini-empty {
        margin: 0 0 2rem;
        padding: 1rem;
        border: 1px dashed var(--border-color);
        border-radius: var(--radius-lg);
      }

      /* ---- Estados ---- */
      .loading-container,
      .empty-state {
        display: grid;
        justify-items: center;
        gap: 0.5rem;
        padding: 3rem 1rem;
        color: var(--text-secondary);
        text-align: center;

        p {
          margin: 0;
          font-size: 0.875rem;
        }
      }

      .empty-state {
        mat-icon {
          width: 40px;
          height: 40px;
          font-size: 40px;
          color: var(--text-tertiary);
        }

        h3 {
          margin: 0;
          color: var(--text-primary);
          font-size: 1rem;
        }
      }

      @media (max-width: 1080px) {
        .summary-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 720px) {
        .page-title {
          font-size: 1.4rem;
        }

        .btn-secondary {
          width: 100%;
          justify-content: center;
        }

        .stat-detail {
          display: none;
        }

        .tab-body {
          padding: 1rem;
        }

        .select-field {
          flex: 1 1 100%;
        }

        .feed-row {
          grid-template-columns: 32px minmax(0, 1fr);
        }

        .feed-time {
          grid-column: 2;
          grid-row: 1;
          padding: 0;
        }

        .feed-icon {
          grid-row: 1 / span 2;
        }

        .feed-body {
          grid-column: 2;
        }

        .project-row {
          grid-template-columns: 1fr;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .is-spinning {
          animation: none;
        }
      }
    `,
  ],
})
export class AuditLogComponent implements OnInit, OnDestroy {
  private readonly auditService = inject(AuditLogService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  logs = signal<AuditLogItem[]>([]);
  downloadLogs = signal<AuditLogItem[]>([]);
  modificationLogs = signal<AuditLogItem[]>([]);
  stats = signal<AuditStats | null>(null);
  permissions = signal<PermissionsSummary | null>(null);
  loading = signal<boolean>(true);
  totalLogs = signal<number>(0);
  activeTab = signal(0);

  readonly logDays = computed(() => this.groupByDay(this.logs()));
  readonly downloadDays = computed(() => this.groupByDay(this.downloadLogs()));
  readonly modificationDays = computed(() => this.groupByDay(this.modificationLogs()));

  readonly moduleOptions = MODULES.map((value) => ({ value }));

  searchQuery = '';
  selectedModule = '';
  currentPage = 1;
  pageSize = 20;
  private searchTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.loadAllData();
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
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

  selectTab(index: number): void {
    if (index !== this.activeTab()) this.onTabChange(index);
  }

  onTabChange(index: number): void {
    this.activeTab.set(index);
    if (index === 1) return; // Los permisos no dependen del historial.
    this.selectedModule = index === 2 ? 'descargas' : index === 3 ? 'formularios' : '';
    this.currentPage = 1;
    this.loadLogs();
  }

  onSearchInput(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.onSearch(), 350);
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.currentPage = 1;
    this.loadLogs();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.onSearch();
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

  /** Clave de traducción del módulo; un módulo desconocido se muestra tal cual. */
  getModuleLabel(module: string): string {
    return MODULES.includes(module) ? `audit.modules.${module}` : module.charAt(0).toUpperCase() + module.slice(1);
  }

  /** Clave de traducción del rol; un rol desconocido se muestra tal cual. */
  getRoleLabel(role: string): string {
    return ROLES.includes(role) ? `audit.roles.${role}` : role;
  }

  isDestructive(action: string): boolean {
    return action.includes('DELETE') || action.includes('REVOKE');
  }

  getActionIcon(action: string, module: string): string {
    if (action.includes('LOGIN') || module === 'autenticacion') return 'login';
    if (action.includes('EXPORT') || module === 'descargas') return 'file_download';
    if (action.includes('PERMISSION') || module === 'permisos') return 'verified_user';
    if (action.includes('DELETE')) return 'delete';
    if (action.includes('RESTORE')) return 'restore';
    if (action.includes('USER')) return 'person';
    if (action.includes('PROJECT')) return 'folder';
    if (action.includes('DEPLOY')) return 'rocket_launch';
    if (action.includes('ARCHIVE')) return 'inventory_2';
    return 'edit_note';
  }

  /** Agrupa los eventos por día local, con "Hoy" y "Ayer" para los recientes. */
  private groupByDay(items: AuditLogItem[]): LogDay[] {
    const lang = this.language.currentLang(); // recalcula las etiquetas al cambiar de idioma
    const locale = lang === 'en' ? 'en-US' : 'es-EC';
    const days: LogDay[] = [];
    const today = this.dayKey(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = this.dayKey(yesterdayDate);

    for (const item of items) {
      const date = new Date(item.created_at);
      const key = Number.isNaN(date.getTime()) ? 'sin-fecha' : this.dayKey(date);
      let day = days.find((entry) => entry.key === key);
      if (!day) {
        const label = key === 'sin-fecha' ? 'audit.days.unknown'
          : key === today ? 'audit.days.today'
          : key === yesterday ? 'audit.days.yesterday'
          : date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        day = { key, label, items: [] };
        days.push(day);
      }
      day.items.push(item);
    }
    return days;
  }

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
}
