import { CanDeactivateFn } from '@angular/router';

/** Pantallas con cambios sin guardar: piden confirmación antes de salir. */
export interface LeaveConfirmable {
  canLeave(): boolean | Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<LeaveConfirmable> = (component) => component?.canLeave?.() ?? true;
