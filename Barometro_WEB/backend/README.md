# Backend - Laravel API

Este es el backend del proyecto `Barometro_WEB`. Aquí se documenta de forma clara cómo ejecutar la API Laravel.

## ¿Qué hace este backend?

El backend expone la API REST para la plataforma de recolección de datos. Las funciones principales son:

- Autenticación con Laravel Sanctum.
- Gestión de usuarios y roles (`SUPER_ADMIN`, `ADMIN`, `PROJECT_LEADER`, `USER`).
- Gestión de proyectos y formularios dinamicos.
- CRUD de formularios, preguntas y permisos.
- Recolección de respuestas y estadísticas.
- Sincronización de respuestas con Supabase (cuando está configurado).
- Cola de trabajos (`worker`) y scheduler de tareas programadas.

## Estructura rápida de los scripts

Los scripts disponibles son:

- `Barometro_WEB/scripts/backend.sh` → para Bash / zsh.
- `Barometro_WEB/scripts/backend.ps1` → para PowerShell en Windows.
- `Barometro_WEB/scripts/docker.sh` / `Barometro_WEB/scripts/docker.ps1` → levantan PostgreSQL y redes Docker necesarias.

Ambos `backend.sh` y `backend.ps1` ejecutan el backend dentro de un contenedor Docker y montan el código fuente para desarrollo.

## Requisitos previos

Antes de ejecutar el backend, asegúrate de tener:

- Docker instalado.
- El proyecto clonado en tu equipo.
- El servicio PostgreSQL levantado usando los scripts de Docker.

## Iniciar PostgreSQL y la red Docker

### Bash / zsh

```bash
cd /Vinculacion/Barometro_WEB
./scripts/docker.sh up -d
```

### PowerShell

```powershell
cd Vinculacion\Barometro_WEB
.\scripts\docker.ps1 up -d
```

## Comandos principales del backend

### Arrancar el backend

### Bash / zsh

```bash
cd Vinculacion/Barometro_WEB
./scripts/backend.sh start
```

### PowerShell

```powershell
cd Vinculacion\Barometro_WEB
.\scripts\backend.ps1 start
```

El backend quedará disponible en:

- `http://127.0.0.1:8000`

### Detener el backend

### Bash / zsh

```bash
./scripts/backend.sh stop
```

### PowerShell

```powershell
.\scripts\backend.ps1 stop
```

### Ver logs del backend

### Bash / zsh

```bash
./scripts/backend.sh logs
```

### PowerShell

```powershell
.\scripts\backend.ps1 logs
```

### Limpiar caché de Laravel

### Bash / zsh

```bash
./scripts/backend.sh cache-clear
```

### PowerShell

```powershell
.\scripts\backend.ps1 cache-clear
```

### Ejecutar worker de colas

### Bash / zsh

```bash
./scripts/backend.sh worker
```

### PowerShell

```powershell
.\scripts\backend.ps1 worker
```

### Ejecutar scheduler de Laravel

### Bash / zsh

```bash
./scripts/backend.sh scheduler
```

### PowerShell

```powershell
.\scripts\backend.ps1 scheduler
```

## Comandos adicionales útiles

### Construir la imagen del backend

```bash
./scripts/backend.sh install
```

```powershell
.\scripts\backend.ps1 install
```

### Ejecutar migraciones

```bash
./scripts/backend.sh migrate
```

```powershell
.\scripts\backend.ps1 migrate
```

### Ejecutar seeders

```bash
./scripts/backend.sh seed
```

```powershell
.\scripts\backend.ps1 seed
```

### Eliminar y volver a crear la base de datos

```bash
./scripts/backend.sh migrate-fresh
```

```powershell
.\scripts\backend.ps1 migrate-fresh
```

### Eliminar, crear y seedear la base de datos

```bash
./scripts/backend.sh migrate-fresh-seed
```

```powershell
.\scripts\backend.ps1 migrate-fresh-seed
```

### Generar documentación Swagger

```bash
./scripts/backend.sh swagger
```

```powershell
.\scripts\backend.ps1 swagger
```

### Listar rutas de API

```bash
./scripts/backend.sh routes
```

```powershell
.\scripts\backend.ps1 routes
```

### Iniciar Tinker

```bash
./scripts/backend.sh tinker
```

```powershell
.\scripts\backend.ps1 tinker
```

## Configuración del entorno

Si `backend/.env` no existe, los scripts lo crearán automáticamente desde `backend/.env.example`.

El backend usa Docker para ejecutar Laravel, y al iniciar detecta si PostgreSQL ya está en una red Docker válida. Si no puede conectarse directamente a la red del contenedor PostgreSQL, usa `host.docker.internal:5433` como fallback.

### Variables importantes en `backend/.env`

- `DB_HOST`
- `DB_PORT`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SCHEMA`
- `SUPABASE_RESPONSES_TABLE`
- `QUEUE_CONNECTION=database`

## ¿Qué hacen los comandos nuevos?

- `./scripts/backend.sh logs` / `.\scripts\backend.ps1 logs`
  - Sigue los logs del contenedor backend en tiempo real.

- `./scripts/backend.sh cache-clear` / `.\scripts\backend.ps1 cache-clear`
  - Borra las cachés de configuración, ruta y vista de Laravel.

- `./scripts/backend.sh stop` / `.\scripts\backend.ps1 stop`
  - Detiene todos los contenedores del backend, worker y scheduler.

- `./scripts/backend.sh start` / `.\scripts\backend.ps1 start`
  - Arranca el backend Laravel en Docker y expone `localhost:8000`.

- `./scripts/backend.sh worker` / `.\scripts\backend.ps1 worker`
  - Inicia el worker de colas de Laravel para procesar trabajos en segundo plano.

- `./scripts/backend.sh scheduler` / `.\scripts\backend.ps1 scheduler`
  - Inicia el scheduler de Laravel para ejecutar tareas programadas.

## Inicio rápido completo

### Bash / zsh

```bash
cd Vinculacion/Barometro_WEB
./scripts/docker.sh up -d
./scripts/backend.sh install
./scripts/backend.sh migrate
./scripts/backend.sh seed
./scripts/backend.sh start
./scripts/backend.sh logs
```

### PowerShell

```powershell
cd C:\Users\taylor\Documents\Vinculacion\Barometro_WEB
.\scripts\docker.ps1 up -d
.\scripts\backend.ps1 install
.\scripts\backend.ps1 migrate
.\scripts\backend.ps1 seed
.\scripts\backend.ps1 start
.\scripts\backend.ps1 logs
```

## URLs importantes

- Backend API: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/api/docs`

## Notas finales

Mantén `backend/.env` actualizado y ejecuta `cache-clear` después de cambiar configuración o rutas.

Si necesitas detener todo, usa `stop` y luego vuelve a iniciar con `start`.
