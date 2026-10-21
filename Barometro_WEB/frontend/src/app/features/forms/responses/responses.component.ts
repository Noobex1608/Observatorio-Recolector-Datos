import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormQuestion } from '@core/services/form.service';
import { PieChartComponent } from '@presentation/components/charts/pie-chart.component';
import { GpsResultsMapComponent } from './gps-results-map.component';
import { FormResponseRow, FormResponsesViewModel } from '@presentation/viewmodels/form-responses.viewmodel';
import { AnswerViewerComponent } from '@shared/components/answer-viewer/answer-viewer.component';
import { TranslateModule } from '@ngx-translate/core';
import { qrDataUrl } from '@core/utils/qr-code';

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
    PieChartComponent,
    GpsResultsMapComponent,
    AnswerViewerComponent,
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
  qrImage: string | null = null;
  collectUrl = '';

  showQr(): void {
    const link = this.vm.form()?.link_uuid;
    if (!link) return;
    this.collectUrl = this.vm.getCollectUrl(link);
    this.qrImage = qrDataUrl(this.collectUrl);
  }

  downloadQr(): void {
    if (!this.qrImage) return;
    const anchor = document.createElement('a');
    anchor.href = this.qrImage;
    anchor.download = `qr-encuesta-${this.vm.formId()}.png`;
    anchor.click();
  }

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

  previewFields(): { key: string; label: string; value: string; rawValue: any; question: FormQuestion | undefined }[] {
    if (!this.selectedResponse) return [];
    const response = this.selectedResponse;

    return this.vm
      .tableColumns()
      .filter((column) => column.key !== '_submitted')
      .map((column) => ({
        key: column.key,
        label: column.label,
        value: response.answers[column.key] || '-',
        rawValue: response.rawAnswers?.[column.key],
        question: this.vm.getQuestionById(column.key),
      }));
  }

  private setImmersiveModal(isOpen: boolean): void {
    this.document.body.classList.toggle('immersive-modal-open', isOpen);
  }
}
