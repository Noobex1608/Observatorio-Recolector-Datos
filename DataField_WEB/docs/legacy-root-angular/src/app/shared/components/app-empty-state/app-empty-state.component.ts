import { Component, input } from '@angular/core';

@Component({
  selector: 'shared-app-empty-state',
  template: '<ng-content />',
})
export class app_empty_stateComponent {
  readonly title = input<string>('');
}
