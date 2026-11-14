# Comandos del Proyecto

Comandos operativos para la plataforma de formularios ULEAM.

## Instalacion completa

PowerShell:

```powershell
.\scripts\install.ps1
```

CMD:

```cmd
scripts\install.bat
```

Bash:

```bash
./scripts/install.sh
```

El instalador levanta PostgreSQL, construye la imagen backend y ejecuta `bun install` en el frontend.

## Inicio rapido

```powershell
.\scripts\start.ps1 all
```

## Orquestador

| Comando | Descripcion |
| --- | --- |
| `all` | Inicia PostgreSQL, backend y frontend |
| `docker` | Inicia solo PostgreSQL |
| `backend` | Inicia Laravel API en Docker |
| `frontend` | Inicia Angular |
| `install` | Instala dependencias backend/frontend |
| `setup` | Instala dependencias, migra y ejecuta seed |
| `stop` | Detiene servicios |
| `restart` | Reinicia servicios |
| `migrate` | Ejecuta migraciones |
| `clean` | Limpia cache Laravel |
| `build` | Compila frontend |
| `check` | Chequeo de compilacion frontend |

## Backend

```powershell
.\scripts\backend.ps1 install
.\scripts\backend.ps1 migrate
.\scripts\backend.ps1 migrate-fresh-seed
.\scripts\backend.ps1 start
.\scripts\backend.ps1 routes
.\scripts\backend.ps1 swagger
.\scripts\backend.ps1 cache-clear
.\scripts\backend.ps1 logs
```

## Frontend

Bun es el gestor canonico del frontend.

```powershell
.\scripts\frontend.ps1 install
.\scripts\frontend.ps1 start
.\scripts\frontend.ps1 build
.\scripts\frontend.ps1 check
.\scripts\frontend.ps1 test
```

Desde `frontend/`:

```bash
bun install
bun run start
bun run build
bun run check
bun run test
```

No existe script de lint configurado actualmente.

## URLs

| Servicio | URL |
| --- | --- |
| Frontend | http://localhost:4200 |
| API | http://localhost:8000/api |
| Swagger UI | http://localhost:8000/api/docs |
| Swagger JSON | http://localhost:8000/api/documentation |
| PostgreSQL | localhost:5432 |

## Flujo funcional

- Login en `/auth/login`.
- Dashboard en `/admin/dashboard`.
- Builder en `/admin/forms/builder`.
- Edicion en `/admin/forms/:id/edit`.
- Respuestas en `/admin/forms/:id/responses`.
- Recoleccion publica en `/collect/:uuid`.

Ultima actualizacion: junio 2026.
