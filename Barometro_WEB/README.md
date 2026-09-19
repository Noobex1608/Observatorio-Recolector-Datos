# Observatorio ULEAM - Plataforma de Formularios

Aplicación full-stack para crear formularios dinámicos, publicarlos mediante enlaces de recolección y consultar respuestas.

Este repositorio contiene dos proyectos activos:

- `backend/` → API Laravel (PHP 8.4) dentro de Docker.
- `frontend/` → Angular 21 con SSR.

El frontend que se ejecuta y despliega es siempre `frontend/`. La carpeta `docs/legacy-root-angular/` solo conserva código antiguo que ya no está en uso.

---

## 1. Qué incluye este repositorio

- `backend/` → API REST Laravel.
- `frontend/` → aplicación web Angular.
- `scripts/` → wrappers de desarrollo para Bash/zsh, PowerShell y CMD.
- `docker-compose.yml` → orquesta PostgreSQL local y redes Docker.

---

## 2. Stack principal

- Backend: Laravel 12
- PHP: 8.4
- Frontend: Angular 21 + SSR
- Base de datos: PostgreSQL 16
- Auth: Laravel Sanctum
- Frontend package manager: Bun 1.2.18

---

## 3. Antes de empezar

### Requisitos

- Docker instalado.
- Node.js 20+ y npm 10+ (para frontend local cuando no uses los wrappers de script).
- Bun 1.2.18+ disponible si usas el frontend con Bun.

### Estructura del proyecto

```text
Barometro_WEB/
├── backend/
├── frontend/
├── scripts/
├── docker-compose.yml
└── README.md
```

---

## 4. Cómo ejecutar el frontend

### 4.1 Usando los scripts del proyecto

#### En Bash / zsh

```bash
cd Barometro_WEB
./scripts/frontend.sh install
./scripts/frontend.sh start
```

#### En PowerShell

```powershell
cd Barometro_WEB
.\scripts\frontend.ps1 install
.\scripts\frontend.ps1 start
```

#### En CMD

```cmd
cd Barometro_WEB
scripts\frontend.bat install
scripts\frontend.bat start
```

### 4.2 Comandos estándar con Bun

Si prefieres ejecutar directamente el frontend sin los scripts:

```bash
cd Barometro_WEB/frontend
bun install
bun run start
```

### 4.3 Puerto donde se sirve

- Frontend web: `http://localhost:4200`

---

## 5. Cómo ejecutar el backend

### 5.1 Usando los scripts en Bash / zsh

```bash
cd Barometro_WEB
./scripts/backend.sh install
./scripts/backend.sh migrate
./scripts/backend.sh seed
./scripts/backend.sh start
```

### 5.2 Usando los scripts en PowerShell

```powershell
cd Barometro_WEB
.\scripts\backend.ps1 install
.\scripts\backend.ps1 migrate
.\scripts\backend.ps1 seed
.\scripts\backend.ps1 start
```

### 5.3 Cuándo utilizar Docker

El backend corre dentro de Docker y se conecta a PostgreSQL. Antes de iniciar el backend, asegúrate de levantar los servicios de Docker:

#### Bash / zsh

```bash
./scripts/docker.sh up -d
```

#### PowerShell

```powershell
.\scripts\docker.ps1 up -d
```

---

## 6. Comandos importantes

### Frontend

- `./scripts/frontend.sh install` / `.\scripts\frontend.ps1 install`
- `./scripts/frontend.sh start` / `.\scripts\frontend.ps1 start`
- `./scripts/frontend.sh build` / `.\scripts\frontend.ps1 build`

### Backend

- `./scripts/backend.sh install` / `.\scripts\backend.ps1 install`
- `./scripts/backend.sh migrate` / `.\scripts\backend.ps1 migrate`
- `./scripts/backend.sh seed` / `.\scripts\backend.ps1 seed`
- `./scripts/backend.sh start` / `.\scripts\backend.ps1 start`
- `./scripts/backend.sh stop` / `.\scripts\backend.ps1 stop`
- `./scripts/backend.sh logs` / `.\scripts\backend.ps1 logs`
- `./scripts/backend.sh cache-clear` / `.\scripts\backend.ps1 cache-clear`
- `./scripts/backend.sh worker` / `.\scripts\backend.ps1 worker`
- `./scripts/backend.sh scheduler` / `.\scripts\backend.ps1 scheduler`
- `./scripts/backend.sh routes` / `.\scripts\backend.ps1 routes`
- `./scripts/backend.sh swagger` / `.\scripts\backend.ps1 swagger`

### Inicio combinado

- `./scripts/start.sh all` / `.\scripts\start.ps1 all`

---

## 7. URLs útiles

| Servicio | URL |
| --- | --- |
| Frontend | http://localhost:4200 |
| Backend API | http://localhost:8000/api |
| Swagger UI | http://localhost:8000/api/docs |
| PostgreSQL | localhost:5433 |

---

## 8. Estado actual del proyecto

- El proyecto activo está centrado en formularios dinámicos.
- El frontend actual es `frontend/`.
- `docs/legacy-root-angular/` contiene código antiguo y no debe usarse para deploy.

---

## 9. Validación básica

Para comprobar que el frontend y el backend están listos:

```bash
cd Barometro_WEB
./scripts/frontend.sh build
./scripts/backend.sh routes
./scripts/backend.sh migrate
```

En PowerShell:

```powershell
.\scripts\frontend.ps1 build
.\scripts\backend.ps1 routes
.\scripts\backend.ps1 migrate
```

---

## 10. Consejos rápidos

- Si recibes errores de permisos en Bash/zsh, asegúrate de ejecutar `chmod +x scripts/*.sh`.
- Si el puerto `4200` está ocupado, detén el proceso que lo utiliza o cambia el puerto en `frontend/angular.json`.
- Si el backend no conecta a la base de datos, comprueba que `docker compose` haya levantado PostgreSQL y que `backend/.env` esté presente.
