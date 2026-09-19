import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Todas las rutas usan Client rendering para evitar
  // problemas de pre-renderizado con ngx-translate y datos dinámicos.
  // El SSR/Prerender genera HTML con claves de traducción sin resolver
  // porque el TranslateLoader no puede cargar las traducciones completas
  // durante el build (solo tiene fallbacks mínimos).
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
