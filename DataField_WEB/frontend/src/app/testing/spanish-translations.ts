import { Provider } from '@angular/core';
import { provideTranslateLoader, provideTranslateService, TranslateLoader, Translation } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import es from '../../assets/i18n/es.json';

/** Cargador síncrono con las traducciones reales en español: las pruebas leen el mismo texto que ve el usuario. */
class SpanishLoader implements TranslateLoader {
  getTranslation(): Observable<Translation> {
    return of(es as Translation);
  }
}

/** Proveedores para pruebas: TranslateService real, en español, con es.json. */
export function provideSpanishTranslations(): Provider[] {
  return provideTranslateService({ loader: provideTranslateLoader(SpanishLoader), lang: 'es', fallbackLang: 'es' });
}
