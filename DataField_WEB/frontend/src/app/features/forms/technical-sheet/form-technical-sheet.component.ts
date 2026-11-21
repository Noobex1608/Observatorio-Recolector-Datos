import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FORM_SHEET_PARAMETERS, FormService, FormSheetParameter, FormTechnicalSheet } from '@core/services/form.service';
import { NotificationService } from '@core/services/notification.service';

type SheetValues = Record<FormSheetParameter, string>;

/** Marcadores de la plantilla que el usuario debe reemplazar, por ejemplo «[cantón]». */
const PLACEHOLDER = /\[[^\]]+\]/;

const emptyValues = (): SheetValues =>
  Object.fromEntries(FORM_SHEET_PARAMETERS.map((key) => [key, ''])) as SheetValues;

/**
 * Ficha técnica metodológica del formulario (Parámetro / Especificación metodológica).
 * La edita el equipo del formulario; la valida el líder o el delegado del proyecto.
 * Cualquier cambio guardado devuelve la ficha a borrador.
 */
@Component({
  selector: 'app-form-technical-sheet',
  standalone: true,
  imports: [DatePipe, FormsModule, TranslateModule],
  template: `
    <section class="sheet" aria-labelledby="form-sheet-title">
      <button type="button" class="sheet-header" (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()" aria-controls="form-sheet-body">
        <span class="material-icons" aria-hidden="true">fact_check</span>
        <span class="sheet-heading">
          <span class="sheet-title-row">
            <span id="form-sheet-title" class="sheet-title">{{ 'forms.technicalSheet.title' | translate }}</span>
            <span class="optional-tag">{{ 'forms.technicalSheet.optional' | translate }}</span>
          </span>
          <span class="sheet-subtitle">{{ 'forms.technicalSheet.subtitle' | translate }}</span>
        </span>
        @if (sheet(); as current) {
          <span class="status" [class.status--validated]="current.status === 'VALIDATED'">
            {{ 'forms.technicalSheet.status.' + current.status | translate }}
          </span>
        }
        <span class="material-icons chevron" aria-hidden="true">{{ expanded() ? 'expand_less' : 'expand_more' }}</span>
      </button>

      @if (expanded()) {
        <div id="form-sheet-body" class="sheet-body">
          @if (loading()) {
            <p class="muted">{{ 'forms.technicalSheet.loading' | translate }}</p>
          } @else if (sheet(); as current) {
            <p class="notice" [class.notice--validated]="current.status === 'VALIDATED'">
              <span class="material-icons" aria-hidden="true">{{ current.status === 'VALIDATED' ? 'verified' : 'info' }}</span>
              @if (current.status === 'VALIDATED') {
                {{ 'forms.technicalSheet.validatedBy' | translate: { name: current.validator?.name || '—', date: (current.validated_at | date: 'medium') } }}
              } @else {
                {{ 'forms.technicalSheet.draftNotice' | translate }}
              }
            </p>

            <div class="sheet-table" role="table" [attr.aria-label]="'forms.technicalSheet.title' | translate">
              <div class="sheet-row sheet-row--head" role="row">
                <span role="columnheader">{{ 'forms.technicalSheet.parameter' | translate }}</span>
                <span role="columnheader">{{ 'forms.technicalSheet.specification' | translate }}</span>
              </div>
              @for (key of parameters; track key) {
                <div class="sheet-row" role="row">
                  <label role="rowheader" class="param" [for]="'sheet-' + key">{{ 'forms.technicalSheet.params.' + key | translate }}</label>
                  <div role="cell">
                    @if (current.can_edit) {
                      <textarea
                        [id]="'sheet-' + key"
                        rows="2"
                        maxlength="3000"
                        [placeholder]="'forms.technicalSheet.placeholders.' + key | translate"
                        [ngModel]="values()[key]"
                        (ngModelChange)="update(key, $event)"
                        [disabled]="busy()"
                      ></textarea>
                    } @else {
                      <p class="readonly">{{ current[key] || '—' }}</p>
                    }
                  </div>
                </div>
              }
            </div>

            @if (current.can_edit) {
              @if (hasPlaceholders()) {
                <p class="hint hint--warning">{{ 'forms.technicalSheet.placeholderHint' | translate }}</p>
              }
              <div class="actions">
                <button type="button" class="btn btn-secondary" (click)="applyTemplate()" [disabled]="busy()">
                  <span class="material-icons" aria-hidden="true">auto_fix_high</span>
                  {{ 'forms.technicalSheet.useTemplate' | translate }}
                </button>
                <button type="button" class="btn btn-primary" (click)="save()" [disabled]="busy() || !dirty()">
                  <span class="material-icons" aria-hidden="true">save</span>
                  {{ 'forms.technicalSheet.save' | translate }}
                </button>
                @if (current.can_validate && current.status !== 'VALIDATED') {
                  <button type="button" class="btn btn-validate" (click)="validate()" [disabled]="!canValidateNow()">
                    <span class="material-icons" aria-hidden="true">verified</span>
                    {{ 'forms.technicalSheet.validate' | translate }}
                  </button>
                }
              </div>
              @if (current.can_validate && current.status !== 'VALIDATED' && !canValidateNow() && !busy()) {
                <p class="hint">{{ 'forms.technicalSheet.validateHint' | translate }}</p>
              } @else if (!current.can_validate && current.status !== 'VALIDATED') {
                <p class="hint">{{ 'forms.technicalSheet.whoValidates' | translate }}</p>
              }
            }
          } @else {
            <p class="muted">{{ 'forms.technicalSheet.loadFailed' | translate }}</p>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .sheet { border: 1px solid var(--border-color); border-radius: var(--radius-lg); background: var(--bg-primary); }
    .sheet-header {
      display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.9rem 1rem;
      border: 0; background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; font: inherit;
    }
    .sheet-header > .material-icons:first-child { color: var(--primary-text-600); }
    .sheet-heading { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .sheet-title { font-weight: 800; }
    .sheet-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .optional-tag {
      padding: 0.05rem 0.5rem; border: 1px solid var(--border-color); border-radius: 999px;
      color: var(--text-secondary); font-size: 0.72rem; font-weight: 700;
    }
    .sheet-subtitle { color: var(--text-secondary); font-size: 0.82rem; }
    .chevron { color: var(--text-secondary); }
    .status {
      flex-shrink: 0; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 800;
      background: var(--warning-bg); color: var(--warning-color-dark); border: 1px solid var(--warning-border);
    }
    .status--validated { background: var(--success-bg); color: var(--success-color-dark); border-color: var(--success-border); }
    .sheet-body { display: flex; flex-direction: column; gap: 0.85rem; padding: 0 1rem 1rem; }
    .notice {
      display: flex; align-items: flex-start; gap: 0.5rem; margin: 0; padding: 0.65rem 0.8rem; border-radius: var(--radius-md);
      background: var(--warning-bg); color: var(--text-primary); font-size: 0.88rem; line-height: 1.45;
    }
    .notice .material-icons { font-size: 1.1rem; color: var(--warning-color); }
    .notice--validated { background: var(--success-bg); }
    .notice--validated .material-icons { color: var(--success-color); }
    .sheet-table { display: flex; flex-direction: column; border-top: 2px solid var(--border-color); }
    .sheet-row {
      display: grid; grid-template-columns: minmax(150px, 0.38fr) 1fr; gap: 1rem; align-items: center;
      padding: 0.65rem 0.5rem; border-bottom: 1px solid var(--border-color);
    }
    .sheet-row--head { background: var(--hover-bg); font-weight: 800; color: var(--text-primary); font-size: 0.9rem; }
    .param { font-weight: 700; color: var(--text-primary); font-size: 0.9rem; }
    textarea {
      width: 100%; min-height: 3.2rem; resize: vertical; border: 1px solid var(--border-color); border-radius: var(--radius-md);
      background: var(--card-bg); color: var(--text-primary); font: inherit; font-size: 0.9rem; line-height: 1.45; padding: 0.55rem 0.7rem;
    }
    textarea:focus { border-color: var(--primary-500); box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.14); outline: none; }
    .readonly { margin: 0; color: var(--text-primary); line-height: 1.5; white-space: pre-line; text-align: justify; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
    .btn {
      display: inline-flex; align-items: center; gap: 0.4rem; min-height: 40px; padding: 0.6rem 1rem; border-radius: var(--radius-lg);
      font: inherit; font-weight: 700; cursor: pointer; border: 1px solid transparent;
    }
    .btn .material-icons { font-size: 1.1rem; }
    .btn:disabled { cursor: not-allowed; opacity: 0.55; }
    .btn-primary { background: var(--primary-600); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--primary-700); }
    .btn-secondary { border-color: var(--border-color); background: var(--card-bg); color: var(--text-primary); }
    .btn-secondary:hover:not(:disabled) { background: var(--hover-bg); }
    .btn-validate { background: var(--success-color); color: #fff; }
    .btn-validate:hover:not(:disabled) { background: var(--success-color-dark); }
    .hint { margin: 0; color: var(--text-secondary); font-size: 0.82rem; text-align: right; }
    .hint--warning { color: var(--warning-color-dark); }
    .muted { margin: 0; color: var(--text-secondary); }
    @media (max-width: 640px) {
      .sheet-row { grid-template-columns: 1fr; gap: 0.4rem; }
      .sheet-row--head { display: none; }
      .actions { justify-content: stretch; }
      .actions .btn { flex: 1 1 100%; justify-content: center; }
      .hint { text-align: left; }
    }
  `,
})
export class FormTechnicalSheetComponent implements OnInit {
  readonly formId = input.required<string>();

