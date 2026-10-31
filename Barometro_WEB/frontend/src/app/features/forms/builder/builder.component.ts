import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, computed, effect, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormQuestion, FormShare, FormService, XlsFormImportPreview } from '@core/services/form.service';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { UserService } from '@core/services/user.service';
import { User } from '@core/models/user/user.interface';
import { FormBuilderViewModel, FormQuestionDraft, FormQuestionTreeEntry, QuestionInsertTarget } from '@presentation/viewmodels/form-builder.viewmodel';
import { ProjectService } from '@core/services/project.service';
import { TranslateModule } from '@ngx-translate/core';
import { TEXT_FORMATS, TextFormat, textFormatInput } from '@core/utils/text-format';

type PreviewMode = 'mobile' | 'web';
/** Clave de la sección «Sin sección» en los conjuntos de estado de la vista. */
const NO_SECTION = '__none__';
type PreviewQuestion = FormQuestionDraft & { displayLabel: string };

@Component({
  selector: 'app-builder',
  standalone: true,
  imports: [A11yModule, CommonModule, FormsModule, RouterLink, TranslateModule],
  templateUrl: './builder.component.html',
  styleUrls: ['./builder.component.scss', './builder-tools.component.scss'],
  providers: [FormBuilderViewModel],
})
export class BuilderComponent implements OnInit, OnDestroy {
  readonly vm = inject(FormBuilderViewModel);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly formService = inject(FormService);
  readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly document = inject(DOCUMENT);
  private readonly notify = inject(NotificationService);
  readonly previewMode = signal<PreviewMode>('mobile');
  readonly delimitNow = signal(false);
  readonly canDelimitAfterSave = computed(() => {
    const projectId = this.vm.projectId();
    const userId = this.authService.user()?.id;
    const project = this.vm.projects().find((item) => item.id === projectId);
    return !!userId && !!project?.leaders?.some((leader) => leader.id === userId);
  });
  readonly previewModalOpen = signal(false);
  readonly draggedQuestionTempId = signal<string | null>(null);
  readonly dropTargetTempId = signal<string | null>(null);
  readonly dropPosition = signal<'before' | 'after'>('after');
  readonly previewSummaryQuestions = computed(() =>
    this.toPreviewQuestions(this.vm.questions().slice(0, 3)),
  );
  readonly hiddenPreviewQuestions = computed(() =>
    Math.max(this.vm.questionsCount() - this.previewSummaryQuestions().length, 0),
  );
  readonly modalPreviewQuestions = computed(() => {
    if (!this.previewModalOpen()) return [];

    const questions = this.vm.questions();
    const visibleQuestions = this.vm.stepByStep() && this.previewMode() === 'mobile'
      ? questions.slice(0, 1)
      : questions;

    return this.toPreviewQuestions(visibleQuestions);
  });

  // --- Estado de la vista para formularios largos ---
  readonly noSection = NO_SECTION;
  /** Preguntas abiertas (las demás se muestran en una sola línea). */
  readonly expandedQuestions = signal<ReadonlySet<string>>(new Set());
  /** Secciones contraídas (clave NO_SECTION para «Sin sección»). */
  readonly collapsedSections = signal<ReadonlySet<string>>(new Set());
  /** Menú de «Agregar pregunta» abierto: 'palette', 'section:<id>' o 'after:<id>'. */
  readonly openAddMenu = signal<string | null>(null);
  /** Sección donde el botón principal agrega preguntas (null = la última sección). */
  readonly paletteSection = signal<string | null>(null);
  /** Pregunta con el panel «Pegar lista» abierto y qué se pega (opciones o filas Likert). */
  readonly pasteTarget = signal<{ tempId: string; kind: 'options' | 'rows' } | null>(null);
  pasteText = '';
  /** Mensaje para lectores de pantalla (región aria-live). */
  readonly announcement = signal('');
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Importar / exportar Excel (XLSForm) ---
  readonly importPreview = signal<XlsFormImportPreview | null>(null);
  readonly importFileName = signal('');
  readonly importBusy = signal(false);
  readonly importError = signal('');
  readonly importMode = signal<'append' | 'replace'>('append');
  readonly excelBusy = signal(false);

