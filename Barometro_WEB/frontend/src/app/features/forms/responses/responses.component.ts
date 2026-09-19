import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BarChartComponent } from '@presentation/components/charts/bar-chart.component';
import { PieChartComponent } from '@presentation/components/charts/pie-chart.component';
import { FormResponseRow, FormResponsesViewModel } from '@presentation/viewmodels/form-responses.viewmodel';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-form-responses',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    BarChartComponent,
    PieChartComponent,
    TranslateModule,
  ],
  templateUrl: './responses.component.html',
  styleUrl: './responses.component.scss',
  providers: [FormResponsesViewModel],
})
export class ResponsesComponent implements OnInit, OnDestroy {
  readonly vm = inject(FormResponsesViewModel);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);

  displayedColumns: string[] = [];
  selectedResponse: FormResponseRow | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    void this.vm.load(id).then(() => {
      this.displayedColumns = [...this.vm.tableColumns().map((column) => column.key), '_actions'];
    });
  }

  ngOnDestroy(): void {
    this.setImmersiveModal(false);
  }

  openResponsePreview(row: FormResponseRow): void {
    this.selectedResponse = row;
    this.setImmersiveModal(true);
  }

  closeResponsePreview(): void {
    this.selectedResponse = null;
    this.setImmersiveModal(false);
  }

  previewFields(): { key: string; label: string; value: string }[] {
    if (!this.selectedResponse) return [];
    const response = this.selectedResponse;

    return this.vm
      .tableColumns()
      .filter((column) => column.key !== '_submitted')
      .map((column) => ({
        key: column.key,
        label: column.label,
        value: response.answers[column.key] || '-',
      }));
  }

  private setImmersiveModal(isOpen: boolean): void {
    this.document.body.classList.toggle('immersive-modal-open', isOpen);
  }
}
