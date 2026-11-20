import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { DataCenterService, TrashItem, TrashType } from '@core/services/data-center.service';
import { FormService } from '@core/services/form.service';
import { NotificationService } from '@core/services/notification.service';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

const TABS: Array<{ type: TrashType; label: string; icon: string; empty: string }> = [
  { type: 'forms', label: 'dataCenter.tabs.forms', icon: 'description', empty: 'dataCenter.empty.forms' },
  { type: 'responses', label: 'dataCenter.tabs.responses', icon: 'block', empty: 'dataCenter.empty.responses' },
  { type: 'zones', label: 'dataCenter.tabs.zones', icon: 'map', empty: 'dataCenter.empty.zones' },
  { type: 'projects', label: 'dataCenter.tabs.projects', icon: 'folder', empty: 'dataCenter.empty.projects' },
];

/**
 * Centro de datos (solo superadministrador): corregir datos desde la aplicación, sin entrar a la base
 * de datos. Aquí vive la papelera; las respuestas se corrigen desde su detalle en Respuestas.
 */
@Component({
  selector: 'app-data-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule, TranslateModule],
  template: `
    <div class="dc-page">
      <header class="dc-header">
        <h1>{{ 'dataCenter.title' | translate }}</h1>
        <p>
          {{ 'dataCenter.introBefore' | translate }} <a routerLink="/admin/auditoria">{{ 'dataCenter.auditLink' | translate }}</a> {{ 'dataCenter.introAfter' | translate }}
        </p>
      </header>

      <section class="dc-guide" [attr.aria-label]="'dataCenter.guideLabel' | translate">
        <div>
          <mat-icon aria-hidden="true">edit_note</mat-icon>
          <p><strong>{{ 'dataCenter.guideResponsesTitle' | translate }}</strong> {{ 'dataCenter.guideResponses' | translate }}</p>
        </div>
        <div>
          <mat-icon aria-hidden="true">person_off</mat-icon>
          <p><strong>{{ 'dataCenter.guideUsersTitle' | translate }}</strong> {{ 'dataCenter.guideUsersBefore' | translate }} <a routerLink="/admin/usuarios">{{ 'dataCenter.usersLink' | translate }}</a>{{ 'dataCenter.guideUsersAfter' | translate }}</p>
        </div>
      </section>

      <section class="dc-card" aria-labelledby="trash-title">
        <div class="dc-card-header">
          <h2 id="trash-title">{{ 'dataCenter.trash' | translate }}</h2>
          <div class="dc-tabs" role="tablist" [attr.aria-label]="'dataCenter.typeLabel' | translate">
            @for (tab of tabs; track tab.type) {
              <button type="button" role="tab" [attr.aria-selected]="type() === tab.type" [class.active]="type() === tab.type" (click)="select(tab.type)">
                <mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon>{{ tab.label | translate }}
              </button>
            }
          </div>
        </div>

        <label class="dc-search">
          <mat-icon aria-hidden="true">search</mat-icon>
          <span class="visually-hidden">{{ 'dataCenter.searchLabel' | translate }}</span>
          <input type="search" [placeholder]="'dataCenter.searchPlaceholder' | translate" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        </label>

        @if (loading()) {
          <div class="dc-state"><mat-spinner diameter="32"></mat-spinner></div>
        } @else if (filtered().length === 0) {
          <p class="dc-state">{{ search() ? ('dataCenter.noMatch' | translate: { term: search() }) : (currentTab().empty | translate) }}</p>
        } @else {
          <div class="dc-table-wrap">
            <table class="dc-table">
              <thead>
                <tr>
                  <th scope="col">{{ 'dataCenter.item' | translate }}</th>
                  <th scope="col">{{ 'dataCenter.deleted' | translate }}</th>
                  <th scope="col"><span class="visually-hidden">{{ 'common.labels.actions' | translate }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (item of filtered(); track item.id) {
                  <tr>
                    <td>
                      <strong>{{ item.name }}</strong>
                      @if (item.context) { <span>{{ item.context }}</span> }
                      @if (item.reason) { <span class="dc-reason">{{ 'dataCenter.reason' | translate: { reason: item.reason } }}</span> }
                    </td>
                    <td class="dc-when">
                      {{ item.deleted_at ? (item.deleted_at | date: 'dd/MM/yyyy HH:mm') : '—' }}
                      @if (item.deleted_by) { <span>{{ 'dataCenter.by' | translate: { name: item.deleted_by } }}</span> }
                    </td>
                    <td class="dc-actions">
                      <button mat-stroked-button color="primary" type="button" (click)="restore(item)" [disabled]="busy() === item.id">
                        <mat-icon>restore</mat-icon> {{ 'dataCenter.restore' | translate }}
                      </button>
                      @if (item.can_purge) {
                        <button mat-button color="warn" type="button" (click)="purge(item)" [disabled]="busy() === item.id"
                          [attr.aria-expanded]="type() === 'forms' ? purging()?.id === item.id : null">
                          {{ 'dataCenter.purge' | translate }}
                        </button>
                      }
                    </td>
                  </tr>
                  @if (purging()?.id === item.id) {
                    <!-- Borrar un formulario se lleva todas sus respuestas: se ofrece exportarlas y se pide su nombre exacto. -->
                    <tr class="dc-purge-row">
                      <td colspan="3">
                        <div class="dc-purge" role="group" [attr.aria-label]="'dataCenter.purgeNamed' | translate: { name: item.name }">
                          <p>
                            <strong>{{ 'dataCenter.cannotUndo' | translate }}</strong> {{ 'dataCenter.purgeWarning1' | translate }}
                            {{ 'dataCenter.purgeWarning2' | translate }}
                          </p>
                          <div class="dc-purge-export">
                            <span>{{ 'dataCenter.exportFirst' | translate }}</span>
                            <button mat-stroked-button type="button" (click)="exportResponses(item, 'xlsx')" [disabled]="exporting()">
                              <mat-icon>download</mat-icon> Excel
                            </button>
                            <button mat-stroked-button type="button" (click)="exportResponses(item, 'csv')" [disabled]="exporting()">
                              <mat-icon>download</mat-icon> CSV
                            </button>
                          </div>
                          <label class="dc-purge-confirm">
                            <span>{{ 'dataCenter.typeName' | translate }} <strong>{{ item.name }}</strong></span>
                            <input type="text" autocomplete="off" [ngModel]="purgeConfirm()" (ngModelChange)="purgeConfirm.set($event)" />
                          </label>
                          <div class="dc-purge-actions">
                            <button mat-stroked-button type="button" (click)="cancelPurge()">{{ 'common.buttons.cancel' | translate }}</button>
                            <button mat-flat-button color="warn" type="button" (click)="confirmPurgeForm(item)"
                              [disabled]="purgeConfirm().trim() !== item.name.trim() || busy() === item.id">
                              {{ 'dataCenter.purge' | translate }}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          @if (items().length >= 200) { <p class="dc-note">{{ 'dataCenter.latest200' | translate }}</p> }
        }
      </section>
    </div>
  `,
  styles: [`
    .dc-page { display: grid; gap: 1.25rem; padding: 1.5rem; max-width: 1100px; }
    .dc-header h1 { margin: 0 0 0.35rem; font-size: 1.6rem; color: var(--text-primary); }
    .dc-header p { margin: 0; max-width: 65ch; color: var(--text-secondary); line-height: 1.5; }

    .dc-guide { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.75rem; }
    .dc-guide > div {
      display: flex; gap: 0.6rem; padding: 0.85rem 1rem;
      border: 1px solid var(--card-border); border-radius: var(--radius-lg); background: var(--card-bg);
    }
    .dc-guide mat-icon { flex: none; color: var(--primary-text-600); }
    .dc-guide p { margin: 0; font-size: 0.9rem; line-height: 1.45; color: var(--text-secondary); }
    .dc-guide strong { color: var(--text-primary); }

    .dc-card {
      display: grid; gap: 0.85rem; padding: 1rem 1.25rem;
      border: 1px solid var(--card-border); border-radius: var(--radius-xl); background: var(--card-bg);
    }
    .dc-card-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .dc-card-header h2 { margin: 0; font-size: 1.1rem; color: var(--text-primary); }

    .dc-tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .dc-tabs button {
      display: inline-flex; align-items: center; gap: 0.35rem; min-height: 36px; padding: 0 0.75rem;
      border: 1px solid transparent; border-radius: var(--radius-md); background: transparent;
      color: var(--text-secondary); font: inherit; font-size: 0.875rem; font-weight: 600; cursor: pointer;
    }
    .dc-tabs button mat-icon { width: 18px; height: 18px; font-size: 18px; }
    .dc-tabs button:hover { background: var(--bg-secondary); }
    .dc-tabs button.active { border-color: var(--card-border); background: var(--bg-secondary); color: var(--text-primary); }

    .dc-search {
      display: flex; align-items: center; gap: 0.4rem; max-width: 420px; height: 40px; padding: 0 0.65rem;
      border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-secondary);
    }
    .dc-search:focus-within { outline: 2px solid var(--primary-600); outline-offset: 1px; }
    .dc-search mat-icon { width: 20px; height: 20px; font-size: 20px; }
    .dc-search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--text-primary); font: inherit; font-size: 0.9rem; }

    .dc-state { display: grid; place-items: center; margin: 0; padding: 2rem 1rem; color: var(--text-secondary); }

    .dc-table-wrap { overflow-x: auto; border: 1px solid var(--card-border); border-radius: var(--radius-lg); }
    .dc-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .dc-table th {
      padding: 0.55rem 0.85rem; background: var(--bg-secondary); color: var(--text-secondary);
      font-size: 0.75rem; font-weight: 700; text-align: left; white-space: nowrap;
    }
    .dc-table td { padding: 0.65rem 0.85rem; border-top: 1px solid var(--card-border); vertical-align: top; }
    .dc-table td strong { display: block; color: var(--text-primary); overflow-wrap: anywhere; }
    .dc-table td span { display: block; color: var(--text-secondary); font-size: 0.82rem; overflow-wrap: anywhere; }
    .dc-table .dc-reason { color: var(--text-primary); }
    .dc-when { white-space: nowrap; color: var(--text-secondary); }
    .dc-actions { width: 1%; white-space: nowrap; text-align: right; }
    .dc-actions button { margin-left: 0.35rem; }
    .dc-note { margin: 0; font-size: 0.82rem; color: var(--text-secondary); }

    .dc-purge-row td { border-top: 0; padding-top: 0; }
    .dc-purge {
      display: grid; gap: 0.75rem; padding: 0.9rem 1rem;
      border: 1px solid var(--card-border); border-radius: var(--radius-lg); background: var(--bg-secondary);
    }
    .dc-purge p { margin: 0; line-height: 1.5; color: var(--text-primary); }
    .dc-purge-export { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .dc-purge-export span { color: var(--text-secondary); font-size: 0.875rem; }
    .dc-purge-confirm { display: grid; gap: 0.35rem; max-width: 460px; }
    .dc-purge-confirm span { font-size: 0.875rem; color: var(--text-secondary); }
    .dc-purge-confirm input {
      height: 40px; padding: 0 0.65rem; border: 1px solid var(--border-color); border-radius: var(--radius-md);
      background: var(--bg-primary); color: var(--text-primary); font: inherit;
    }
    .dc-purge-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; }
    .dc-table .dc-purge-actions button, .dc-table .dc-purge-export button { margin: 0; }

    @media (max-width: 640px) {
      .dc-page { padding: 1rem; }
      .dc-actions { white-space: normal; }
      .dc-actions button { margin: 0.25rem 0 0; width: 100%; }
    }
  `],
})
export class DataCenterComponent implements OnInit {
  private readonly dataCenter = inject(DataCenterService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly forms = inject(FormService);
  private readonly i18n = inject(TranslateService);

  readonly tabs = TABS;
  readonly type = signal<TrashType>('forms');
  readonly items = signal<TrashItem[]>([]);
  readonly loading = signal(true);
  readonly busy = signal<string | null>(null);
  readonly search = signal('');
  /** Formulario cuyo borrado definitivo se está confirmando. */
  readonly purging = signal<TrashItem | null>(null);
  readonly purgeConfirm = signal('');
  readonly exporting = signal(false);
  readonly currentTab = computed(() => TABS.find((tab) => tab.type === this.type())!);
  readonly filtered = computed(() => {
    const term = normalize(this.search());
    return term
      ? this.items().filter((item) => normalize(`${item.name} ${item.context ?? ''} ${item.reason ?? ''}`).includes(term))
      : this.items();
  });

  ngOnInit(): void {
    this.load();
  }

  select(type: TrashType): void {
    if (this.type() === type) return;
    this.type.set(type);
    this.search.set('');
    this.cancelPurge();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.dataCenter.trash(this.type()).subscribe({
      next: (result) => {
        this.items.set(result.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.items.set([]);
        this.loading.set(false);
        this.notify.error(err?.error?.message || this.i18n.instant('dataCenter.errors.load'));
      },
    });
  }

  restore(item: TrashItem): void {
    this.run(item, this.dataCenter.restore(this.type(), item.id));
  }

  purge(item: TrashItem): void {
    if (this.type() === 'forms') {
      // Formularios: confirmación en la propia fila, con exporte previo y su nombre escrito.
      this.purging.set(this.purging()?.id === item.id ? null : item);
      this.purgeConfirm.set('');
      return;
    }
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.i18n.instant('dataCenter.purge'),
        message: this.i18n.instant('dataCenter.purgeMessage', { name: item.name }),
        confirmText: this.i18n.instant('dataCenter.purge'),
        cancelText: this.i18n.instant('common.buttons.cancel'),
        confirmColor: 'warn',
      },
    }).afterClosed().subscribe((confirmed) => {
      if (confirmed) this.run(item, this.dataCenter.purge(this.type(), item.id));
    });
  }

  cancelPurge(): void {
    this.purging.set(null);
    this.purgeConfirm.set('');
  }

  confirmPurgeForm(item: TrashItem): void {
    if (this.purgeConfirm().trim() !== item.name.trim()) return;
    this.run(item, this.dataCenter.purge('forms', item.id, this.purgeConfirm().trim()));
  }

  exportResponses(item: TrashItem, format: 'csv' | 'xlsx'): void {
    this.exporting.set(true);
    this.forms.exportResponses(item.id, format).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${item.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'formulario'}_respuestas.${format}`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => {
        this.exporting.set(false);
        this.notify.error(this.i18n.instant('dataCenter.errors.export'));
      },
    });
  }

  private run(item: TrashItem, request: ReturnType<DataCenterService['restore']>): void {
    this.busy.set(item.id);
    request.subscribe({
      next: (result) => {
        this.busy.set(null);
        this.notify.success(result.message);
        if (this.purging()?.id === item.id) this.cancelPurge();
        this.items.update((items) => items.filter((entry) => entry.id !== item.id));
      },
      error: (err) => {
        this.busy.set(null);
        this.notify.error(err?.error?.message || this.i18n.instant('dataCenter.errors.action'));
      },
    });
  }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
