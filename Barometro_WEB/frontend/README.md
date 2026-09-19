# Frontend - Angular Forms SPA

SPA Angular 21 para crear, publicar y analizar formularios dinamicos.

## Stack

- Angular 21 standalone components.
- Angular Material.
- Signals y ViewModels para estado de presentacion.
- ECharts para graficos de respuestas.
- Bun 1.2.18 como package manager.

## Instalacion

```powershell
.\scripts\frontend.ps1 install
```

O desde `frontend/`:

```bash
bun install
```

## Desarrollo

```powershell
.\scripts\frontend.ps1 start
.\scripts\frontend.ps1 build
.\scripts\frontend.ps1 check
.\scripts\frontend.ps1 test
```

No hay script de lint configurado actualmente.

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
