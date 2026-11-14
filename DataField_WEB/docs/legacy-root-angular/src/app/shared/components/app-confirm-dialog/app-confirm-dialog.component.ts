import { Component, input } from '@angular/core';

@Component({
  selector: 'shared-app-confirm-dialog',
  template: '<ng-content />',
})
export class app_confirm_dialogComponent {
  readonly title = input<string>('');
}
