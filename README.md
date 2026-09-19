# ULEAM PWA — Plataforma de Recolección de Datos

Sistema inspirado en **KoboCollect + KoboToolbox** para la recolección de datos móvil con una plataforma web de administración.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| **Backend API** | Laravel 12, PHP 8.4 (Docker) |
| **Base de datos** | PostgreSQL 16 (Docker) |
| **Frontend Web** | Angular 21 con SSR, Bun 1.2.18 |
| **App Móvil** | Angular 21 standalone, Dexie.js (IndexedDB), PWA |
| **Auth** | Laravel Sanctum (tokens) |
| **Nube / Sync** | Supabase (Auth + PostgreSQL + REST/PostgREST) |

---

## Estructura del proyecto

```
Vinculacion-main/
├── Barometro_WEB/                 # Plataforma web completa
│   ├── backend/                   #   Laravel API + Dockerfile
│   │   ├── app/Jobs/              #   Jobs de sincronizacion con Supabase
│   │   ├── app/Models/ResponseSyncQueue.php  #   Cola local de respuestas por sincronizar
│   │   └── database/migrations/   #   Migraciones (incluye tabla de cola + supabase_auth_id)
│   ├── frontend/                  #   Angular 21 web SPA
│   ├── scripts/                   #   Scripts de desarrollo (.ps1, .sh, .bat)
│   ├── docker-compose.yml         #   PostgreSQL 16
│   └── README.md                  #   Documentación detallada de la web
│
├── Barometro_MOVIL/
│   └── kobo-mobile/               # App móvil Angular 21
│       ├── src/app/
│       │   ├── inicio/            #   Pantalla principal con menú
│       │   ├── login/             #   Login con email + servidor
│       │   ├── lista-encuestas/   #   Lista de formularios descargados
│       │   ├── llenar-encuesta/   #   Llenar formulario (offline)
│       │   ├── borradores/        #   Borradores guardados
│       │   ├── listo-para-enviar/ #   Pendientes de envío
│       │   ├── enviados/          #   Formularios enviados
│       │   ├── ajustes/           #   Ajustes (idioma, modo oscuro, servidor)
│       │   ├── auth.service.ts    #   Servicio de autenticación
│       │   ├── sync.service.ts    #   Sincronización con el servidor
│       │   ├── db.service.ts      #   Dexie.js (IndexedDB)
│       │   ├── storage.service.ts #   Almacenamiento de respuestas
│       │   ├── theme.service.ts   #   Modo oscuro + idioma
│       │   └── translate.pipe.ts  #   Pipe de traducción ES/EN
│       └── ...
│
└── README.md                      # Este archivo
```

---

## Funcionalidades implementadas (app móvil)

### Autenticación
- Login con email + contraseña + URL del servidor
- Tokens Sanctum que **no revocan** sesiones activas (web y móvil simultáneos)
- Soporta los roles: SUPER_ADMIN, ADMIN, PROJECT, RECOLECTOR

### Descarga de formularios
- Selector con checkboxes: elige qué formularios bajar del servidor
- Almacenamiento en IndexedDB para uso offline

### Llenado de formularios
- Soporta tipos: TEXT, NUMBER, SINGLE_CHOICE, MULTIPLE_CHOICE, LIKERT (matriz)
- **Guardar borrador** → `estado: 'borrador'` (se puede continuar después)
- **Guardar y enviar** → `estado: 'listo-para-enviar'` (pendiente de sincronización)
- Carga automática del borrador previo si existe

### Envío al servidor
- Lista de pendientes con selección múltiple
- Progreso de envío
- Incluye `user_id` + `duration` + respuestas en JSON

### Gestión local
- **Borradores**: ver, continuar llenando, eliminar
- **Enviados**: historial de formularios subidos
- **Borrar formularios**: selector con checkboxes (solo local, no del servidor)

### Modo oscuro
- Toggle en Ajustes y en el header del Inicio
- Paleta de colores tipo GitHub Dark (`#0d1117`)
- Persiste en `localStorage`
- CSS variables en todos los componentes

