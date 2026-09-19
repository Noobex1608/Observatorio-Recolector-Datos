import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { TranslateLoader, Translation } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

// Traducciones básicas para SSR (carga rápida inicial)
const SSR_TRANSLATIONS: Record<string, Translation> = {
  es: {
    common: {
      buttons: { close: 'Cerrar', cancel: 'Cancelar', confirm: 'Confirmar' },
      messages: { loading: 'Cargando...', loadingForm: 'Cargando formulario...' },
      validation: { required: 'Este campo es requerido', email: 'Ingresa un correo valido' },
    },
    auth: {
      login: {
        title: 'Formularios ULEAM',
        subtitle: 'Ingresa a la plataforma de recoleccion de datos',
        email: 'Correo electronico',
        password: 'Contrasena',
        submit: 'Iniciar sesion',
        submitting: 'Ingresando...',
        inviteOnly: 'El acceso es solo por invitacion. Solicita tus credenciales a un administrador.',
      },
    },
    layout: {
      header: { brand: 'Formularios ULEAM', brandSubtitle: 'Recoleccion de datos' },
      sidebar: { sectionForms: 'Formularios', myForms: 'Mis formularios', newForm: 'Nuevo formulario', projects: 'Proyectos', users: 'Usuarios' },
    },
  },
  en: {
    common: {
      buttons: { close: 'Close', cancel: 'Cancel', confirm: 'Confirm' },
      messages: { loading: 'Loading...', loadingForm: 'Loading form...' },
      validation: { required: 'This field is required', email: 'Enter a valid email' },
    },
    auth: {
      login: {
        title: 'ULEAM Forms',
        subtitle: 'Sign in to the data collection platform',
        email: 'Email',
        password: 'Password',
        submit: 'Sign in',
        submitting: 'Signing in...',
        inviteOnly: 'Access is invitation-only. Request your credentials from an administrator.',
      },
    },
    layout: {
      header: { brand: 'ULEAM Forms', brandSubtitle: 'Data collection' },
      sidebar: { sectionForms: 'Forms', myForms: 'My forms', newForm: 'New form', projects: 'Projects', users: 'Users' },
    },
  },
};

export class TranslateBrowserLoader implements TranslateLoader {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  constructor(
    private readonly prefix: string = '/assets/i18n/',
    private readonly suffix: string = '.json',
  ) {}

  getTranslation(lang: string): Observable<Translation> {
    // En SSR, devolver traducciones mínimas para evitar errores de HTTP
    if (!isPlatformBrowser(this.platformId)) {
      return of(SSR_TRANSLATIONS[lang] || SSR_TRANSLATIONS['es'] || {});
    }

    // En el navegador, cargar traducciones completas vía HTTP
    return this.http.get<Translation>(`${this.prefix}${lang}${this.suffix}`);
  }
}

export function provideTranslateBrowserLoader(config?: { prefix?: string; suffix?: string }) {
  return {
    provide: TranslateLoader,
    useFactory: () => new TranslateBrowserLoader(config?.prefix, config?.suffix),
  };
}
