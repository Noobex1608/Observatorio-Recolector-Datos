import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ThemeService } from './theme.service';
import { ToastService } from './toast.service';
import { TranslatePipe } from './translate.pipe';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, TranslatePipe],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent {
  theme = inject(ThemeService);
  toast = inject(ToastService);
  title = 'ULEAM';
}