  readonly paletteTargetSection = computed<string>(() => {
    const chosen = this.paletteSection();
    const sections = this.vm.sections();
    if (chosen === NO_SECTION) return NO_SECTION;
    if (chosen && sections.some((section) => section.tempId === chosen)) return chosen;
    return sections[sections.length - 1]?.tempId ?? NO_SECTION;
  });

  private readonly undoAutoDismiss = effect(() => {
    const state = this.vm.undoState();
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = state ? setTimeout(() => this.vm.dismissUndo(), 12000) : null;
  });

  readonly textFormats = TEXT_FORMATS;
  readonly textFormatInput = textFormatInput;

  readonly questionTypes: Array<{
    value: FormQuestion['type'];
    labelKey: string;
    hintKey: string;
    icon: string;
  }> = [
    {
      value: 'SINGLE_CHOICE',
      labelKey: 'forms.builder.types.SINGLE_CHOICE',
      hintKey: 'forms.builder.hints.SINGLE_CHOICE',
      icon: 'radio_button_checked',
    },
    {
      value: 'MULTIPLE_CHOICE',
      labelKey: 'forms.builder.types.MULTIPLE_CHOICE',
      hintKey: 'forms.builder.hints.MULTIPLE_CHOICE',
      icon: 'checklist',
    },
    {
      value: 'LIKERT',
      labelKey: 'forms.builder.types.LIKERT',
      hintKey: 'forms.builder.hints.LIKERT',
      icon: 'linear_scale',
    },
    {
      value: 'TEXT',
      labelKey: 'forms.builder.types.TEXT',
      hintKey: 'forms.builder.hints.TEXT',
      icon: 'short_text',
    },
    {
      value: 'NUMBER',
      labelKey: 'forms.builder.types.NUMBER',
      hintKey: 'forms.builder.hints.NUMBER',
      icon: 'tag',
    },
    {
      value: 'NOTE',
      labelKey: 'forms.builder.types.NOTE',
      hintKey: 'forms.builder.hints.NOTE',
      icon: 'info',
    },
    {
      value: 'DATE',
      labelKey: 'forms.builder.types.DATE',
      hintKey: 'forms.builder.hints.DATE',
      icon: 'calendar_today',
    },
    {
      value: 'TIME',
      labelKey: 'forms.builder.types.TIME',
      hintKey: 'forms.builder.hints.TIME',
      icon: 'schedule',
    },
    {
      value: 'DATETIME',
      labelKey: 'forms.builder.types.DATETIME',
      hintKey: 'forms.builder.hints.DATETIME',
      icon: 'event_repeat',
    },
    {
      value: 'MULTIMEDIA',
      labelKey: 'forms.builder.types.MULTIMEDIA',
      hintKey: 'forms.builder.hints.MULTIMEDIA',
      icon: 'perm_media',
    },
    {
      value: 'SIGNATURE',
      labelKey: 'forms.builder.types.SIGNATURE',
      hintKey: 'forms.builder.hints.SIGNATURE',
      icon: 'draw',
    },
    {
      value: 'RANKING',
      labelKey: 'forms.builder.types.RANKING',
      hintKey: 'forms.builder.hints.RANKING',
      icon: 'format_list_numbered',
    },
    {
      value: 'RATING',
      labelKey: 'forms.builder.types.RATING',
      hintKey: 'forms.builder.hints.RATING',
      icon: 'star',
    },
    {
      value: 'BARCODE',
      labelKey: 'forms.builder.types.BARCODE',
      hintKey: 'forms.builder.hints.BARCODE',
      icon: 'qr_code_scanner',
    },
    {
      value: 'CALCULATE',
      labelKey: 'forms.builder.types.CALCULATE',
      hintKey: 'forms.builder.hints.CALCULATE',
      icon: 'calculate',
    },
  ];

