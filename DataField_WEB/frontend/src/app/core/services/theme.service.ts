import { isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { Theme } from './interfaces';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly STORAGE_KEY = 'observatorio-theme';
  private readonly platformId = inject(PLATFORM_ID);

  // Verificar si estamos en el navegador
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Signal reactivo para el tema actual
  readonly theme = signal<Theme>(this.getInitialTheme());

  // Computed para saber si es modo oscuro
  readonly isDark = () => this.theme() === 'dark';

  constructor() {
    // Efecto para aplicar el tema al DOM cuando cambie
    effect(() => {
      this.applyTheme(this.theme());
    });
  }

  /**
   * Alterna entre tema claro y oscuro
   */
  toggleTheme(): void {
    const newTheme = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(newTheme);
    this.saveTheme(newTheme);
  }

  /**
   * Establece un tema específico
   */
  setTheme(theme: Theme): void {
    this.theme.set(theme);
    this.saveTheme(theme);
  }

  /**
   * Guarda el tema en localStorage (solo en navegador)
   */
  private saveTheme(theme: Theme): void {
    if (this.isBrowser) {
      localStorage.setItem(this.STORAGE_KEY, theme);
    }
  }

  /**
   * Obtiene el tema inicial desde localStorage o usa light como predeterminado
   */
  private getInitialTheme(): Theme {
    // Solo acceder a localStorage si estamos en el navegador
    if (!this.isBrowser) {
      return 'light';
    }

    // Primero verificar localStorage
    const stored = localStorage.getItem(this.STORAGE_KEY) as Theme | null;
    if (stored && (stored === 'light' || stored === 'dark')) {
      return stored;
    }

    // Por defecto usar light
    return 'light';
  }

  /**
   * Aplica el tema al documento HTML
   */
  private applyTheme(theme: Theme): void {
    if (!this.isBrowser) {
      return;
    }

    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }
}
