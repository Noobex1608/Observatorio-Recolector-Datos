import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LanguageService } from '@core/services/language.service';
import { environment } from '../../../environments/environment';

/**
 * Envía el idioma elegido en la interfaz (`X-App-Language: es|en`) para que la API responda sus
 * mensajes y el historial de auditoría en ese idioma. Se usa una cabecera propia y no
 * `Accept-Language`, que el navegador ya envía con el idioma del dispositivo. Solo va a nuestra API:
 * en servicios externos (OpenStreetMap, almacenamiento) una cabecera propia provocaría un rechazo CORS.
 */
export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl) || req.headers.has('X-App-Language')) return next(req);
  const lang = inject(LanguageService).currentLang();
  return next(req.clone({ setHeaders: { 'X-App-Language': lang } }));
};
