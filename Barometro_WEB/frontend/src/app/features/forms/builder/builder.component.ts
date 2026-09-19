import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormQuestion, FormShare, FormService } from '@core/services/form.service';
import { AuthService } from '@core/services/auth.service';
import { UserService } from '@core/services/user.service';
import { User } from '@core/models/user/user.interface';
import { FormBuilderViewModel, FormQuestionDraft } from '@presentation/viewmodels/form-builder.viewmodel';
import { TranslateModule } from '@ngx-translate/core';

type PreviewMode = 'mobile' | 'web';
type PreviewQuestion = FormQuestionDraft & { displayLabel: string };

@Component({
  selector: 'app-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
  templateUrl: './builder.component.html',
  styleUrl: './builder.component.scss',
  providers: [FormBuilderViewModel],
})
export class BuilderComponent implements OnInit, OnDestroy {
  readonly vm = inject(FormBuilderViewModel);
  private readonly route = inject(ActivatedRoute);
  private readonly formService = inject(FormService);
  readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly document = inject(DOCUMENT);
  readonly previewMode = signal<PreviewMode>('mobile');
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
      void this.vm.loadForm(formId);
    } else {
      this.vm.updateProject(this.route.snapshot.queryParamMap.get('project_id'));
    }
  }

  ngOnDestroy(): void {
    this.setPreviewShell(false);
  }

  openPreview(mode: PreviewMode = 'mobile'): void {
    this.previewMode.set(mode);
    this.previewModalOpen.set(true);
    this.setPreviewShell(true);
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

  removeShare(shareId: string): void {
    const formId = this.vm.formId();
    if (!formId) return;
    if (!confirm('¿Retirar la invitación de este usuario?')) return;

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
