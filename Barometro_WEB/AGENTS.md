# AGENTS.md

Guia para trabajar en este repositorio.

## Objetivo actual

Plataforma de formularios dinamicos y recoleccion de datos para ULEAM, inspirada en KoboToolbox / Google Forms. Incluye una app web (Angular) y una app movil PWA (Angular + Dexie/IndexedDB) para recoleccion offline.

## Estructura

- `backend/`: Laravel 12 API (PHP 8.4).
- `frontend/`: Angular 21 SPA web (Frontend activo). Paquete: Bun 1.2.18.
- `Barometro_MOVIL/kobo-mobile/`: Angular 21 app movil PWA offline-first. Paquete: npm.
- `scripts/`: wrappers de desarrollo para PowerShell, Bash y CMD (en la raiz de `Barometro_WEB/`).
- `docker-compose.yml`: PostgreSQL 16 (solo base de datos).

**No confundir `src/` (legado, observatorio anterior) con `frontend/` (activo).**

## Flujo de desarrollo

```powershell
.\scripts\install.ps1
.\scripts\start.ps1 all
```

Comandos principales:

```powershell
.\scripts\backend.ps1 install
.\scripts\backend.ps1 migrate
.\scripts\backend.ps1 routes
.\scripts\backend.ps1 start

.\scripts\frontend.ps1 install
.\scripts\frontend.ps1 build
.\scripts\frontend.ps1 start
```

## Docker

- PostgreSQL corre con `docker-compose.yml`. Container: `observatorio_db`, puerto `5433:5432`.
- Backend corre en Docker pero NO esta definido en `docker-compose.yml`. Se ejecuta manualmente con `docker run` o `docker-compose` externo.
- Imagen del backend: `observatorio-backend`. Container: `observatorio-backend`.
- **`docker restart` NO aplica nuevas imagenes.** Hay que `docker rm` + `docker run` o `docker-compose up --build`.
- El frontend corre en el host con Bun.

## Frontend (Web) — `frontend/`

- Angular 21 standalone components con signals.
- Package manager: Bun 1.2.18. Lockfile: `bun.lock`.
- No usar npm para instalar dependencias.
- No existe script de lint.
- Aliases via `paths` en `tsconfig.app.json` (relativos a raiz).
- API base URL: `src/environments/environment.ts` (default `http://localhost:8000/api`).
- Traduccion: `@ngx-translate/core`.
- Graficos: `ngx-echarts` + `echarts`.
- Estilos: Tailwind CSS 4 + Angular Material.
- SSR configurado (`@angular/ssr`).
- Build: `npx ng build` desde `frontend/`.

### Servicios HTTP

Conectados al backend Laravel via tokens de inyeccion en `app.config.ts`:

- `FormService` — CRUD formularios + shares + responses + stats.
- `AuthService` — login/logout/sesion.
- `UserService` — CRUD usuarios.
- `ProfileService` — perfil (GET/PUT/avatar).
- `ProjectService` — CRUD proyectos.

Sesion en `AuthSessionService` persiste a `localStorage`. Token Sanctum via `authInterceptor`.

### Rutas activas

| Ruta | Componente | Descripcion |
|------|-----------|-------------|
| `/auth/login` | `LoginComponent` | Inicio de sesion |
| `/admin/dashboard` | `DashboardComponent` | Panel principal |
| `/admin/configuracion` | `ProfileComponent` | Configuracion de cuenta |
| `/admin/forms/builder` | `BuilderComponent` | Constructor de formularios (requiere ADMIN/PROJECT) |
| `/admin/forms/:id/edit` | `BuilderComponent` | Editor de formularios |
| `/admin/forms/:id/responses` | `ResponsesComponent` | Respuestas de un formulario |
| `/admin/proyectos` | `ProjectListComponent` | Gestion de proyectos |
| `/admin/usuarios` | `UsuarioListComponent` | Lista de usuarios (requiere SUPER_ADMIN) |
| `/admin/usuarios/nuevo` | `UsuarioFormComponent` | Crear usuario (requiere SUPER_ADMIN) |
| `/admin/usuarios/:id` | `UsuarioFormComponent` | Editar usuario (requiere SUPER_ADMIN) |
| `/perfil` | `ProfileComponent` | Perfil de usuario |
| `/collect/:uuid` | `FormCollectComponent` | Coleccion publica (sin auth) |

### Asignacion de formularios

El builder (`/admin/forms/builder`) incluye modal "Compartir":

