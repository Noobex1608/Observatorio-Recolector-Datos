import { Component, input } from '@angular/core';

@Component({
  selector: 'shared-app-chart',
  template: '<ng-content />',
})
export class app_chartComponent {
  readonly title = input<string>('');
}
