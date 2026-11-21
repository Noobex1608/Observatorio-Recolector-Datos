import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { FormDashboardViewModel } from '@presentation/viewmodels/form-dashboard.viewmodel';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ShareBulkImportComponent } from '../share/share-bulk-import.component';
import { downloadShareCredentials } from '../share/share-credentials';

@Component({
  selector: 'app-forms-dashboard',
  standalone: true,
  imports: [
    A11yModule,
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    TranslateModule,
    ShareBulkImportComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss', '../share/share-modal.scss'],
  providers: [FormDashboardViewModel],
})
export class DashboardComponent implements OnInit {
  readonly vm = inject(FormDashboardViewModel);
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(TranslateService);

  readonly tabs = [
    { key: 'DRAFT' as const, labelKey: 'forms.dashboard.tabs.DRAFT', icon: 'edit_note' },
    { key: 'DEPLOYED' as const, labelKey: 'forms.dashboard.tabs.DEPLOYED', icon: 'cloud_done' },
    { key: 'ARCHIVED' as const, labelKey: 'forms.dashboard.tabs.ARCHIVED', icon: 'inventory_2' },
  ];

  ngOnInit(): void {
    void this.vm.loadForms();
  }

  async copyLink(): Promise<void> {
    const link = this.vm.linkUrl();
    if (!link) return;

    await navigator.clipboard.writeText(link);
  }

  /** Contraseñas temporales de cuentas institucionales nuevas (solo sin Microsoft 365): se descargan una vez. */
  downloadShareCredentials(): void {
    downloadShareCredentials(this.document, this.i18n, this.vm.takeShareCredentials());
  }
}
