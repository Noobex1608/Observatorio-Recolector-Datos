import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { qrDataUrl } from '@core/utils/qr-code';
import { QualityIssueKind, reviewResponses } from '@core/utils/response-quality';

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
  private readonly i18n = inject(TranslateService);

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
      this.correctionError.set(this.i18n.instant('forms.responses.page.errors.reasonRequired'));
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
        this.correctionError.set(this.firstError(err, this.i18n.instant('forms.responses.page.errors.correct')));
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
      this.correctionError.set(this.i18n.instant('forms.responses.page.errors.voidReasonRequired'));
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
        this.correctionError.set(this.firstError(err, this.i18n.instant('forms.responses.page.errors.void')));
      },
    });
  }

  confirmReassign(): void {
    const response = this.selectedResponse;
    if (!response || this.correctionBusy()) return;
    if (!this.chosenCollector || this.panelReason.trim().length < 5) {
      this.correctionError.set(this.i18n.instant('forms.responses.page.errors.collectorRequired'));
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
        this.correctionError.set(this.firstError(err, this.i18n.instant('forms.responses.page.errors.collector')));
      },
    });
  }

  /** Texto legible de un valor del historial. */
  describeValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return this.i18n.instant('forms.responses.page.history.empty');
    if (Array.isArray(value)) return value.length ? value.join(', ') : this.i18n.instant('forms.responses.page.history.empty');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  correctionTitle(entry: ResponseCorrection): string {
    switch (entry.type) {
      case 'answer': return this.i18n.instant('forms.responses.page.history.answer', { question: entry.question });
      case 'collector': return this.i18n.instant('forms.responses.page.history.collector');
      case 'void': return this.i18n.instant('forms.responses.page.history.void');
      default: return this.i18n.instant('forms.responses.page.history.restore');
    }
  }

  private firstError(err: any, fallback: string): string {
    const errors = err?.error?.errors as Record<string, string[]> | undefined;
    const first = errors ? Object.values(errors)[0]?.[0] : null;
    return first || err?.error?.message || fallback;
  }
  qrImage: string | null = null;
  readonly linkCopied = signal(false);

  /** Enlace público solo cuando el formulario está publicado. */
  readonly publicUrl = computed(() => {
    const form = this.vm.form();
    return form?.state === 'DEPLOYED' && form.link_uuid ? this.vm.getCollectUrl(form.link_uuid) : '';
  });

  /** Recolectores ordenados por avance; la barra usa la meta o, sin meta, a quien lleva más. */
  readonly collectorRows = computed(() => {
    const shares = this.vm.shareProgress();
    const max = Math.max(0, ...shares.map((share) => share.responses_count ?? 0));
    return shares
      .map((share) => {
        const count = share.responses_count ?? 0;
        const target = share.target_responses ?? null;
        return {
          id: share.id,
          name: share.user_name || share.user_email || this.i18n.instant('forms.responses.page.userFallback'),
          role: share.role,
          count,
          target,
          complete: !!target && count >= target,
          width: target ? (share.progress ?? 0) : max > 0 ? Math.round((count / max) * 100) : 0,
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  });
  readonly activeCollectors = computed(() => this.collectorRows().filter((row) => row.count > 0).length);
  readonly hasTargets = computed(() => this.collectorRows().some((row) => !!row.target));
  /** El rol solo aporta cuando no todos tienen el mismo. */
  readonly showRoles = computed(() => new Set(this.collectorRows().map((row) => row.role)).size > 1);
  readonly lastSubmittedAt = computed(() => {
    const dates = this.vm.responses().map((row) => row.submitted_at).filter(Boolean).sort();
    return dates.at(-1) ?? null;
  });

  // ---- Filtros ----
  readonly collectorFilterOptions = computed(() => [
    ...this.vm.shares()
      .map((share) => ({ value: String(share.user_id), label: share.user_name || share.user?.name || share.user_email || 'forms.responses.page.userFallback' }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    { value: 'public', label: 'forms.responses.page.filters.publicOption' },
  ]);

  setFilter(field: 'from' | 'to' | 'collector', value: string): void {
    this.showAllIssues.set(false);
    this.qualityKind.set(null);
    this.selectedPointKey.set(null);
    void this.vm.applyFilters({ ...this.vm.filters(), [field]: value ?? '' });
  }

  clearFilters(): void {
    this.showAllIssues.set(false);
    this.qualityKind.set(null);
    this.selectedPointKey.set(null);
    void this.vm.applyFilters({ from: '', to: '', collector: '' });
  }

  // ---- Calidad de los datos ----
  readonly qualityKinds: { id: QualityIssueKind; label: string }[] = [
    { id: 'outside', label: 'forms.responses.page.quality.kinds.outside' },
    { id: 'accuracy', label: 'forms.responses.page.quality.kinds.accuracy' },
    { id: 'duplicate', label: 'forms.responses.page.quality.kinds.duplicate' },
  ];
  readonly qualityKind = signal<QualityIssueKind | null>(null);
  readonly showAllIssues = signal(false);
  readonly qualityIssues = computed(() => reviewResponses(
    this.vm.responses(),
    this.vm.questions().filter((question) => question.type === 'GPS').map((question) => question.id),
    this.vm.gpsZones(),
  ));
  readonly filteredIssues = computed(() => {
    const kind = this.qualityKind();
    return kind ? this.qualityIssues().filter((issue) => issue.kind === kind) : this.qualityIssues();
  });
  readonly visibleIssues = computed(() => (this.showAllIssues() ? this.filteredIssues() : this.filteredIssues().slice(0, 5)));

  qualityCount(kind: QualityIssueKind): number {
    return this.qualityIssues().filter((issue) => issue.kind === kind).length;
  }

  qualityIcon(kind: QualityIssueKind): string {
    return kind === 'outside' ? 'wrong_location' : kind === 'accuracy' ? 'gps_not_fixed' : 'content_copy';
  }

  // ---- Mapa GPS: lista y marcadores vinculados ----
  readonly selectedPointKey = signal<string | null>(null);
  readonly hasManyGpsQuestions = computed(() => new Set(this.vm.gpsPoints().map((point) => point.question)).size > 1);

  selectPoint(key: string): void {
    this.selectedPointKey.set(key);
    this.document.getElementById(`gps-point-${key}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  openResponseById(responseId: string): void {
    const row = this.vm.responses().find((item) => item.id === responseId);
    if (row) this.openResponsePreview(row);
  }

  toggleQr(): void {
    if (this.qrImage) { this.qrImage = null; return; }
    const url = this.publicUrl();
    if (url) this.qrImage = qrDataUrl(url);
  }

  copyLink(): void {
    const url = this.publicUrl();
    if (!url || !navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(
      () => {
        this.linkCopied.set(true);
        setTimeout(() => this.linkCopied.set(false), 2000);
      },
      () => this.notify.error(this.i18n.instant('forms.responses.page.errors.copy')),
    );
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
