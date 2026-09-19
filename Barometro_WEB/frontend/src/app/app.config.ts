import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TitleStrategy, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideEchartsCore } from 'ngx-echarts';
import { routes } from './app.routes';
import { authInterceptor, retryInterceptor } from './core/interceptors';
import { provideTranslateBrowserLoader } from './core/loaders/translate-browser.loader';
import { LanguageService } from './core/services/language.service';
import { TranslatedTitleStrategy } from './core/services/translated-title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(() => {
      inject(LanguageService).initialize();
    }),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, retryInterceptor])),
    provideAnimationsAsync(),
    provideEchartsCore({
      echarts: () => import('./core/config/echarts.config').then((m) => m.echarts),
    }),
    provideTranslateService({
      fallbackLang: 'es',
      loader: provideTranslateBrowserLoader({
        prefix: '/assets/i18n/',
        suffix: '.json',
      }),
    }),
  ],
};
