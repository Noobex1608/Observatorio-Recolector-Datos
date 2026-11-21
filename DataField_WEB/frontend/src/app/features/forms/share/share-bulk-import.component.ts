import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormService, ShareCredential, ShareImportRow } from '@core/services/form.service';

/** Resultado de una importación confirmada: mensaje para el modal y contraseñas temporales, si las hubo. */
export interface ShareBulkResult {
  notice: string;
  credentials: ShareCredential[];
}

/**
 * «Compartir formulario» con varias personas desde Excel (.xlsx o .xls): plantilla, vista previa
 * con errores por fila y asignación de todo o nada. Las personas sin cuenta se crean, reciben el
 * correo de confirmación y entran al equipo del proyecto.
 */
@Component({
  standalone: true,
  selector: 'app-share-bulk-import',
  imports: [TranslateModule],
  templateUrl: './share-bulk-import.component.html',
  styleUrl: './share-bulk-import.component.scss',
})
export class ShareBulkImportComponent {
  readonly formId = input.required<string>();
  /** Antes de leer un archivo nuevo: el modal limpia sus avisos. */
  readonly started = output<void>();
  readonly imported = output<ShareBulkResult>();

  private readonly formService = inject(FormService);
  private readonly i18n = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  readonly file = signal<File | null>(null);
  readonly rows = signal<ShareImportRow[]>([]);
  readonly valid = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly errorCount = computed(() => this.rows().filter((row) => row.errors.length > 0).length);
  readonly newCount = computed(() => this.rows().filter((row) => row.status === 'nuevo').length);

  downloadTemplate(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.formService.getShareTemplate(this.formId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = this.document.createElement('a');
        link.href = url;
        link.download = this.i18n.instant('forms.builder.page.share.bulk.templateFile');
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.error.set(this.i18n.instant('forms.builder.page.share.bulk.templateFailed'));
      },
    });
  }

  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clear();
    this.started.emit();
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      this.error.set(this.i18n.instant('forms.builder.page.share.bulk.wrongType'));
      return;
    }
    this.file.set(file);
    this.busy.set(true);
    this.formService.importShares(this.formId(), file, true).subscribe({
      next: (result) => {
        this.rows.set(result.rows ?? []);
        this.valid.set(!!result.valid);
        this.busy.set(false);
      },
      error: (err) => {
        this.file.set(null);
        this.busy.set(false);
        this.error.set(err?.error?.message || this.i18n.instant('forms.builder.page.share.bulk.readFailed'));
      },
    });
  }

  confirm(): void {
    const file = this.file();
    if (!file || !this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.formService.importShares(this.formId(), file, false).subscribe({
      next: (result) => {
        this.clear();
        const parts = [this.i18n.instant('forms.builder.page.share.bulk.done', { count: result.imported ?? 0 })];
        if (result.created) parts.push(this.i18n.instant('forms.builder.page.share.bulk.created', { count: result.created }));
        if (result.invited?.length) parts.push(this.i18n.instant('forms.builder.page.share.bulk.invited', { count: result.invited.length }));
        this.imported.emit({ notice: parts.join(' '), credentials: result.credentials ?? [] });
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message || this.i18n.instant('forms.builder.page.share.bulk.importFailed'));
      },
    });
  }

  clear(): void {
    this.file.set(null);
    this.rows.set([]);
    this.valid.set(false);
    this.busy.set(false);
    this.error.set('');
  }

  statusLabel(row: ShareImportRow): string {
    return this.i18n.instant(`forms.builder.page.share.bulk.status.${row.status}`);
  }

  roleLabel(role: string): string {
    if (role === 'PROJECT') return this.i18n.instant('forms.builder.page.share.projectManager');
    if (role === 'RECOLECTOR') return this.i18n.instant('forms.builder.page.share.collector');
    return role || '—';
  }
}
