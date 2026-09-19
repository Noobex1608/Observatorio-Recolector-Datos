import { Directive, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';

/**
 * Directiva que muestra elementos solo para usuarios admin.
 *
 * Uso:
 * ```html
 * <button *isAdmin>Solo Admin</button>
 * ```
 */
@Directive({
  selector: '[isAdmin]',
  standalone: true,
})
export class IsAdminDirective {
  private readonly authService = inject(AuthService);
  private readonly templateRef = inject(TemplateRef<any>);
  private readonly viewContainer = inject(ViewContainerRef);

  private hasView = false;

  constructor() {
    effect(() => {
      const isAdmin = this.authService.isAdmin();
      this.updateView(isAdmin);
    });
  }

  private updateView(isAdmin: boolean): void {
    if (isAdmin && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!isAdmin && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
