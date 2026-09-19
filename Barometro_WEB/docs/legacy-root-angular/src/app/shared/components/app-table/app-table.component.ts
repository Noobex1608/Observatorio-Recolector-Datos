import { Component, input } from '@angular/core';

@Component({
  selector: 'shared-app-table',
  template: '<ng-content />',
})
export class app_tableComponent {
  readonly title = input<string>('');
}
