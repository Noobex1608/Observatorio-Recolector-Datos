import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { FormDashboardViewModel } from '@presentation/viewmodels/form-dashboard.viewmodel';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-forms-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  providers: [FormDashboardViewModel],
})
export class DashboardComponent implements OnInit {
  readonly vm = inject(FormDashboardViewModel);

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
}