### Idioma (ES/EN)
- Toggle en Ajustes y en el header del Inicio
- Traducción de etiquetas principales con pipe `| translate`
- Persiste en `localStorage`

---

## Requisitos previos

| Herramienta | Versión | Propósito |
|------------|---------|-----------|
| Docker | última | PostgreSQL + backend Laravel |
| Bun | 1.2.18+ | Frontend web |
| Node.js | 20+ | App móvil |
| npm | 10+ | App móvil |

---

## Cómo iniciar todo

> **IMPORTANTE sobre Docker**: PostgreSQL y el backend Laravel corren **cada uno en su propio contenedor**. Deben estar en la **misma red de Docker** para comunicarse. La red se crea automáticamente al levantar PostgreSQL con `docker compose`.

### Paso 1 — PostgreSQL

```bash
cd Barometro_WEB
docker compose up -d
```

Esto crea:
- Contenedor `observatorio_db` con PostgreSQL 16
- Red `barometro_web_default`
- Puerto `5433` en tu PC → `5432` dentro del contenedor
- Base de datos: `observatorio_uleam`, usuario: `postgres`, contraseña: `secret123`

---

### Paso 2 — Backend (Laravel API)

#### 2a. Configurar `.env`

```bash
cd Barometro_WEB/backend
cp .env.example .env
```

Asegúrate de que el `.env` tenga estos valores para conexión con PostgreSQL **dentro de Docker**:

```
DB_HOST=observatorio_db
DB_PORT=5432
DB_DATABASE=observatorio_uleam
DB_USERNAME=postgres
DB_PASSWORD=secret123
```

#### 2b. Construir la imagen (solo la primera vez)

```bash
docker build -t observatorio-backend .
```

#### 2c. Iniciar el contenedor

```bash
docker run -d --name observatorio-backend -p 8000:8000 \
  --network barometro_web_default \
  -v "$(pwd)/.env:/var/www/html/.env" \
  observatorio-backend
```

**Explicación de cada flag:**
| Flag | Por qué |
|------|---------|
| `-p 8000:8000` | Expone la API en tu `localhost:8000` |
| `--network barometro_web_default` | Conecta el backend a la misma red que PostgreSQL |
| `-v "$(pwd)/.env:/var/www/html/.env"` | Monta el `.env` dentro del contenedor |

#### 2d. Verificar que funciona

```bash
curl http://localhost:8000/api/forms
```

Si ves `{"message":"No autenticado."}` es normal — significa que la API responde correctamente.

#### 2e. Migraciones y Super Admin

Las migraciones se ejecutan automáticamente al iniciar el contenedor. Si necesitas ejecutarlas manualmente:

```bash
docker exec observatorio-backend php artisan migrate --force
```

Para crear el Super Admin:

```bash
docker exec observatorio-backend php artisan db:seed --class=AdminUserSeeder
```

**Credenciales**: usa las que tenga configuradas tu archivo `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`)

#### 2f. Volver a encender el backend después de apagar

```bash
docker start observatorio-backend
```

#### 2g. Si cambias el `.env` y necesitas reiniciar

```bash
docker rm -f observatorio-backend
docker run -d --name observatorio-backend -p 8000:8000 \
  --network barometro_web_default \
  -v "$(pwd)/.env:/var/www/html/.env" \
  observatorio-backend
```

---

### Paso 3 — Frontend Web (Angular 21)

```bash
cd Barometro_WEB/frontend
bun install
bun run start
# Abre en: http://localhost:4200
```

> Puerto fijo en `angular.json` línea 76: `"port": 4200`

---

### Paso 4 — App Móvil (Angular 21 + PWA)

```bash
cd Barometro_MOVIL/kobo-mobile
npm install
npx ng serve
# Abre en: http://localhost:4201
```

> Puerto fijo en `angular.json` línea 64: `"port": 4201`

---

### Resumen: orden de arranque

