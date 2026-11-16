import { Directive, Input, TemplateRef, ViewContainerRef, inject } from '@angular/core';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { Role } from '../../features/users/models/user.model';

@Directive({
  selector: '[appHasRole]',
})
export class HasRoleDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly authSession = inject(AuthSessionService);

  @Input() set appHasRole(roles: Role[] | Role) {
    const list = Array.isArray(roles) ? roles : [roles];
    const role = this.authSession.session()?.role;

    this.viewContainerRef.clear();
    if (role && list.includes(role)) {
      this.viewContainerRef.createEmbeddedView(this.templateRef);
    }
  }
}
