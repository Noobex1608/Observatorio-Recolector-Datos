import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ThemeService } from './theme.service';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent {
  private router = inject(Router);
  theme = inject(ThemeService);
  toast = inject(ToastService);
  title = 'ULEAM';

  get isLoginRoute(): boolean {
    return this.router.url.startsWith('/login');
  }

  get isHomeRoute(): boolean {
    return this.router.url === '/';
  }
}
