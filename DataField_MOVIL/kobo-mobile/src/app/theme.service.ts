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
    greeting: 'Hola, {name}',
    pending_title_one: 'Tienes 1 encuesta por enviar',
    pending_title_many: 'Tienes {n} encuestas por enviar',
    pending_online: 'Envíala ahora para que llegue al servidor y no dependa del teléfono.',
    pending_offline: 'Sin señal: queda guardada en el teléfono. Envíala apenas tengas conexión.',
    pending_online_many: 'Envíalas ahora para que lleguen al servidor y no dependan del teléfono.',
    pending_offline_many: 'Sin señal: quedan guardadas en el teléfono. Envíalas apenas tengas conexión.',
    send_now: 'Enviar ahora',
    see_pending: 'Ver pendientes',
    all_sent: 'Todo lo que terminaste ya está enviado.',
    status_online: 'Con conexión',
    status_offline: 'Sin conexión: puedes seguir llenando encuestas.',
    storage_risk: 'Este teléfono podría borrar lo que no se envió si se queda sin espacio.',
    protect_in_settings: 'Protegerlo en Ajustes',
    fill_survey: 'Llenar encuesta',
    forms_on_phone_one: '1 formulario en este teléfono',
    forms_on_phone_many: '{n} formularios en este teléfono',
    no_forms_yet: 'Aún no hay formularios en este teléfono',
    download_forms: 'Descargar formularios',
    download_forms_help: 'Trae los formularios que tienes asignados.',
    your_surveys: 'Tus encuestas',
    forms_on_phone: 'Formularios en el teléfono',
    sent_plural: 'Enviadas',
    remove_forms: 'Quitar formularios del teléfono',
    remove_forms_help: 'No borra tus respuestas ni lo que ya enviaste.',
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
    storage_title: 'Almacenamiento de encuestas',
    storage_protected: 'Protegido: el navegador no borrará borradores ni encuestas pendientes.',
    storage_unprotected: 'Sin proteger: si falta espacio (o en iPhone tras unos días sin abrir la app), el navegador podría borrar lo que no se envió. Instala la app en la pantalla de inicio y envía apenas tengas señal.',
    storage_protect: 'Proteger',
    storage_protected_ok: 'Listo: el navegador no borrará las encuestas guardadas.',
    storage_protect_denied: 'El navegador no lo permitió todavía. Instala la app en la pantalla de inicio y vuelve a intentarlo; mientras tanto, envía lo pendiente apenas tengas señal.',
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
    greeting: 'Hi, {name}',
    pending_title_one: 'You have 1 survey to send',
    pending_title_many: 'You have {n} surveys to send',
    pending_online: 'Send it now so it reaches the server and no longer depends on the phone.',
    pending_offline: 'No signal: it stays saved on the phone. Send it as soon as you have a connection.',
    pending_online_many: 'Send them now so they reach the server and no longer depend on the phone.',
    pending_offline_many: 'No signal: they stay saved on the phone. Send them as soon as you have a connection.',
    send_now: 'Send now',
    see_pending: 'See pending',
    all_sent: 'Everything you finished has been sent.',
    status_online: 'Online',
    status_offline: 'Offline: you can keep filling in surveys.',
    storage_risk: 'This phone could delete what was not sent if it runs out of space.',
    protect_in_settings: 'Protect it in Settings',
    fill_survey: 'Fill in a survey',
    forms_on_phone_one: '1 form on this phone',
    forms_on_phone_many: '{n} forms on this phone',
    no_forms_yet: 'There are no forms on this phone yet',
    download_forms: 'Download forms',
    download_forms_help: 'Brings the forms assigned to you.',
    your_surveys: 'Your surveys',
    forms_on_phone: 'Forms on the phone',
    sent_plural: 'Sent',
    remove_forms: 'Remove forms from the phone',
    remove_forms_help: 'Does not delete your answers or what you already sent.',
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
    storage_title: 'Survey storage',
    storage_protected: 'Protected: the browser will not delete drafts or pending surveys.',
    storage_unprotected: 'Not protected: if space runs low (or on iPhone after a few days without opening the app), the browser could delete what was not sent. Install the app on the home screen and send as soon as you have signal.',
    storage_protect: 'Protect',
    storage_protected_ok: 'Done: the browser will not delete saved surveys.',
    storage_protect_denied: 'The browser did not allow it yet. Install the app on the home screen and try again; meanwhile, send pending surveys as soon as you have signal.',
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
