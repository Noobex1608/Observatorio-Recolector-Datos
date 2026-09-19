import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { UserRole } from '@core/models';
import { AuthService } from '@core/services/auth.service';

/**
 * Directiva estructural que muestra/oculta elementos según el rol del usuario.
 *
 * Uso:
 * ```html
 * <button *hasRole="'ADMIN'">Solo Admin</button>
 * <div *hasRole="['ADMIN', 'RECOLECTOR']">Admin o Recolector</div>
 * ```
 */
@Directive({
  selector: '[hasRole]',
  standalone: true,
})
export class HasRoleDirective {
  private readonly authService = inject(AuthService);
  private readonly templateRef = inject(TemplateRef<any>);
  private readonly viewContainer = inject(ViewContainerRef);

  private hasView = false;
  private roles: UserRole[] = [];

  constructor() {
    // Efecto reactivo que actualiza la vista cuando cambia el usuario
    effect(() => {
      const user = this.authService.user();
      this.updateView(user?.rol);
    });
  }

  @Input()
  set hasRole(roles: UserRole | UserRole[]) {
    this.roles = Array.isArray(roles) ? roles : [roles];
    const user = this.authService.user();
    this.updateView(user?.rol);
  }

  private updateView(userRole: UserRole | undefined): void {
    const shouldShow = userRole ? this.roles.includes(userRole) : false;

    if (shouldShow && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!shouldShow && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
