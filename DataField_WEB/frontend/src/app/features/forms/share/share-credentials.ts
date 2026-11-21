import { TranslateService } from '@ngx-translate/core';
import { ShareCredential } from '@core/services/form.service';

/**
 * Descarga en CSV las contraseñas temporales de las cuentas nuevas (solo institucionales mientras
 * Microsoft 365 no está configurado). Los valores que empiezan con = + - @ se neutralizan para Excel.
 */
export function downloadShareCredentials(document: Document, i18n: TranslateService, credentials: ShareCredential[]): void {
  const header = ['name', 'email', 'password'].map((key) => i18n.instant(`forms.builder.page.share.credentials.${key}`));
  const rows = [header, ...credentials.map((item) => [item.name, item.email, item.password])];
  const csv = '﻿' + rows.map((row) => row.map((value) => {
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = i18n.instant('forms.builder.page.share.credentials.file');
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
