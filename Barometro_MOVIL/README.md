# Barometro Movil

Version movil/PWA del Barometro ULEAM para recolectar respuestas desde campo. La app esta construida con Angular 21, usa IndexedDB por medio de Dexie.js y se conecta al backend Laravel de `Barometro_WEB`.

## Para que sirve

- Iniciar sesion contra el backend web usando email, contrasena y URL del servidor.
- Descargar formularios disponibles para el usuario recolector.
- Llenar formularios aun cuando no haya conexion estable.
- Guardar respuestas como borrador o dejarlas listas para enviar.
- Sincronizar respuestas pendientes con el servidor.
- Consultar borradores, respuestas listas para enviar y respuestas enviadas.
- Cambiar ajustes locales como idioma, tema oscuro y URL del servidor.

## Estructura principal

```text
Barometro_MOVIL/
  kobo-mobile/
    src/app/
      login/              Inicio de sesion
      inicio/             Pantalla principal
      lista-encuestas/    Formularios descargados/disponibles
      llenar-encuesta/    Captura de respuestas
      borradores/         Respuestas guardadas localmente
      listo-para-enviar/  Respuestas pendientes de sincronizar
      enviados/           Historial local de envios
      ajustes/            Preferencias de la app
      perfil/             Datos del usuario
      api.service.ts      Conexion con el backend
      auth.service.ts     Sesion local
      db.service.ts       Base local IndexedDB/Dexie
      sync.service.ts     Sincronizacion
```

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Backend de `Barometro_WEB` disponible en `http://localhost:8000` para usar datos reales.

## Iniciar solo la app movil

Desde la raiz del repositorio:

```powershell
cd .\Barometro_MOVIL\kobo-mobile
npm install
npm start
```

La app se abre en:

```text
http://localhost:4201
```

El puerto 4201 esta configurado en `kobo-mobile/angular.json`.

## Iniciar todo el proyecto

Desde la raiz del repositorio puedes usar el script:

```powershell
.\iniciar-todo.ps1
```

Esto inicia:

| Servicio | URL |
| --- | --- |
| Frontend web | http://localhost:4200 |
| App movil | http://localhost:4201 |
| Backend API | http://localhost:8000/api |
| Swagger | http://localhost:8000/api/docs |
| PostgreSQL | localhost:5433 |

Si es la primera vez y faltan dependencias de frontend o movil:

```powershell
.\iniciar-todo.ps1 -Install
```

## Flujo recomendado

1. Inicia todo el proyecto con `.\iniciar-todo.ps1`.
2. Abre `http://localhost:4201`.
3. En el login usa como servidor `http://localhost:8000`.
4. Ingresa con un usuario creado desde la version web.
5. Descarga formularios.
6. Llena respuestas y guarda como borrador o listo para enviar.
7. Entra a "Listo para enviar" para sincronizar respuestas pendientes.

## Modo demo

La app tambien incluye modo demo local. Este modo permite navegar y probar el flujo sin depender del backend, pero no sincroniza datos reales con el servidor.

## Comandos utiles

```powershell
cd .\Barometro_MOVIL\kobo-mobile
npm start       # Servidor de desarrollo
npm run build   # Compilar version de produccion
npm test        # Ejecutar pruebas
```
