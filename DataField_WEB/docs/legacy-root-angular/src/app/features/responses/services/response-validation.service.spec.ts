import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { ResponseValidationService } from './response-validation.service';

describe('ResponseValidationService', () => {
  let service: ResponseValidationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ResponseValidationService);
  });

  it('valida obligatorio para selección múltiple', () => {
    const validators = service.buildValidators({
      id: 'q1',
      type: 'MULTIPLE_CHOICE',
      label: 'Pregunta',
      required: true,
      order: 1,
      options: [
        { id: 'o1', label: 'A', value: 'a' },
        { id: 'o2', label: 'B', value: 'b' },
      ],
    });

    const control = new FormControl<string[]>([], { validators });
    control.updateValueAndValidity();
    expect(control.errors?.['required']).toBe(true);

    control.setValue(['a']);
    control.updateValueAndValidity();
    expect(control.errors).toBeNull();
  });

  it('aplica min y max para números', () => {
    const validators = service.buildValidators({
      id: 'q2',
      type: 'NUMBER',
      label: 'Número',
      required: true,
      order: 1,
      min: 5,
      max: 10,
    });

    const control = new FormControl<number | null>(1, { validators });
    control.updateValueAndValidity();
    expect(control.errors?.['min']).toBeTruthy();

    control.setValue(8);
    control.updateValueAndValidity();
    expect(control.errors).toBeNull();
  });
});