- Busqueda de usuario por correo con preview (nombre, email, rol).
- Asignacion con rol (`EDITOR` / `RECOLECTOR`) y respuestas objetivo (`target_responses`).
- Tabla de usuarios asignados con barra de progreso (respuestas enviadas / objetivo).
- Edicion inline de target, botones Reactivar/Retirar.
- Endpoints: `GET/POST/PATCH/DELETE /api/forms/{id}/shares`.

El dashboard (`/admin/dashboard`) tambien muestra usuarios asignados por formulario con progreso.

Las respuestas (`/admin/forms/:id/responses`) muestran contadores de progreso por usuario asignado.

## Frontend (Movil PWA) — `Barometro_MOVIL/kobo-mobile/`

- Angular 21 standalone components con signals.
- Offline-first con Dexie.js (IndexedDB).
- Toast notifications via `ToastService` (signals, auto-dismiss).
- Borradores persisten en IndexedDB hasta enviar; al abrir desde la lista se inicia formulario nuevo.
- Sincronizacion con backend via `SyncService` + `ApiService`.
- Al enviar respuesta, `responses_count` local se incrementa para mantener progreso preciso.
- Perfil de usuario editable (`/perfil`).
- Build: `npx ng build` desde `Barometro_MOVIL/kobo-mobile/`.

### Rutas moviles

| Ruta | Componente | Descripcion |
|------|-----------|-------------|
| `/login` | `LoginComponent` | Inicio de sesion |
| `/` | `InicioComponent` | Inicio (descargar forms, acceso rapido) |
| `/lista` | `ListaEncuestasComponent` | Lista de encuestas con progreso |
| `/llenar/:id` | `LlenarEncuestaComponent` | Llenar encuesta |
| `/listo-para-enviar` | `ListoParaEnviarComponent` | Cola de envio (con boton eliminar) |
| `/borradores` | `BorradoresComponent` | Borradores guardados |
| `/enviados` | `EnviadosComponent` | Historial de enviados |
| `/ajustes` | `AjustesComponent` | Configuracion |
| `/perfil` | `PerfilComponent` | Editar perfil |

## Backend

Rutas activas orientadas a formularios:

- Auth: `POST /api/login`, `POST /api/logout`, `GET /api/user`.
- Profile: `GET/PUT /api/profile/`, `POST/DELETE /api/profile/avatar`.
- Forms: CRUD, preguntas, deploy, archive, responses, stats, export.
- Forms (shares): `GET/POST /api/forms/{id}/shares`, `PATCH/DELETE /api/forms/{id}/shares/{share_id}`.
- Forms (submit): `POST /api/forms/submit/{link_uuid}` (requiere auth).
- Forms (fetch): `GET /api/forms/fetch/{link_uuid}` (publico).
- Projects: CRUD de proyectos y asignacion de lideres.
- Users: CRUD, PATCH role, PATCH status.
- Mobile: `GET /api/mobile/forms` (formularios desplegados para el usuario).
- Seed: `POST /api/seed/admin` (super admin inicial).

El registro publico esta deshabilitado. Los usuarios se crean desde el panel administrativo.

Roles globales:

- `SUPER_ADMIN`: control total de usuarios, proyectos, formularios, configuracion y datos.
- `ADMIN`: gestiona proyectos, asigna lideres de proyecto y crea/gestiona formularios dentro de proyectos.
- `PROJECT`: gestiona formularios dentro de proyectos asignados.
- `USER`: usuario recolector/editor movil; solo ve formularios asignados y recolecta o edita segun permiso.

Los permisos `EDITOR` y `RECOLECTOR` pertenecen a la comparticion de formularios, no al rol global del usuario.
La columna `target_responses` en `form_user_shares` define respuestas objetivo por usuario asignado.
Todo formulario debe pertenecer a un proyecto. Los usuarios `USER` no acceden al proyecto completo: solo a los formularios que tengan asignados.

### Estados de formulario

Los estados en backend son `DRAFT`, `DEPLOYED`, `ARCHIVED`. El frontend usa los mismos nombres.
**No usar `IMPLEMENTED`** — el equivalente es `DEPLOYED`.

## Convenciones

- Mantener el foco en formularios dinamicos.
- No reintroducir rutas, modelos o carpetas del observatorio anterior salvo instruccion explicita.
- Preferir ViewModels para estado de pantallas Angular.
- Usar signals de Angular cuando aplique.
- Mantener scripts y documentacion sincronizados con cambios operativos.
- No conservar artefactos generados como `frontend/dist`, `frontend/.angular` o caches locales.
- **No usar `IMPLEMENTED`** — usar `DEPLOYED`.

## Validacion recomendada

```powershell
.\scripts\backend.ps1 routes
.\scripts\backend.ps1 migrate
cd frontend && npx ng build
cd ../Barometro_MOVIL/kobo-mobile && npx ng build
```
