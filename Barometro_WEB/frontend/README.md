# Frontend - Angular Forms SPA

SPA Angular 21 para crear, publicar y analizar formularios dinamicos.

## Stack

- Angular 21 standalone components.
- Angular Material.
- Signals y ViewModels para estado de presentacion.
- ECharts para graficos de respuestas.
- Bun 1.3.14 como package manager.

## Instalacion

```powershell
.\scripts\frontend.ps1 install
```

O desde `frontend/`:

```bash
bun install --frozen-lockfile
```

## Desarrollo

```powershell
.\scripts\frontend.ps1 start
.\scripts\frontend.ps1 build
.\scripts\frontend.ps1 check
.\scripts\frontend.ps1 test
```

No hay script de lint configurado actualmente.

## Despliegue en Netlify

`ng build` genera una SPA estática en `dist/frontend/browser`, incluido `index.html`.
Netlify publica ese directorio y redirige solo las rutas de la aplicación a
`index.html`. Los recursos ausentes, como chunks JavaScript de una versión
anterior, deben responder 404. Si una pestaña abierta intenta cargar uno de
esos chunks tras un despliegue, `deploy-recovery.js` recarga la página una vez.

## Rutas activas

| Ruta | Uso |
| --- | --- |
| `/auth/login` | Login |
| `/admin/dashboard` | Mis formularios |
| `/admin/forms/builder` | Nuevo formulario |
| `/admin/forms/:id/edit` | Editar formulario |
| `/admin/forms/:id/responses` | Respuestas |
| `/admin/usuarios` | Gestion de usuarios |
| `/perfil` | Perfil autenticado |
| `/collect/:uuid` | Recoleccion publica |

## Estructura relevante

```text
src/app/core        servicios, guards, interceptors, modelos
src/app/features    auth, forms, profile, usuarios
src/app/presentation/viewmodels  estado de pantallas
src/app/shared      layout y componentes compartidos
src/app/routes      rutas admin/auth
```

## TypeScript

Los aliases se configuran en `tsconfig.json` con `paths` relativos a la raiz del proyecto. No se usa `baseUrl` porque TypeScript lo marco como obsoleto para futuras versiones. `tsconfig.app.json` declara `rootDir: ./src` para conservar el layout de salida.

## Backend esperado

La SPA consume `http://localhost:8000/api` en desarrollo. Cambiar endpoints desde `src/environments/environment.ts` y `environment.prod.ts`.
