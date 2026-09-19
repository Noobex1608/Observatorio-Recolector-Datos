import { AbstractControl, ValidationErrors } from '@angular/forms';

export function minQuestionsValidator(min = 1) {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!Array.isArray(value)) {
      return null;
    }

    return value.length >= min ? null : { minQuestions: { required: min, actual: value.length } };
  };
}