  // --- Share modal state ---
  shareModalOpen = false;
  users = signal<User[]>([]);
  shares = signal<FormShare[]>([]);
  loadingShares = false;
  addingShare = false;
  shareError = '';
  shareEmail = '';
  shareRole: 'PROJECT' | 'RECOLECTOR' = 'RECOLECTOR';
  shareTarget: number | null = null;
  editingShareId: string | null = null;
  editTargetValue: number | null = null;
  savingTarget = false;
  matchedUser: User | null = null;
  lookingUpUser = false;
  private usersCache: User[] | null = null;
  private lookupTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    void this.vm.loadProjects();

    const formId = this.route.snapshot.paramMap.get('id');
    if (formId) {
      this.projectService.getFormTechnicalSheet(formId).subscribe({
        next: (sheet) => {
          if (sheet.status === 'VALIDATED') void this.vm.loadForm(formId);
          else this.formService.getForm(formId).subscribe({
            next: (form) => { void this.router.navigate(['/admin/proyectos'], { queryParams: { project: form.project_id, form: formId, tab: 'sheet' } }); },
            error: () => { void this.router.navigate(['/admin/proyectos']); },
          });
        },
        error: () => { void this.router.navigate(['/admin/proyectos']); },
      });
    } else {
      void this.router.navigate(['/admin/proyectos']);
    }
  }

  async saveAndContinue(): Promise<void> {
    if (this.vm.isSaving()) return;

    await this.vm.saveForm();
    if (!this.vm.errorMessage() && this.delimitNow() && this.canDelimitAfterSave() && this.vm.formId()) {
      await this.router.navigate(['/admin/proyectos'], { queryParams: { project: this.vm.projectId(), form: this.vm.formId(), tab: 'zones' } });
    }
  }

  ngOnDestroy(): void {
    this.setPreviewShell(false);
    if (this.undoTimer) clearTimeout(this.undoTimer);
  }

  /** Avisa antes de cerrar o recargar la pestaña con cambios sin guardar. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.vm.isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  /** Cierra el menú de agregar pregunta al hacer clic fuera de él. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const key = this.openAddMenu();
    const target = event.target as Node | null;
    if (!key || !target) return;
    const menu = this.document.getElementById(`add-menu-${key}`);
    const trigger = this.document.getElementById(`add-trigger-${key}`);
    if (menu?.contains(target) || trigger?.contains(target)) return;
    this.openAddMenu.set(null);
  }

  /** Usado por el guard de ruta: confirma antes de salir del constructor con cambios sin guardar. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.vm.isDirty()) return true;
    return this.notify.confirm({
      title: 'Cambios sin guardar',
      message: 'Hay cambios sin guardar en este formulario. Si sales ahora se perderán.',
      confirmText: 'Salir sin guardar',
      cancelText: 'Seguir editando',
      tone: 'danger',
    });
  }

  // --- Contraer / expandir ---

  isExpanded(tempId: string): boolean {
    return this.expandedQuestions().has(tempId);
  }

  toggleQuestion(tempId: string): void {
    this.expandedQuestions.update((set) => {
      const next = new Set(set);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  }

  expandAll(): void {
    this.expandedQuestions.set(new Set(this.vm.questions().map((question) => question.tempId)));
    this.collapsedSections.set(new Set());
    this.announce('Todas las preguntas están abiertas.');
  }

  collapseAll(): void {
    this.expandedQuestions.set(new Set());
    this.announce('Todas las preguntas están contraídas.');
  }

  sectionKey(sectionTempId: string | null): string {
    return sectionTempId ?? NO_SECTION;
  }

  isSectionCollapsed(sectionTempId: string | null): boolean {
    return this.collapsedSections().has(this.sectionKey(sectionTempId));
  }

  toggleSection(sectionTempId: string | null): void {
    const key = this.sectionKey(sectionTempId);
    this.collapsedSections.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  sectionIncompleteCount(sectionTempId: string | null): number {
    const incomplete = this.vm.incompleteQuestionIds();
    return this.vm.questions().filter((question) => question.sectionTempId === sectionTempId && incomplete.has(question.tempId)).length;
  }

  questionSummary(entry: FormQuestionTreeEntry): string {
    const question = entry.question;
    const parts: string[] = [];
    if (question.type !== 'NOTE') parts.push(question.required ? 'Obligatoria' : 'Opcional');
    if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RANKING'].includes(question.type)) {
      const count = question.options.filter((option) => option.trim()).length;
      parts.push(`${count} ${count === 1 ? 'opción' : 'opciones'}`);
    }
    if (question.type === 'LIKERT') parts.push(`${question.likertRows.length} × ${question.likertColumns.length}`);
    if (question.branchRules.some((rule) => rule.action !== 'CONTINUE')) parts.push('Con saltos');
    if (question.properties?.text_format) {
      parts.push(this.textFormats.find((format) => format.value === question.properties.text_format)?.label ?? '');
    }
    return parts.filter(Boolean).join(' · ');
  }

  // --- Índice de secciones ---

  goToSection(sectionTempId: string | null): void {
    const key = this.sectionKey(sectionTempId);
    if (this.isSectionCollapsed(sectionTempId)) this.toggleSection(sectionTempId);
    setTimeout(() => {
      const heading = this.document.getElementById(`section-toggle-${key}`);
      heading?.scrollIntoView({ behavior: this.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      heading?.focus({ preventScroll: true });
    });
  }

  addSection(): void {
    const tempId = this.vm.addSection();
    if (!tempId) return;
    this.announce('Sección agregada al final del formulario.');
    this.focusWhenRendered(`section-title-${tempId}`);
  }

  moveSection(sectionTempId: string, direction: -1 | 1): void {
    if (!this.vm.moveSection(sectionTempId, direction)) return;
    const position = this.vm.sections().findIndex((section) => section.tempId === sectionTempId) + 1;
    this.announce(`Sección movida a la posición ${position} de ${this.vm.sections().length}.`);
    this.focusWhenRendered(`section-move-${direction < 0 ? 'up' : 'down'}-${sectionTempId}`, `section-toggle-${sectionTempId}`);
  }

  removeSection(sectionTempId: string): void {
    this.vm.removeSection(sectionTempId);
    this.focusWhenRendered('undo-button');
  }

  // --- Agregar preguntas ---

  toggleAddMenu(key: string): void {
    this.openAddMenu.update((current) => current === key ? null : key);
    if (this.openAddMenu() === key) this.focusWhenRendered(`add-menu-${key}-first`);
  }

  closeAddMenu(returnFocus = true): void {
    const key = this.openAddMenu();
    this.openAddMenu.set(null);
    if (key && returnFocus) this.focusWhenRendered(`add-trigger-${key}`);
  }

  /** Crea la pregunta según el menú abierto y deja el cursor en su enunciado. */
  addFromMenu(type: FormQuestion['type'], format?: TextFormat): void {
    const key = this.openAddMenu() ?? 'palette';
    const target = this.menuTarget(key);
    const tempId = format ? this.vm.addTextQuestion(format, target) : this.vm.addQuestion(type, target);
    this.openAddMenu.set(null);
    if (!tempId) return;

    const sectionTempId = this.vm.questions().find((question) => question.tempId === tempId)?.sectionTempId ?? null;
    if (this.isSectionCollapsed(sectionTempId)) this.toggleSection(sectionTempId);
    this.expandedQuestions.update((set) => new Set(set).add(tempId));
    this.announce(`Pregunta agregada en ${this.sectionName(sectionTempId)}.`);
    this.focusWhenRendered(`q-label-${tempId}`, undefined, true);
  }

  addSubquestion(parentTempId: string): void {
    const tempId = this.vm.addSubquestion(parentTempId);
    if (!tempId) return;
    this.expandedQuestions.update((set) => new Set(set).add(tempId));
    this.announce('Subpregunta agregada.');
    this.focusWhenRendered(`q-label-${tempId}`, undefined, true);
  }

  duplicateQuestion(tempId: string): void {
    const copyId = this.vm.duplicateQuestion(tempId);
    if (!copyId) return;
    this.expandedQuestions.update((set) => new Set(set).add(copyId));
    this.announce('Pregunta duplicada debajo de la original.');
    this.focusWhenRendered(`q-label-${copyId}`, undefined, true);
  }

  moveQuestion(entry: FormQuestionTreeEntry, direction: -1 | 1): void {
    const tempId = entry.question.tempId;
    if (!this.vm.moveQuestion(tempId, direction)) return;
    const moved = this.vm.getQuestionTreeForSection(entry.question.sectionTempId).find((item) => item.question.tempId === tempId);
    this.announce(`Pregunta movida a la posición ${moved?.displayNumber ?? ''}.`);
    this.focusWhenRendered(`q-move-${direction < 0 ? 'up' : 'down'}-${tempId}`, `q-toggle-${tempId}`);
  }

  removeQuestion(tempId: string): void {
    this.vm.removeQuestion(tempId);
    this.expandedQuestions.update((set) => {
      const next = new Set(set);
      next.delete(tempId);
      return next;
    });
    this.focusWhenRendered('undo-button');
  }

  undo(): void {
    this.vm.undo();
    this.announce('Se deshizo la eliminación.');
  }

  sectionName(sectionTempId: string | null): string {
    if (!sectionTempId) return '«Sin sección»';
    const section = this.vm.sections().find((item) => item.tempId === sectionTempId);
    return `«${section?.title.trim() || 'Sección sin título'}»`;
  }

  // --- Excel (XLSForm) ---

  chooseImportFile(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  onImportFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importFileName.set(file.name);
    this.importError.set('');
    this.importPreview.set(null);
    this.importBusy.set(true);
    this.importMode.set(this.vm.questions().length === 0 ? 'replace' : 'append');
    this.formService.previewImport(file).subscribe({
      next: (preview) => {
        this.importPreview.set(preview);
        this.importBusy.set(false);
      },
      error: (err) => {
        this.importBusy.set(false);
        this.importError.set(err?.error?.errors?.file?.[0] || err?.error?.message || 'No se pudo revisar el archivo.');
        this.importPreview.set({
          title: null, sections: [], questions: [], warnings: [], valid: false,
          summary: { sections: 0, questions: 0 },
          errors: [{ row: 0, sheet: 'archivo', message: this.importError() }],
        });
      },
    });
  }

  closeImport(): void {
    this.importPreview.set(null);
    this.importBusy.set(false);
    this.focusWhenRendered('import-excel-button');
  }

  applyImport(): void {
    const preview = this.importPreview();
    if (!preview?.valid) return;
    const ids = this.vm.importQuestions(preview, this.importMode());
    this.importPreview.set(null);
    if (ids.length === 0) return;
    this.expandedQuestions.set(new Set());
    this.collapsedSections.set(new Set());
    this.announce(`Se cargaron ${ids.length} preguntas desde el Excel. Revísalas y guarda el formulario.`);
    this.focusWhenRendered(`q-toggle-${ids[0]}`, undefined, true);
  }

  downloadTemplate(format: 'simple' | 'xlsform' = 'simple'): void {
    this.downloadExcel(this.formService.downloadImportTemplate(format),
      format === 'xlsform' ? 'plantilla-encuesta-xlsform.xlsx' : 'plantilla-encuesta.xlsx');
  }

  exportInstrument(format: 'simple' | 'xlsform' = 'simple'): void {
    const formId = this.vm.formId();
    if (!formId) return;
    const name = (this.vm.title().trim() || 'formulario').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toLowerCase() || 'formulario';
    this.downloadExcel(this.formService.exportInstrument(formId, format), `${name}${format === 'xlsform' ? '-xlsform' : ''}.xlsx`);
  }

  issueLocation(issue: { row: number; sheet: string }): string {
    return issue.row > 0 ? `Hoja ${issue.sheet}, fila ${issue.row}` : (issue.sheet === 'archivo' ? 'Archivo' : `Hoja ${issue.sheet}`);
  }

  private downloadExcel(request: import('rxjs').Observable<Blob>, fileName: string): void {
    if (this.excelBusy()) return;
    this.excelBusy.set(true);
    request.subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = this.document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.excelBusy.set(false);
        this.announce(`Descarga lista: ${fileName}.`);
      },
      error: () => {
        this.excelBusy.set(false);
        this.vm.errorMessage.set('No se pudo descargar el archivo de Excel.');
      },
    });
  }

  // --- Pegar lista de opciones ---

  openPaste(tempId: string, kind: 'options' | 'rows'): void {
    this.pasteText = '';
    this.pasteTarget.set({ tempId, kind });
    this.focusWhenRendered(`paste-${tempId}`);
  }

  cancelPaste(): void {
    const target = this.pasteTarget();
    this.pasteTarget.set(null);
    if (target) this.focusWhenRendered(`paste-trigger-${target.kind}-${target.tempId}`);
  }

  applyPaste(): void {
    const target = this.pasteTarget();
    if (!target) return;
    const count = target.kind === 'options'
      ? this.vm.setOptionsFromText(target.tempId, this.pasteText)
      : this.vm.setLikertRowsFromText(target.tempId, this.pasteText);
    if (count === 0) {
      this.announce('No se encontró ninguna línea con texto.');
      return;
    }
    this.pasteTarget.set(null);
    this.announce(`Se cargaron ${count} ${target.kind === 'options' ? 'opciones' : 'filas'}.`);
    this.focusWhenRendered(`paste-trigger-${target.kind}-${target.tempId}`);
  }

  private menuTarget(key: string): QuestionInsertTarget {
    if (key.startsWith('after:')) return { afterTempId: key.slice(6) };
    const section = key.startsWith('section:') ? key.slice(8) : this.paletteTargetSection();
    return { sectionTempId: section === NO_SECTION ? null : section };
  }

  private announce(message: string): void {
    this.announcement.set('');
    setTimeout(() => this.announcement.set(message), 50);
  }

  /** Enfoca un elemento cuando Angular ya lo dibujó; si no existe, usa el alternativo. */
  private focusWhenRendered(id: string, fallbackId?: string, scroll = false): void {
    setTimeout(() => {
      const element = (this.document.getElementById(id) ?? (fallbackId ? this.document.getElementById(fallbackId) : null)) as HTMLElement | null;
      if (!element) return;
      if (element instanceof HTMLButtonElement && element.disabled && fallbackId) {
        this.document.getElementById(fallbackId)?.focus();
        return;
      }
      element.focus({ preventScroll: !scroll });
      if (scroll) element.scrollIntoView({ behavior: this.prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    });
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  openPreview(mode: PreviewMode = 'mobile'): void {
    this.previewMode.set(mode);
    this.previewModalOpen.set(true);
    this.setPreviewShell(true);
  }

  setCurrentLocationAsZoneCenter(tempId: string): void {
    if (!('geolocation' in navigator)) {
      this.notify.error('La geolocalización no está disponible en este navegador.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.vm.updateQuestionProperty(tempId, 'target_lat', Number(pos.coords.latitude.toFixed(6)));
        this.vm.updateQuestionProperty(tempId, 'target_lng', Number(pos.coords.longitude.toFixed(6)));
      },
      (err) => {
        this.notify.error(`No se pudo obtener la ubicación actual: ${err.message}`);
      }
    );
  }

  onDragStart(event: DragEvent, tempId: string): void {
    if (!this.vm.canEditQuestions()) return;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tempId);
    }

    this.draggedQuestionTempId.set(tempId);
  }

  onDragOver(event: DragEvent, targetTempId: string): void {
    if (!this.vm.canEditQuestions() || !this.draggedQuestionTempId()) return;

    event.preventDefault();

    const target = event.currentTarget as HTMLElement | null;
    if (target) {
      const rect = target.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const position: 'before' | 'after' = event.clientY < midpoint ? 'before' : 'after';
      this.dropTargetTempId.set(targetTempId);
      this.dropPosition.set(position);
    }

    this.autoScrollOnDrag(event.clientY);
  }

  onDrop(event: DragEvent, targetTempId: string): void {
    event.preventDefault();

    const sourceTempId = this.draggedQuestionTempId();
    const position = this.dropPosition();

    this.draggedQuestionTempId.set(null);
    this.dropTargetTempId.set(null);

    if (!sourceTempId || !this.vm.canEditQuestions() || sourceTempId === targetTempId) return;

    this.vm.reorderQuestion(sourceTempId, targetTempId, position);
  }

  onDragEnd(): void {
    this.draggedQuestionTempId.set(null);
    this.dropTargetTempId.set(null);
  }

  isDropTarget(tempId: string, position: 'before' | 'after'): boolean {
    return this.draggedQuestionTempId() !== null
      && this.dropTargetTempId() === tempId
      && this.dropPosition() === position
      && this.draggedQuestionTempId() !== tempId;
  }

  private autoScrollOnDrag(clientY: number): void {
    const edgeThreshold = 110;
    const maxScrollStep = 18;
    const viewportHeight = window.innerHeight;

    if (clientY < edgeThreshold) {
      window.scrollBy({ top: -maxScrollStep, behavior: 'auto' });
      return;
    }

    if (clientY > viewportHeight - edgeThreshold) {
      window.scrollBy({ top: maxScrollStep, behavior: 'auto' });
    }
  }

  closePreview(): void {
    this.previewModalOpen.set(false);
    this.setPreviewShell(false);
  }

  setPreviewMode(mode: PreviewMode): void {
    this.previewMode.set(mode);
  }

  private toPreviewQuestions(questions: FormQuestionDraft[]): PreviewQuestion[] {
    return questions.map((question) => ({
      ...question,
      displayLabel: this.vm.getQuestionDisplayLabel(question),
    }));
  }

  private setPreviewShell(isOpen: boolean): void {
    this.document.body.classList.toggle('preview-modal-open', isOpen);
  }

  openShareModal(): void {
    const formId = this.vm.formId();
    if (!formId) {
      this.shareError = 'Guarda el formulario primero para poder compartirlo.';
      return;
    }
    this.shareModalOpen = true;
    this.shareError = '';
    this.loadShares(formId);
  }

  closeShareModal(): void {
    this.shareModalOpen = false;
    this.shareError = '';
    this.matchedUser = null;
    this.clearLookupTimer();
  }

  setShareRole(role: 'PROJECT' | 'RECOLECTOR'): void {
    this.shareRole = role;
    if (role === 'PROJECT') {
      this.shareTarget = null;
    }
  }

  roleLabel(role: string | null | undefined): string {
    const labels: Record<string, string> = {
      SUPER_ADMIN: 'Super administrador',
      ADMIN: 'Administrador',
      PROJECT_LEADER: 'Lider de proyecto',
      USER: 'Usuario',
      EDITOR: 'Editor',
      RECOLECTOR: 'Recolector',
    };

    if (!role) {
      return '';
    }

    return labels[role] ?? role;
  }

  lookupUser(): void {
    const email = this.shareEmail.trim().toLowerCase();
    this.clearLookupTimer();

    if (!email || email.length < 3) {
      this.matchedUser = null;
      this.lookingUpUser = false;
      return;
    }

    this.lookingUpUser = true;
    this.lookupTimer = setTimeout(() => this.resolveUserLookup(email), 250);
  }

  private resolveUserLookup(email: string): void {
    this.getCachedUsers().then((users) => {
      this.matchedUser = users.find((user) => user.email.toLowerCase() === email) || null;
    }).catch(() => {
      this.matchedUser = null;
    }).finally(() => {
      this.lookingUpUser = false;
    });
  }

  submitShare(): void {
    const formId = this.vm.formId();
    if (!formId || !this.shareEmail.trim()) {
      this.shareError = 'Ingresa un correo válido.';
      return;
    }

    this.addingShare = true;
    this.shareError = '';

    this.formService.createShare(formId, {
      email: this.shareEmail.trim(),
      role: this.shareRole,
      target_responses: this.shareRole === 'RECOLECTOR' ? this.shareTarget : null,
    }).subscribe({
      next: () => {
        this.shareEmail = '';
        this.shareRole = 'RECOLECTOR';
        this.shareTarget = null;
        this.addingShare = false;
        this.loadShares(formId);
      },
      error: (err) => {
        this.shareError = err?.error?.message || 'No fue posible asignar el usuario.';
        this.addingShare = false;
      },
    });
  }

  async removeShare(shareId: string): Promise<void> {
    const formId = this.vm.formId();
    if (!formId) return;
    const accepted = await this.notify.confirm({
      title: 'Retirar invitación',
      message: '¿Retirar la invitación de este usuario? Dejará de ver este formulario.',
      confirmText: 'Retirar',
      tone: 'danger',
    });
    if (!accepted) return;

    this.formService.deleteShare(formId, shareId).subscribe({
      next: () => this.loadShares(formId),
      error: () => { this.shareError = 'No fue posible retirar la invitación.'; },
    });
  }

  startEditTarget(share: FormShare): void {
    if (share.role !== 'RECOLECTOR') return;
    this.editingShareId = share.id;
    this.editTargetValue = share.target_responses ?? null;
  }

  cancelEditTarget(): void {
    this.editingShareId = null;
    this.editTargetValue = null;
  }

  saveEditTarget(shareId: string): void {
    const formId = this.vm.formId();
    if (!formId) return;

    const value = this.editTargetValue;
    if (value !== null && (!Number.isInteger(value) || value < 1)) {
      this.shareError = 'Ingrese un número válido mayor a 0.';
      return;
    }

    this.savingTarget = true;
    this.formService.updateShareTarget(formId, shareId, value).subscribe({
      next: () => {
        this.savingTarget = false;
        this.editingShareId = null;
        this.loadShares(formId);
      },
      error: () => {
        this.shareError = 'No fue posible actualizar el objetivo.';
        this.savingTarget = false;
      },
    });
  }

  progressPercent(share: FormShare): number {
    if (!share.target_responses || share.target_responses <= 0) return 0;
    return Math.min(100, Math.round(((share.responses_count ?? 0) / share.target_responses) * 100));
  }

  private async getCachedUsers(): Promise<User[]> {
    if (this.usersCache) return this.usersCache;

    const response = await this.userService.getUsers(100, 1).toPromise();
    this.usersCache = response?.data ?? [];
    return this.usersCache;
  }

  private loadShares(formId: string): void {
    this.loadingShares = true;
    this.formService.getShares(formId).subscribe({
      next: (shares) => { this.shares.set(shares); this.loadingShares = false; },
      error: () => { this.shares.set([]); this.loadingShares = false; },
    });
  }

  private clearLookupTimer(): void {
    if (!this.lookupTimer) return;
    clearTimeout(this.lookupTimer);
    this.lookupTimer = null;
  }
}
