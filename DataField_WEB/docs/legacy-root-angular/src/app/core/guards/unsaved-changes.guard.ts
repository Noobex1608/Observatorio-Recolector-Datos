import { CanDeactivateFn } from '@angular/router';

export interface UnsavedChangesComponent {
  hasUnsavedChanges: () => boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<UnsavedChangesComponent> = (component) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }

  return globalThis.confirm('Tienes cambios sin guardar. Deseas salir de todas formas?');
};
