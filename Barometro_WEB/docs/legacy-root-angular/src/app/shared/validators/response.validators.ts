import { AbstractControl, ValidationErrors } from '@angular/forms';

export function requiredArrayValidator(control: AbstractControl): ValidationErrors | null {
  return Array.isArray(control.value) && control.value.length > 0 ? null : { required: true };
}
