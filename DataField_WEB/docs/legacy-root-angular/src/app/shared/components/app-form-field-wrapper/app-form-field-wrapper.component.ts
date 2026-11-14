import { Component, input } from '@angular/core';

@Component({
  selector: 'shared-app-form-field-wrapper',
  template: '<ng-content />',
})
export class app_form_field_wrapperComponent {
  readonly title = input<string>('');
}