  private readonly formService = inject(FormService);
  private readonly notify = inject(NotificationService);
  private readonly i18n = inject(TranslateService);

  readonly parameters = FORM_SHEET_PARAMETERS;
  readonly expanded = signal(true);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly sheet = signal<FormTechnicalSheet | null>(null);
  readonly values = signal<SheetValues>(emptyValues());

  readonly dirty = computed(() => {
    const sheet = this.sheet();
    const values = this.values();
    return !!sheet && this.parameters.some((key) => (values[key] ?? '').trim() !== (sheet[key] ?? '').trim());
  });
  readonly complete = computed(() => this.parameters.every((key) => this.values()[key].trim() !== ''));
  readonly hasPlaceholders = computed(() => this.parameters.some((key) => PLACEHOLDER.test(this.values()[key])));
  readonly canValidateNow = computed(
    () => !this.busy() && !!this.sheet()?.id && !this.dirty() && this.complete() && !this.hasPlaceholders(),
  );

  ngOnInit(): void {
    this.formService.getFormSheet(this.formId()).subscribe({
      next: (sheet) => {
        this.apply(sheet);
        // Ficha validada: se muestra plegada para no ocupar el editor.
        this.expanded.set(sheet.status !== 'VALIDATED');
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  update(key: FormSheetParameter, value: string): void {
    this.values.update((values) => ({ ...values, [key]: value }));
  }

  /** Rellena los parámetros vacíos con el texto guía; los marcadores entre corchetes se reemplazan. */
  applyTemplate(): void {
    this.values.update((values) => {
      const next = { ...values };
      for (const key of this.parameters) {
        if (!next[key].trim()) next[key] = this.i18n.instant(`forms.technicalSheet.template.${key}`);
      }
      return next;
    });
  }

  save(): void {
    const payload = Object.fromEntries(
      this.parameters.map((key) => [key, this.values()[key].trim() || null]),
    ) as Record<FormSheetParameter, string | null>;
    this.busy.set(true);
    this.formService.saveFormSheet(this.formId(), payload).subscribe({
      next: (sheet) => {
        this.apply(sheet);
        this.busy.set(false);
        this.notify.success(this.i18n.instant('forms.technicalSheet.saved'));
      },
      error: (error) => {
        this.busy.set(false);
        this.notify.error(error?.error?.message || this.i18n.instant('forms.technicalSheet.saveFailed'));
      },
    });
  }

  validate(): void {
    if (!this.canValidateNow()) return;
    this.busy.set(true);
    this.formService.validateFormSheet(this.formId()).subscribe({
      next: (sheet) => {
        this.apply(sheet);
        this.busy.set(false);
        this.notify.success(this.i18n.instant('forms.technicalSheet.validated'));
      },
      error: (error) => {
        this.busy.set(false);
        this.notify.error(error?.error?.message || this.i18n.instant('forms.technicalSheet.validateFailed'));
      },
    });
  }

  private apply(sheet: FormTechnicalSheet): void {
    this.sheet.set(sheet);
    this.values.set(
      Object.fromEntries(this.parameters.map((key) => [key, sheet[key] ?? ''])) as SheetValues,
    );
  }
}
