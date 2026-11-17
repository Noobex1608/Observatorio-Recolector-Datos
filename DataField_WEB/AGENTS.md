# AGENTS.md

Guia para trabajar en este repositorio.

## Objetivo actual

Plataforma de formularios dinamicos y recoleccion de datos para ULEAM, inspirada en KoboToolbox / Google Forms. Incluye una app web (Angular) y una app movil PWA (Angular + Dexie/IndexedDB) para recoleccion offline.

## Estructura

- `backend/`: Laravel 12 API (PHP 8.4).
- `frontend/`: Angular 21 SPA web (Frontend activo). Paquete: Bun 1.2.18.
- `DataField_MOVIL/kobo-mobile/`: Angular 21 app movil PWA offline-first. Paquete: npm.
- `scripts/`: wrappers de desarrollo para PowerShell, Bash y CMD (en la raiz de `DataField_WEB/`).
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
- Build estático para Netlify; las rutas se renderizan en el navegador.
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
- Asignacion con rol (`PROJECT` / `RECOLECTOR`) y respuestas objetivo (`target_responses`).
- Tabla de usuarios asignados con barra de progreso (respuestas enviadas / objetivo).
- Edicion inline de target, botones Reactivar/Retirar.
- Endpoints: `GET/POST/PATCH/DELETE /api/forms/{id}/shares`.

El dashboard (`/admin/dashboard`) tambien muestra usuarios asignados por formulario con progreso.

Las respuestas (`/admin/forms/:id/responses`) muestran contadores de progreso por usuario asignado.

## Frontend (Movil PWA) — `DataField_MOVIL/kobo-mobile/`

- Angular 21 standalone components con signals.
- Offline-first con Dexie.js (IndexedDB).
- Toast notifications via `ToastService` (signals, auto-dismiss).
- Borradores persisten en IndexedDB hasta enviar; al abrir desde la lista se inicia formulario nuevo.
- Sincronizacion con backend via `SyncService` + `ApiService`.
- Al enviar respuesta, `responses_count` local se incrementa para mantener progreso preciso.
- Perfil de usuario editable (`/perfil`).
- Build: `npx ng build` desde `DataField_MOVIL/kobo-mobile/`.

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
- No hay un endpoint HTTP para crear el superadministrador inicial. La preparación usa el seeder `AdminUserSeeder` mediante Artisan y las credenciales configuradas en el entorno; los usuarios siguientes se crean desde el panel.

El registro publico esta deshabilitado. Los usuarios se crean desde el panel administrativo.

### Archivos de las respuestas (fotos, audio, video, firmas)

- `RESPONSE_MEDIA_DRIVER=sharepoint` guarda en la biblioteca de SharePoint de ULEAM (`SharePoint__SiteId`, `SharePoint__LibraryId`; nombres acordados con DIIT, que pone los IDs de produccion en su pipeline). Ruta: `responses/{form_id}/{uuid}.{ext}`.
- Usa la app de Microsoft 365 con token de aplicacion (Graph). Hasta 4 MB se sube en una peticion; mas grande (videos) por sesion de carga en partes de 10 MiB. La vista de respuestas recibe un enlace de descarga temporal de Graph; el archivo no queda publico.
- Cada respuesta guarda `storage_driver`: los archivos anteriores en Supabase se siguen leyendo de Supabase despues de cambiar a SharePoint.
- Limites de tamaño: `RESPONSE_MEDIA_MAX_FILE_BYTES` (30 MB por archivo) y `RESPONSE_MEDIA_MAX_TOTAL_BYTES` (35 MB por respuesta); cada pregunta fija `max_file_size_mb` (tope 30).
- Duracion de video: propiedad `max_video_seconds` de la pregunta MULTIMEDIA (5 a 120 s, 60 por defecto; validada en backend). La PWA graba dentro de la app (720p, ~1 Mbps: 120 s ≈ 16 MB) y se detiene sola al llegar al limite; los videos de la galeria (PWA y `/collect`) se rechazan si duran mas. El servidor no puede medir la duracion: el control es del cliente mas el limite de tamaño.

### Autenticacion: internos (Microsoft 365) y externos (invitacion)

