import { Injectable } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Question } from '../../surveys/models/question.model';

@Injectable({ providedIn: 'root' })
export class ResponseValidationService {
  buildValidators(question: Question): ValidatorFn[] {
    const validators: ValidatorFn[] = [];

    if (question.required) {
      validators.push(this.requiredByType(question));
    }

    if (question.type === 'TEXT' && question.maxLength) {
      validators.push(Validators.maxLength(question.maxLength));
    }

    if (question.type === 'TEXT' && question.minLength) {
      validators.push(Validators.minLength(question.minLength));
    }

    if (question.type === 'NUMBER' && question.min !== undefined) {
      validators.push(Validators.min(question.min));
    }

    if (question.type === 'NUMBER' && question.max !== undefined) {
      validators.push(Validators.max(question.max));
    }

    return validators;
  }

  private requiredByType(question: Question): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;

      if (question.type === 'MULTIPLE_CHOICE') {
        return Array.isArray(value) && value.length > 0 ? null : { required: true };
      }

      if (value === null || value === undefined || value === '') {
        return { required: true };
      }

      return null;
    };
  }
}
