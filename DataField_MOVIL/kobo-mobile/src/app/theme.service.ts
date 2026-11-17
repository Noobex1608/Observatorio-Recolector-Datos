import { Injectable, signal } from '@angular/core';

type Lang = 'es' | 'en';

const THEME_KEY = 'kobo_theme';
const LANG_KEY = 'kobo_lang';

const TR: Record<Lang, Record<string, string>> = {
  es: {
    app_title: 'ULEAM DataField',
    app_subtitle: 'Herramienta de Recolección de Datos',
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
    version: 'Versión',
    about: 'Acerca de',
    send: 'Enviar',
    account: 'Cuenta',
    preferences: 'Preferencias',
    connection: 'Conexión',
    device_data: 'Datos del teléfono',
    edit_profile: 'Editar perfil',
    theme_dark_label: 'Tema oscuro',
    theme_dark_help: 'Útil con poca luz; al sol se lee mejor el tema claro.',
    server: 'Servidor',
    server_not_set: 'Sin servidor configurado',
    delete_local_responses: 'Borrar respuestas del teléfono',
    delete_local_help: 'Libera espacio. No afecta lo que ya se envió al servidor.',
    delete_pending_warning: '{n} sin enviar se perderían',
    about_app: 'App de recolección de datos en campo',
    about_institution: 'Institución',
    about_offline: 'Sin conexión',
    about_offline_text: 'Las respuestas se guardan en el teléfono hasta enviarlas.',
    demo_mode: 'Modo demostración',
  },
  en: {
    app_title: 'ULEAM DataField',
    app_subtitle: 'Data Collection Tool',
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
    version: 'Version',
    about: 'About',
    send: 'Send',
    account: 'Account',
    preferences: 'Preferences',
    connection: 'Connection',
    device_data: 'Phone data',
    edit_profile: 'Edit profile',
    theme_dark_label: 'Dark theme',
    theme_dark_help: 'Handy in low light; in sunlight the light theme reads better.',
    server: 'Server',
    server_not_set: 'No server configured',
    delete_local_responses: 'Delete responses on this phone',
    delete_local_help: 'Frees space. Does not affect what was already sent to the server.',
    delete_pending_warning: '{n} unsent would be lost',
    about_app: 'Field data collection app',
    about_institution: 'Institution',
    about_offline: 'Offline',
    about_offline_text: 'Responses stay on the phone until they are sent.',
    demo_mode: 'Demo mode',
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

  setLang(next: Lang) {
    if (next === this.lang()) return;
    this.lang.set(next);
    localStorage.setItem(LANG_KEY, next);
    this.applyLang();
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
