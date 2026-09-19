import { Injectable, signal } from '@angular/core';

type Lang = 'es' | 'en';

const THEME_KEY = 'kobo_theme';
const LANG_KEY = 'kobo_lang';

const TR: Record<Lang, Record<string, string>> = {
  es: {
    app_title: 'ULEAM PWA',
    app_subtitle: 'Herramienta de Recolección de Datos',
    app_footer: 'Proyecto Integrador - Desarrollo Móvil',
    online: 'Conectado al servidor central',
    offline: 'Modo Offline - Guardando datos localmente',
    fill_form: 'Llenar nuevo formulario',
    drafts: 'Borradores',
    ready_to_send: 'Listo para enviar',
    sent: 'Enviado',
    download_form: 'Descargar formulario',
    delete_form: 'Borrar formulario',
    loading: 'Cargando...',
    no_forms: 'No hay formularios descargados',
    save_draft: 'Guardar Borrador',
    save_send: 'Guardar y Enviar',
    settings: 'Ajustes',
    logout: 'Cerrar sesión',
    language: 'Idioma',
    dark_mode: 'Modo oscuro',
    light_mode: 'Modo claro',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    select_all: 'Seleccionar todos',
    deselect_all: 'Deseleccionar todos',
    download: 'Descargar',
    delete: 'Borrar',
    delete_confirm: '¿Estás seguro?',
    delete_local_only: 'Solo local, no del servidor',
    server_url: 'URL del servidor',
    change_server: 'Cambiar servidor',
    continue: 'Continuar',
    back: 'Volver',
    version: 'v1.0.0 (Proyecto Integrador)',
    about: 'Acerca de',
    send: 'Enviar',
  },
  en: {
    app_title: 'ULEAM PWA',
    app_subtitle: 'Data Collection Tool',
    app_footer: 'Integrator Project - Mobile Development',
    online: 'Connected to server',
    offline: 'Offline Mode - Saving locally',
    fill_form: 'Fill new form',
    drafts: 'Drafts',
    ready_to_send: 'Ready to send',
    sent: 'Sent',
    download_form: 'Download form',
    delete_form: 'Delete form',
    loading: 'Loading...',
    no_forms: 'No downloaded forms',
    save_draft: 'Save Draft',
    save_send: 'Save & Send',
    settings: 'Settings',
    logout: 'Log out',
    language: 'Language',
    dark_mode: 'Dark mode',
    light_mode: 'Light mode',
    cancel: 'Cancel',
    confirm: 'Confirm',
    select_all: 'Select all',
    deselect_all: 'Deselect all',
    download: 'Download',
    delete: 'Delete',
    delete_confirm: 'Are you sure?',
    delete_local_only: 'Local only, not from server',
    server_url: 'Server URL',
    change_server: 'Change server',
    continue: 'Continue',
    back: 'Back',
    version: 'v1.0.0 (Integrator Project)',
    about: 'About',
    send: 'Send',
  }
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  darkMode = signal<boolean>(this.loadTheme());
  lang = signal<Lang>(this.loadLang());

  constructor() {
    this.applyTheme(this.darkMode());
    this.applyLang();
  }

  private loadTheme(): boolean {
    return localStorage.getItem(THEME_KEY) === 'dark';
  }

  private loadLang(): Lang {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'en' ? 'en' : 'es';
  }

  toggleTheme() {
    const next = !this.darkMode();
    this.darkMode.set(next);
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    this.applyTheme(next);
  }

  toggleLang() {
    const next: Lang = this.lang() === 'es' ? 'en' : 'es';
    this.lang.set(next);
    localStorage.setItem(LANG_KEY, next);
    this.applyLang();
  }

  t(key: string): string {
    return TR[this.lang()][key] ?? key;
  }

  private applyTheme(dark: boolean) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  private applyLang() {
    document.documentElement.setAttribute('lang', this.lang());
  }
}