```
1. docker compose up -d                → PostgreSQL (puerto 5433)
2. docker run ... observatorio-backend → Backend API (puerto 8000)
3. bun run start (frontend/)           → Frontend web (puerto 4200)
4. npx ng serve (kobo-mobile/)         → App móvil (puerto 4201)
```

---

## Conexión con Supabase

El backend se conecta a **Supabase** para replicar los datos en la nube: los formularios, sus preguntas y las respuestas recolectadas se sincronizan automáticamente, y la creación/actualización de usuarios se refleja en **Supabase Auth**.

### 1. Configuración en `backend/.env`

```
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_SCHEMA=public
SUPABASE_SURVEYS_TABLE=surveys
SUPABASE_QUESTIONS_TABLE=questions
SUPABASE_RESPONSES_TABLE=responses
SUPABASE_MAX_RETRY_ATTEMPTS=12
SUPABASE_RETRY_BASE_SECONDS=30
```

> La `SUPABASE_SERVICE_ROLE_KEY` (clave **secret**, formato `sb_secret_...`) se obtiene en Supabase Dashboard → Project Settings → API Keys. **No** uses la clave publishable/anon en el backend (no tiene permisos para escribir).

### 2. Tablas requeridas en Supabase

El backend asume que existen tres tablas en el schema `public`. Créalas desde el SQL Editor del dashboard (o con `psql`):

```sql
create table if not exists public.surveys (
    id uuid primary key,
    title text not null,
    description text,
    state text not null default 'DRAFT',
    link_uuid uuid,
    step_by_step boolean not null default false,
    owner_user_id bigint,
    created_at timestamptz,
    updated_at timestamptz
);
alter table public.surveys enable row level security;

create table if not exists public.questions (
    id uuid primary key,
    survey_id uuid not null references public.surveys(id) on delete cascade,
    type text not null,
    label text not null,
    required boolean not null default false,
    "order" integer not null default 0,
    help_text text,
    properties jsonb,
    created_at timestamptz,
    updated_at timestamptz
);
alter table public.questions enable row level security;
create index if not exists questions_survey_id_idx on public.questions(survey_id);

create table if not exists public.responses (
    id uuid primary key,
    form_id uuid not null references public.surveys(id) on delete cascade,
    user_id bigint,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz,
    updated_at timestamptz
);
alter table public.responses enable row level security;
create index if not exists responses_form_id_idx on public.responses(form_id);
```

### 3. Cómo funciona la sincronización

| Evento | Qué ocurre |
|--------|------------|
| **Crear / actualizar usuario** | Se registra en **Supabase Auth** (con rol en `app_metadata`) y se guarda su `supabase_auth_id` en la tabla local `users`. |
| **Crear / actualizar / desplegar / archivar formulario** | El job `SyncFormSchemaToSupabase` escribe en `surveys` y `questions`. |
| **Enviar una respuesta** | El job `SyncFormResponseToSupabase` escribe en `responses`. |

- Los envíos se encolan localmente en la tabla `response_sync_queue` (modelo `ResponseSyncQueue`) con reintentos configurables (`SUPABASE_MAX_RETRY_ATTEMPTS`, `SUPABASE_RETRY_BASE_SECONDS`).
- Con `QUEUE_CONNECTION=sync` los jobs se ejecutan de inmediato. Para procesamiento en segundo plano, usa una cola Redis/database y `php artisan queue:work`.

### 4. Solución de problemas con Supabase

| Síntoma | Causa / solución |
|---------|------------------|
| `cURL error 6: Could not resolve host` | `SUPABASE_URL` apunta a un proyecto inexistente/eliminado. Verifica la URL de un proyecto activo. |
| `Class "App\Jobs\Sync...Supabase" not found` | Faltan los archivos de `app/Jobs/` (ver estructura del proyecto). |
| `PGRST205 Could not find the table` | Las tablas de la sección 2 aún no existen en Supabase. Ejecuta el SQL. |
| Auth crea el usuario pero falla el guardado local | Falta la columna `supabase_auth_id` en `users`. Ejecuta `php artisan migrate`. |

