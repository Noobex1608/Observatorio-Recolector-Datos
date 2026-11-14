import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from './theme.service';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent {
  private router = inject(Router);
  theme = inject(ThemeService);
  toast = inject(ToastService);
  title = 'ULEAM';
  dialogValue = '';
  private readonly document = inject(DOCUMENT);
  private returnFocus: HTMLElement | null = null;

  /** Al abrir el diálogo enfoca su primer control; al cerrarlo devuelve el foco a donde estaba. */
  private readonly dialogFocus = effect(() => {
    const dialog = this.toast.dialog();
    if (dialog) {
      this.returnFocus = this.document.activeElement as HTMLElement | null;
      this.dialogValue = dialog.value;
      setTimeout(() => {
        const target = this.document.getElementById(dialog.kind === 'prompt' ? 'app-dialog-input' : 'app-dialog-cancel');
        target?.focus();
      });
    } else if (this.returnFocus) {
      const element = this.returnFocus;
      this.returnFocus = null;
      setTimeout(() => element.focus?.());
    }
  });

  answerDialog(accepted: boolean): void {
    const dialog = this.toast.dialog();
    if (!dialog) return;
    if (!accepted) dialog.resolve(dialog.kind === 'prompt' ? null : false);
    else dialog.resolve(dialog.kind === 'prompt' ? this.dialogValue : true);
  }

  /** Mantiene el foco dentro del diálogo (Tab / Mayús+Tab) y lo cierra con Escape. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.answerDialog(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input, button'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  get isLoginRoute(): boolean {
    return this.router.url.startsWith('/login');
  }

  get isHomeRoute(): boolean {
    return this.router.url === '/';
  }
}
