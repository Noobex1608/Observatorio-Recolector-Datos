import { Directive, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';

/**
 * Directiva que muestra elementos solo para usuarios autenticados.
 *
 * Uso:
 * ```html
 * <div *isAuthenticated>Solo usuarios autenticados</div>
 * ```
 */
@Directive({
  selector: '[isAuthenticated]',
  standalone: true,
})
export class IsAuthenticatedDirective {
  private readonly authService = inject(AuthService);
  private readonly templateRef = inject(TemplateRef<any>);
  private readonly viewContainer = inject(ViewContainerRef);

  private hasView = false;

  constructor() {
    effect(() => {
      const isAuth = this.authService.isAuthenticated();
      this.updateView(isAuth);
    });
  }

  private updateView(isAuth: boolean): void {
    if (isAuth && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!isAuth && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