---

## Solución de problemas comunes

### "Connection refused" en `localhost:8000/api/forms`
→ El backend no conecta con PostgreSQL.

Verifica:
```bash
docker ps                              # ¿están los contenedores vivos?
docker logs observatorio-backend       # ¿hay errores de conexión?
```

Si ves `Connection refused` a `127.0.0.1:5433`, asegúrate de que en `backend/.env` tengas:
```
DB_HOST=observatorio_db
DB_PORT=5432
```

### "port 4200 is already in use"
→ Otro proceso ocupa ese puerto.

Solución en Linux:
```bash
sudo lsof -i :4200  # encontrar el proceso
kill -9 <PID>       # matarlo
```

### El backend inicia pero responde vacío (ERR_EMPTY_RESPONSE)
→ El `.env` no está montado o la `APP_KEY` no se generó.

Solución: borra y recrea el contenedor montando el `.env`:
```bash
docker rm -f observatorio-backend
# usar el comando del paso 2c con -v
```

---

## URLs por servicio

| Servicio | URL |
|----------|-----|
| Frontend Web | http://localhost:4200 |
| App Móvil | http://localhost:4201 |
| Backend API | http://localhost:8000/api |
| Swagger UI | http://localhost:8000/api/docs |
| PostgreSQL | `localhost:5433` — user: `postgres`, pass: `secret123`, db: `observatorio_uleam` |

---

## Script de arranque completo

Para iniciar PostgreSQL, backend, frontend web y app movil desde la raiz del proyecto:

```powershell
.\iniciar-todo.ps1
```

Si es la primera vez y necesitas instalar dependencias de la web y la app movil:

```powershell
.\iniciar-todo.ps1 -Install
```

El script deja el backend en Docker y abre dos terminales de desarrollo: una para `Barometro_WEB/frontend` y otra para `Barometro_MOVIL/kobo-mobile`.

---

## Flujo de uso (app móvil)

1. Abrir http://localhost:4201
2. Ingresar:
   - **Servidor**: `http://localhost:8000`
   - **Email**: (el que te asignó el admin)
   - **Contraseña**: (la que te asignó el admin)
3. En el Inicio, presionar **Descargar formulario** → seleccionar los que necesites
4. Ir a **Llenar nuevo formulario** → elegir uno
5. Llenar las preguntas, usar **💾 Guardar Borrador** o **✅ Guardar y Enviar**
6. Desde el Inicio, acceder a **Borradores**, **Listo para enviar** o **Enviados**
7. En Ajustes: cambiar idioma (ES/EN), modo oscuro, URL del servidor

---

## Endpoints clave (backend)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/login` | Login (email + password) |
| GET | `/api/mobile/forms` | Lista de formularios DEPLOYED para móvil |
| GET | `/api/mobile/forms/metadata` | Metadatos de formularios (sin preguntas, sincronización rápida) |
| POST | `/api/mobile/submit` | Enviar respuestas desde la app |
| POST | `/api/collect/{uuid}` | Submit público por link_uuid |

---

## Documentación relacionada

- [`Barometro_WEB/README.md`](./Barometro_WEB/README.md) — Documentación completa del frontend web
- [`Barometro_WEB/backend/README.md`](./Barometro_WEB/backend/README.md) — Backend: rutas, roles, Swagger
- [`Barometro_WEB/backend/DOCKER.md`](./Barometro_WEB/backend/DOCKER.md) — Docker workflow detallado
- [`Barometro_MOVIL/kobo-mobile/MANUAL_DE_USO.md`](./Barometro_MOVIL/kobo-mobile/MANUAL_DE_USO.md) — Manual de uso de la app móvil (para recolectores)
- [`Barometro_WEB/docs/ESTADO_PROYECTO_KOBO.md`](./Barometro_WEB/docs/ESTADO_PROYECTO_KOBO.md) — Estado del proyecto
