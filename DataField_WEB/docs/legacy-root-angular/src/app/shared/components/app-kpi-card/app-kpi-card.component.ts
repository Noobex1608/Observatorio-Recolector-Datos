import { Component, input } from '@angular/core';

@Component({
  selector: 'shared-app-kpi-card',
  template: '<ng-content />',
})
export class app_kpi_cardComponent {
  readonly title = input<string>('');
}
