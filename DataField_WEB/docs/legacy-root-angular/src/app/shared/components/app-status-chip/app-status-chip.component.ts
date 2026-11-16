import { Component, input } from '@angular/core';

@Component({
  selector: 'shared-app-status-chip',
  template: '<ng-content />',
})
export class app_status_chipComponent {
  readonly title = input<string>('');
}
