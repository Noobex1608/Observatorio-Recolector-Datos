import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@core/services/auth.service';
import { CollectorOption, DataCenterService, ResponseCorrection } from '@core/services/data-center.service';
import { NotificationService } from '@core/services/notification.service';
import { allowedOptions, choiceFilterOf } from '@core/utils/choice-filter';
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
    A11yModule,
    CommonModule,
    FormsModule,
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

  private readonly auth = inject(AuthService);
  private readonly dataCenter = inject(DataCenterService);
  private readonly notify = inject(NotificationService);

  displayedColumns: string[] = [];
  selectedResponse: FormResponseRow | null = null;

  // ---- Correcciones (solo superadministrador; Centro de datos) ----
  readonly isSuperAdmin = this.auth.isSuperAdmin;
  /** Tipos que se corrigen con un valor simple (igual que el backend). */
  private readonly editableTypes = new Set(['TEXT', 'NUMBER', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DATE', 'TIME', 'DATETIME', 'RATING', 'BARCODE']);
  readonly editingField = signal<string | null>(null);
  editValue: any = null;
  editReason = '';
  readonly correctionBusy = signal(false);
  readonly correctionError = signal('');
  readonly panel = signal<'void' | 'collector' | null>(null);
  panelReason = '';
  readonly collectorOptions = signal<CollectorOption[]>([]);
  chosenCollector: number | null = null;

  canCorrect(question: FormQuestion | undefined): boolean {
    return !!question && this.isSuperAdmin() && this.editableTypes.has(question.type);
  }

  startEdit(field: { key: string; rawValue: any }): void {
    this.editingField.set(field.key);
    this.editValue = Array.isArray(field.rawValue) ? [...field.rawValue] : (field.rawValue ?? null);
    this.editReason = '';
    this.correctionError.set('');
    this.panel.set(null);
  }

  cancelEdit(): void {
    this.editingField.set(null);
    this.correctionError.set('');
  }

  /** Opciones de una pregunta de opciones; si es en cascada, las que corresponden a la respuesta actual. */
  correctionOptions(question: FormQuestion): string[] {
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    const filter = choiceFilterOf(question.properties);
    return filter ? allowedOptions(options, filter, this.selectedResponse?.rawAnswers?.[filter.question_id]) : options;
  }

  toggleEditOption(option: string, checked: boolean): void {
    const current: string[] = Array.isArray(this.editValue) ? this.editValue : [];
    this.editValue = checked ? [...current.filter((item) => item !== option), option] : current.filter((item) => item !== option);
  }

  saveEdit(question: FormQuestion): void {
    const response = this.selectedResponse;
    if (!response || this.correctionBusy()) return;
    if (this.editReason.trim().length < 5) {
      this.correctionError.set('Escribe el motivo de la corrección (al menos 5 caracteres).');
      return;
    }
    let value = this.editValue;
    if (question.type === 'NUMBER' || question.type === 'RATING') value = value === '' || value === null ? null : Number(value);
    this.correctionBusy.set(true);
    this.dataCenter.correctAnswer(response.id, question.id, value, this.editReason.trim()).subscribe({
      next: (result) => {
        this.selectedResponse = this.vm.replaceResponse(result.data);
        this.editingField.set(null);
        this.correctionBusy.set(false);
        const cleared = result.data.corrections?.at(-1)?.cleared ?? [];
        this.notify.success(cleared.length > 0
          ? `Respuesta corregida. Se vaciaron por depender de ella: ${cleared.map((item) => item.question).join(', ')}.`
          : result.message);
      },
      error: (err) => {
        this.correctionBusy.set(false);
        this.correctionError.set(this.firstError(err, 'No se pudo corregir la respuesta.'));
      },
    });
  }

  openPanel(panel: 'void' | 'collector'): void {
    this.panel.set(this.panel() === panel ? null : panel);
    this.panelReason = '';
    this.correctionError.set('');
    this.editingField.set(null);
    if (panel === 'collector' && this.selectedResponse) {
      this.chosenCollector = null;
      this.dataCenter.collectors(this.selectedResponse.id).subscribe({
        next: (result) => this.collectorOptions.set(result.data.filter((user) => user.id !== this.selectedResponse?.user_id)),
        error: () => this.collectorOptions.set([]),
      });
    }
  }

  confirmVoid(): void {
    const response = this.selectedResponse;
    if (!response || this.correctionBusy()) return;
    if (this.panelReason.trim().length < 5) {
      this.correctionError.set('Escribe el motivo de la anulación (al menos 5 caracteres).');
      return;
    }
    this.correctionBusy.set(true);
    this.dataCenter.voidResponse(response.id, this.panelReason.trim()).subscribe({
      next: (result) => {
        this.correctionBusy.set(false);
        this.panel.set(null);
        this.closeResponsePreview();
        this.notify.success(result.message);
        // Totales y estadísticas del servidor ya no la cuentan.
        const formId = this.vm.formId();
        if (formId) void this.vm.load(formId);
      },
      error: (err) => {
        this.correctionBusy.set(false);
        this.correctionError.set(this.firstError(err, 'No se pudo anular la respuesta.'));
      },
    });
  }

  confirmReassign(): void {
    const response = this.selectedResponse;
    if (!response || this.correctionBusy()) return;
    if (!this.chosenCollector || this.panelReason.trim().length < 5) {
      this.correctionError.set('Elige el encuestador y escribe el motivo (al menos 5 caracteres).');
      return;
    }
    this.correctionBusy.set(true);
    this.dataCenter.reassignCollector(response.id, this.chosenCollector, this.panelReason.trim()).subscribe({
      next: (result) => {
        this.selectedResponse = this.vm.replaceResponse(result.data);
        this.correctionBusy.set(false);
        this.panel.set(null);
        this.notify.success(result.message);
      },
      error: (err) => {
        this.correctionBusy.set(false);
        this.correctionError.set(this.firstError(err, 'No se pudo cambiar el encuestador.'));
      },
    });
  }

  /** Texto legible de un valor del historial. */
  describeValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '(vacío)';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '(vacío)';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  correctionTitle(entry: ResponseCorrection): string {
    switch (entry.type) {
      case 'answer': return `Corrigió «${entry.question}»`;
      case 'collector': return 'Cambió el encuestador';
      case 'void': return 'Anuló la respuesta';
      default: return 'Restauró la respuesta';
    }
  }

  private firstError(err: any, fallback: string): string {
    const errors = err?.error?.errors as Record<string, string[]> | undefined;
    const first = errors ? Object.values(errors)[0]?.[0] : null;
    return first || err?.error?.message || fallback;
  }
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
    this.editingField.set(null);
    this.panel.set(null);
    this.correctionError.set('');
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
