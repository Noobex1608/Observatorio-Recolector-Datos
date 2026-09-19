import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { Form, FormService, FormShare } from '@core/services/form.service';
import { User } from '@core/models/user/user.interface';
import { UserService } from '@core/services/user.service';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

export type FormTab = 'DRAFT' | 'DEPLOYED' | 'ARCHIVED';

@Injectable()
export class FormDashboardViewModel {
  private formService = inject(FormService);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private translate = inject(TranslateService);

  activeTab = signal<FormTab>('DRAFT');
  searchQuery = signal('');
  myForms = signal<Form[]>([]);
  sharedForms = signal<Form[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  actionLoading = signal<string | null>(null);

  shareModalOpen = signal(false);
  shareFormId = signal<string | null>(null);
  shareEmail = signal('');
  shareRole = signal<'PROJECT' | 'RECOLECTOR'>('RECOLECTOR');
  shareTarget = signal<number | null>(null);
  shareError = signal('');
  shares = signal<FormShare[]>([]);
  loadingShares = signal(false);
  addingShare = signal(false);
  matchedUser = signal<User | null>(null);
  lookingUpUser = signal(false);
  editingShareId = signal<string | null>(null);
  editTargetValue = signal<number | null>(null);
  savingTarget = signal(false);

  linkModalOpen = signal(false);
  linkUrl = signal('');

  private usersCache: User[] | null = null;
  private lookupTimer: ReturnType<typeof setTimeout> | null = null;

  filteredForms = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const tab = this.activeTab();
    const all = [...this.myForms(), ...this.sharedForms()];

    const byState = all.filter((f) => f.state === tab);

    if (!query) return byState;

    return byState.filter(
      (f) =>
        f.title.toLowerCase().includes(query) ||
        (f.description ?? '').toLowerCase().includes(query),
    );
  });

  tabCounts = computed(() => {
    const all = [...this.myForms(), ...this.sharedForms()];
    return {
      DRAFT: all.filter((f) => f.state === 'DRAFT').length,
      DEPLOYED: all.filter((f) => f.state === 'DEPLOYED').length,
      ARCHIVED: all.filter((f) => f.state === 'ARCHIVED').length,
    };
  });

  async loadForms(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const data = await firstValueFrom(this.formService.getForms());
      this.myForms.set(data.my_forms);
      this.sharedForms.set(data.shared_forms);
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.dashboard.errors.load'));
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(tab: FormTab): void {
    this.activeTab.set(tab);
  }

  canCreateForms(): boolean {
    return this.authService.isAdmin() || this.authService.isProjectLeader();
  }

  canManageForm(_form: Form): boolean {
    return this.authService.isAdmin() || this.authService.isProjectLeader();
  }

  canEditForm(form: Form): boolean {
    return this.canManageForm(form) || (this.authService.isRecolector() && form.access_role === 'PROJECT');
  }

  canViewResults(): boolean {
    return this.authService.isAdmin() || this.authService.isProjectLeader();
  }

  async deployForm(id: string): Promise<void> {
    this.actionLoading.set(id);
    try {
      await firstValueFrom(this.formService.deployForm(id));
      await this.loadForms();
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.dashboard.errors.deploy'));
    } finally {
      this.actionLoading.set(null);
    }
  }

  async archiveForm(id: string): Promise<void> {
    this.actionLoading.set(id);
    try {
      await firstValueFrom(this.formService.archiveForm(id));
      await this.loadForms();
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.dashboard.errors.archive'));
    } finally {
      this.actionLoading.set(null);
    }
  }

  async deleteForm(form: Form): Promise<void> {
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(this.translate.instant('forms.dashboard.deletePermanentWarning', { title: form.title }));

    if (!confirmed) {
      return;
    }

    this.actionLoading.set(form.id);
    try {
      await firstValueFrom(this.formService.deleteForm(form.id));
      await this.loadForms();
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.dashboard.errors.delete'));
    } finally {
      this.actionLoading.set(null);
    }
  }

  async cloneForm(form: Form): Promise<void> {
    this.actionLoading.set(form.id);
    try {
      await firstValueFrom(this.formService.cloneForm(form.id));
      this.activeTab.set('DRAFT');
      await this.loadForms();
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || this.translate.instant('forms.dashboard.errors.clone'));
    } finally {
      this.actionLoading.set(null);
    }
  }

  openShareModal(formId: string): void {
    this.shareFormId.set(formId);
    this.shareEmail.set('');
    this.shareRole.set('RECOLECTOR');
    this.shareTarget.set(null);
    this.shareError.set('');
    this.matchedUser.set(null);
    this.editingShareId.set(null);
    this.shareModalOpen.set(true);
    this.loadShares(formId);
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareFormId.set(null);
    this.shares.set([]);
    this.shareError.set('');
    this.matchedUser.set(null);
    this.clearLookupTimer();
  }

  async loadShares(formId: string): Promise<void> {
    this.loadingShares.set(true);
    try {
      const data = await firstValueFrom(this.formService.getShares(formId));
      this.shares.set(data);
    } catch {
      this.shares.set([]);
    } finally {
      this.loadingShares.set(false);
    }
  }

  setShareRole(role: 'PROJECT' | 'RECOLECTOR'): void {
    this.shareRole.set(role);
    if (role === 'PROJECT') {
      this.shareTarget.set(null);
    }
  }

  setShareTargetFromInput(value: string | number | null): void {
    const parsed = Number(value);
    this.shareTarget.set(Number.isInteger(parsed) && parsed > 0 ? parsed : null);
  }

  lookupUser(): void {
    const email = this.shareEmail().trim().toLowerCase();
    this.clearLookupTimer();

    if (email.length < 3) {
      this.matchedUser.set(null);
      this.lookingUpUser.set(false);
      return;
    }

    this.lookingUpUser.set(true);
    this.lookupTimer = setTimeout(() => {
      void this.resolveUserLookup(email);
    }, 250);
  }

  private async resolveUserLookup(email: string): Promise<void> {
    try {
      const users = await this.getCachedUsers();
      this.matchedUser.set(users.find((user) => user.email.toLowerCase() === email) ?? null);
    } catch {
      this.matchedUser.set(null);
    } finally {
      this.lookingUpUser.set(false);
    }
  }

  private async getCachedUsers(): Promise<User[]> {
    if (this.usersCache) return this.usersCache;

    const response = await firstValueFrom(this.userService.getUsers(100, 1));
    this.usersCache = response.data;
    return this.usersCache;
  }

  async submitShare(): Promise<void> {
    const formId = this.shareFormId();
    if (!formId || !this.shareEmail().trim()) {
      this.shareError.set(this.translate.instant('forms.dashboard.errors.shareEmail'));
      return;
    }

    this.addingShare.set(true);
    this.shareError.set('');
    try {
      await firstValueFrom(
        this.formService.createShare(formId, {
          email: this.shareEmail().trim(),
          role: this.shareRole(),
          target_responses: this.shareRole() === 'RECOLECTOR' ? this.shareTarget() : null,
        }),
      );
      this.shareEmail.set('');
      this.shareRole.set('RECOLECTOR');
      this.shareTarget.set(null);
      this.matchedUser.set(null);
      await this.loadShares(formId);
    } catch (error: any) {
      this.shareError.set(error?.error?.message || this.translate.instant('forms.dashboard.errors.share'));
    } finally {
      this.addingShare.set(false);
    }
  }

  async removeShare(shareId: string): Promise<void> {
    const formId = this.shareFormId();
    if (!formId) return;

    try {
      await firstValueFrom(this.formService.deleteShare(formId, shareId));
      await this.loadShares(formId);
    } catch (error: any) {
      this.shareError.set(error?.error?.message || this.translate.instant('forms.dashboard.errors.removeShare'));
    }
  }

  startEditTarget(share: FormShare): void {
    if (share.role !== 'RECOLECTOR') return;
    this.editingShareId.set(share.id);
    this.editTargetValue.set(share.target_responses ?? null);
  }

  cancelEditTarget(): void {
    this.editingShareId.set(null);
    this.editTargetValue.set(null);
  }

  setEditTargetFromInput(value: string | number | null): void {
    const parsed = Number(value);
    this.editTargetValue.set(Number.isInteger(parsed) && parsed > 0 ? parsed : null);
  }

  async saveEditTarget(shareId: string): Promise<void> {
    const formId = this.shareFormId();
    if (!formId) return;

    this.savingTarget.set(true);
    this.shareError.set('');
    try {
      await firstValueFrom(this.formService.updateShareTarget(formId, shareId, this.editTargetValue()));
      this.editingShareId.set(null);
      this.editTargetValue.set(null);
      await this.loadShares(formId);
    } catch (error: any) {
      this.shareError.set(error?.error?.message || this.translate.instant('forms.dashboard.errors.updateShare'));
    } finally {
      this.savingTarget.set(false);
    }
  }

  progressPercent(share: FormShare): number {
    if (!share.target_responses || share.target_responses <= 0) return 0;
    return Math.min(100, Math.round(((share.responses_count ?? 0) / share.target_responses) * 100));
  }

  showPublicLink(form: Form): void {
    if (!form.link_uuid) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    this.linkUrl.set(`${origin}/collect/${form.link_uuid}`);
    this.linkModalOpen.set(true);
  }

  closeLinkModal(): void {
    this.linkModalOpen.set(false);
    this.linkUrl.set('');
  }

  getStateLabel(state: Form['state']): string {
    const labels: Record<Form['state'], string> = {
      DRAFT: this.translate.instant('forms.dashboard.tabs.DRAFT'),
      DEPLOYED: this.translate.instant('forms.dashboard.tabs.DEPLOYED'),
      ARCHIVED: this.translate.instant('forms.dashboard.tabs.ARCHIVED'),
    };
    return labels[state];
  }

  private clearLookupTimer(): void {
    if (!this.lookupTimer) return;
    clearTimeout(this.lookupTimer);
    this.lookupTimer = null;
  }
}

