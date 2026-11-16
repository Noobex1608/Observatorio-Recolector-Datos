# KoboMobile — Indice rapido

Este archivo queda como acceso rapido a la documentacion de la app.

## Documentos

- [Guia de la app movil PWA](./GUIA_APP_MOVIL_PWA.md)
- [Manual de uso](./MANUAL_DE_USO.md)

## Si buscas empezar

1. Abre la guia de la app para ver stack, estructura y desarrollo.
2. Usa el manual de uso para el flujo operativo como recolector.

## Trabajo sin conexión

Con internet, abre el PWA de producción, inicia sesión y descarga los formularios.
Después puedes cerrar y volver a abrir la app sin conexión, completar encuestas y
guardar borradores o respuestas pendientes. Conserva la sesión iniciada. El envío
se realiza al recuperar conexión y pulsar enviar. La sesión y los datos descargados
pertenecen a la cuenta y al servidor con los que iniciaste sesión.

La caché guarda anticipadamente los archivos JavaScript, CSS, imágenes e iconos de
la aplicación. Los formularios, las respuestas y los archivos capturados se guardan
en IndexedDB; las peticiones autenticadas de la API no se guardan en una caché común.
El inicio de sesión, la descarga y el inicio de jornada requieren conexión. La
supervisión en tiempo real y los enlaces a mapas externos también requieren red.

Para probar la versión de producción en tu equipo, detén `npm start` si está usando
el puerto 4201 y ejecuta desde esta carpeta:

```powershell
npm run build
npm run preview:offline
```

Abre `http://localhost:4201`, inicia sesión y descarga un formulario. Espera a que
termine la instalación del service worker (DevTools → Application → Service Workers).
Activa Offline en DevTools → Network y recarga una ruta como `/lista` o `/borradores`.
También puedes cerrar y reabrir una pestaña en el mismo navegador. Comprueba que
puedes guardar y recuperar un borrador. Al volver a Online, envía los pendientes.

`npm start` sirve la versión de desarrollo, que no registra el service worker.
La vista previa admite otro puerto mediante `npm run preview:offline -- 4202`;
si cambias el puerto, el backend debe permitir ese origen en CORS y el navegador
tendrá un almacenamiento local distinto. En despliegue, sirve el PWA mediante HTTPS.
