import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationHostComponent } from './shared/components/notification-host/notification-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NotificationHostComponent],
  template: '<router-outlet></router-outlet><app-notification-host></app-notification-host>',
  styles: [':host { display: block; height: 100%; }']
})
export class App {}
