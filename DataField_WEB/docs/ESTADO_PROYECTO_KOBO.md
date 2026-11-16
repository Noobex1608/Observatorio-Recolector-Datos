# Estado del Proyecto Kobo

## Objetivo

Consolidar una plataforma de formularios dinamicos y recoleccion de datos, inspirada en KoboToolbox / Google Forms.

## Stack actual

- Backend: Laravel 12 API en Docker.
- Frontend: Angular 21 con SSR.
- Base de datos: PostgreSQL 16.
- Package manager frontend: Bun 1.2.18.

## Flujo principal

- Login administrativo.
- Creacion de usuarios desde el panel.
- Creacion y edicion de formularios.
- Comparticion con colaboradores `EDITOR` o `LECTOR`.
- Implementacion de formularios para obtener `/collect/:uuid`.
- Captura publica de respuestas.
- Consulta, graficos y exportacion de respuestas.

## Roles actuales

- `SUPER_ADMIN`: gestiona usuarios y administradores, puede desactivar/eliminar usuarios y revisar todos los formularios para eliminarlos si incumplen normas.
- `ADMIN`: crea y gestiona usuarios normales.
- `USER`: crea proyectos/formularios propios e invita colaboradores de formulario como `EDITOR` o `LECTOR`.

## Cambios ya aplicados

- Registro publico retirado en frontend y backend.
- Rutas publicas antiguas del observatorio retiradas del flujo activo.
- Frontend legacy de observatorio eliminado.
- Scripts normalizados para Docker + Bun.
- `baseUrl` eliminado de TypeScript; aliases migrados a `paths` relativos.
- `rootDir` declarado en `tsconfig.app.json`.
- Documentacion actualizada al contexto de formularios.
- Archivos de datos historicos de Pedernales eliminados de `docs/`.
- Swagger limitado a los controladores activos del flujo de formularios.

## Validacion recomendada

```powershell
.\scripts\frontend.ps1 build
.\scripts\backend.ps1 routes
.\scripts\backend.ps1 migrate
```

## Pendiente

- Validar periodicamente que Swagger y rutas activas solo documenten formularios, usuarios, perfil, auth y seed.