- Internos: correos de `AUTH_INTERNAL_EMAIL_DOMAINS` (por defecto `uleam.edu.ec`, `live.uleam.edu.ec`, `dn.uleam.edu.ec`). Con `MICROSOFT_CLIENT_ID/SECRET/TENANT_ID` configurados entran solo con Microsoft 365 (OpenID Connect): sin contraseña local, sin correo de confirmacion ni cambio de contraseña. El `SUPER_ADMIN` conserva la contraseña como acceso de emergencia. La cuenta debe existir en el panel (no se crean cuentas al entrar).
- Flujo: `GET /api/auth/microsoft/redirect?return=<frontend>/auth/microsoft` → Microsoft → `GET /api/auth/microsoft/callback` → el frontend recibe un codigo de un solo uso y lo canjea en `POST /api/auth/microsoft/exchange`. `return` solo se acepta si su origen esta en `CORS_ALLOWED_ORIGINS`. `GET /api/auth/providers` indica si Microsoft esta activo.
- Externos: al crearlos (panel o importacion de recolectores) reciben un correo de confirmacion con enlace a `FRONTEND_URL/auth/activar` (72 h) para crear su contraseña (`POST /api/auth/activate`). Reenvio: `POST /api/users/{id}/invitation`. Si un administrador les fija una contraseña, deben cambiarla al entrar.
- Correo saliente: `MAIL_MAILER=microsoft-graph` envia desde `MICROSOFT_MAIL_SENDER` (buzon propio de la app; permiso `Mail.Send` limitado a ese buzon con una Application Access Policy).
- Mientras Microsoft no este configurado, los internos se crean con contraseña como antes.
- Desarrollo local: sin `ADMIN_EMAIL`/`ADMIN_PASSWORD` en el `.env`, `AdminUserSeeder` crea `superadmin@datafield.test` (dominio de pruebas no institucional, entra con contraseña; la clave esta en el seeder). No usar un `@uleam.edu.ec` inexistente en Microsoft como superadmin de pruebas. Un `SUPER_ADMIN` con correo institucional puede entrar con contraseña desde el enlace de emergencia del login.
- Solicitudes de acceso: si alguien de ULEAM entra con Microsoft sin estar registrado se crea una cuenta inactiva con `access_request_status=PENDING`. Un `SUPER_ADMIN` o `ADMIN` la aprueba asignando rol o la rechaza en `/admin/usuarios` (`GET /api/users/access-requests`, `POST /api/users/access-requests/{id}/approve|reject`). No aparecen en la lista de usuarios ni se activan con el interruptor de estado.
- La cuenta se ata al `microsoft_oid` en el primer inicio con Microsoft: un correo reasignado a otra persona no hereda la cuenta (`error=account_mismatch`).
- Roles: el `SUPER_ADMIN` asigna cualquiera; el `ADMIN` gestiona usuarios y solo asigna `PROJECT`, `SUPERVISOR` y `RECOLECTOR`; solo el `SUPER_ADMIN` borra usuarios. Los externos solo pueden ser `RECOLECTOR` o `SUPERVISOR` (validado en backend; reglas espejo en `frontend/src/app/core/utils/role-rules.ts`).

Roles globales:

- `SUPER_ADMIN`: control total de usuarios, proyectos, formularios, configuracion y datos.
- `ADMIN`: gestiona proyectos, asigna lideres de proyecto y crea/gestiona formularios dentro de proyectos. Gestiona usuarios con roles `PROJECT`, `SUPERVISOR` y `RECOLECTOR` y aprueba solicitudes de acceso.
- `PROJECT`: gestiona formularios dentro de proyectos asignados.
- `SUPERVISOR`: supervision de campo de los proyectos asignados.
- `RECOLECTOR`: usuario movil de recoleccion; solo ve formularios asignados.

Los permisos `PROJECT` y `RECOLECTOR` pertenecen a la comparticion de formularios, no sustituyen el rol global del usuario.
La columna `target_responses` en `form_user_shares` define respuestas objetivo por usuario asignado.
Todo formulario debe pertenecer a un proyecto. Los usuarios `RECOLECTOR` no acceden al proyecto completo: solo a los formularios que tengan asignados.

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
cd ../DataField_MOVIL/kobo-mobile && npx ng build
```
