# Guia de la app movil PWA

Aplicacion web movil **PWA** para la recoleccion de datos en campo, inspirada en KoboCollect. Funciona **offline-first**: descarga formularios, los llena sin conexion y sincroniza cuando vuelve a tener internet.

## Manual de uso

Para aprender a usar la app como recolector, consulta:

➡️ **[MANUAL_DE_USO.md](./MANUAL_DE_USO.md)**

### Primeros pasos para el recolector

1. **Las credenciales te las da el administrador** (no hay registro publico). Debes recibir de el 3 datos: **URL del servidor**, **usuario** (tu correo) y **contrasena**.
2. **Abre la app** en el navegador de tu celular o computadora. La **URL de la app** (ej. `http://192.168.1.10:4201`) es distinta de la **URL del servidor** (ej. `http://192.168.1.10:8000`).
3. En la pantalla de acceso escribe la **URL del servidor sin `/api`**, tu usuario y tu contrasena, y pulsa **Acceder**.
4. Descarga los formularios que te asignaron, llenalos (funciona sin internet) y envialos desde **Listo para enviar**.

> La app termina en el puerto `4201` y el servidor en `8000`. Ninguno lleva `/api` al final.

## Stack

| Capa | Tecnologia |
|------|-----------|
| Framework | Angular 21 (standalone components, signals) |
| Almacenamiento offline | Dexie.js (IndexedDB) |
| PWA | Service worker + instalable |
| Idioma / tema | `ThemeService` (ES/EN, modo oscuro) |
| Backend | Laravel API (`Barometro_WEB/backend`) |

## Desarrollo

```bash
npm install
npx ng serve        # abre en http://localhost:4201
```

## Estructura

```text
src/app/
├── login/              # Inicio de sesion (servidor + usuario + contrasena)
├── inicio/             # Menu principal (descargar, borradores, envios)
├── lista-encuestas/    # Formularios descargados/disponibles
├── llenar-encuesta/    # Llenado de formularios (offline)
├── borradores/         # Borradores guardados
├── listo-para-enviar/  # Pendientes de envio al servidor
├── enviados/           # Historial de enviados
├── ajustes/            # Idioma, modo oscuro, servidor, limpieza
├── perfil/             # Edicion de datos del usuario
├── auth.service.ts     # Autenticacion con Laravel Sanctum
├── sync.service.ts     # Sincronizacion con el servidor
├── db.service.ts       # Dexie.js (IndexedDB)
├── storage.service.ts  # Almacenamiento de respuestas
├── theme.service.ts    # Modo oscuro + idioma
└── translate.pipe.ts   # Pipe de traduccion ES/EN
```

## Tipos de preguntas soportados

- `TEXT`, `NUMBER`, `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `LIKERT` (matriz).