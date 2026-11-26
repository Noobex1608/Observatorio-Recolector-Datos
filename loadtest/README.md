# Pruebas de carga de la API (k6)

Respaldo de las pruebas de capacidad de ULEAM DataField: qué se probó, contra qué, cómo repetirlo y
qué resultó. Los números están en [Resultados](#resultados); los datos crudos, en `resultados/`.

## Contra qué servidor

**Una copia local de la API, no producción.** Nunca se envió tráfico de prueba al servidor real.

- `compose.yml` levanta la misma imagen que se despliega (`deploy/api/Dockerfile`) con **los mismos
  límites de `deploy/compose.yml`: API 1 CPU / 1 GB y base de datos 1 CPU / 2 GB**, PHP-FPM con la
  configuración de `deploy/api/php-fpm.conf` (12 workers) y `memory_limit` de 256 MB.
- La base de datos es PostgreSQL 18.6 con datos sembrados por `seed.php`: 400 encuestadores,
  3 formularios de 20 preguntas y **100.000 respuestas previas**, para que las consultas tengan volumen.
- Los archivos de las respuestas no van a SharePoint ni a Supabase: van a `almacenamiento-simulado.php`,
  que responde como el Storage de Supabase, recibe el archivo completo y lo descarta.
  `STUB_DELAY_MS` agrega una demora por subida para imitar la red.
- El equipo y la versión exactos de cada corrida están en `resultados/entorno.txt`.

**Qué tan comparable es con producción.** Los límites de CPU y memoria son los mismos, pero 1 CPU de este
equipo no es exactamente 1 CPU del servidor. Además, k6 corre en la misma máquina (fuera de los límites
de la API) y no hay red de por medio, ni Traefik, ni latencia real hacia SharePoint. Los números sirven
para comparar escenarios y ubicar el orden de magnitud. No son una garantía de producción.

## Qué prueba cada script

| Script | Rutas | Qué representa |
|---|---|---|
| `k6-campo.js` | `GET /api/mobile/forms/metadata` (40 %), `GET /api/user` (15 %), `GET /api/mobile/forms` (15 %), `POST /api/mobile/submit` sin archivos (30 %) | Los **400 encuestadores** usando la PWA. Cada usuario virtual tiene su propio token y su propia IP (`X-Forwarded-For`). |
| `k6-escritura.js` | `POST /api/mobile/submit` sin archivos, con zona | Solo envíos, a ritmo fijo, para ver dónde se satura la escritura. |
| `k6-fotos.js` | `POST /api/mobile/submit` con **una foto de 1, 5 o 30 MB** | Envíos con archivo, como los manda la PWA: la foto va en base64 dentro del JSON (30 MB son unos 40 MB de JSON). |
| `k6-exportaciones.js` | `GET /api/forms/{id}/export?format=csv\|xlsx` | Varias **exportaciones a la vez** (riesgo de memoria). CSV sobre los formularios grandes; XLSX sobre 1.000 respuestas, el máximo que permite el código. |
| `k6-mixta.js` | Las tres anteriores **en la misma corrida** | Los 400 encuestadores con ritmo de campo, fotos de 0,5 MB (lo que manda la PWA ahora que las reduce) a 30 por minuto con 3 s por subida, y 6 exportaciones CSV que arrancan juntas al minuto 3. |
| `k6-campo.js` con `IP_COMPARTIDA` | Igual que `k6-campo.js` | Los 400 encuestadores **detrás de una sola IP**, como una brigada o un campus en la misma red. Comprueba que el límite de envíos es por persona y no por IP. |

### Qué significa «400 usuarios» en `k6-campo.js`

Son **400 usuarios virtuales a la vez**, con dos perfiles:

| Perfil | Pausa entre acciones | Duración | Qué simula |
|---|---|---|---|
| `campo` | 10 a 30 s al azar | 7,5 min: 2 min de subida, **5 min sostenido en 400**, 30 s de bajada | 400 encuestadores trabajando: la mayor parte del tiempo llenan la encuesta en el teléfono y de vez en cuando sincronizan o envían. |
| `estres` | 0,1 s (prácticamente sin pausa) | 5,5 min: 1 min a 100, 1 min a 400, **3 min sostenido en 400**, 30 s de bajada | El peor caso: los 400 pidiendo cosas sin parar. No es un uso real, sirve para ver el límite. |

## Cómo repetirlo

```sh
# Desde la raíz del repositorio: construir la imagen igual que en producción
docker build -t udf-api-base DataField_WEB/backend
docker build -f deploy/api/Dockerfile --build-arg BASE=udf-api-base -t udf-api-local .

# Desde loadtest/: corre todo (~30 min), borra y vuelve a crear la base de la copia local
sh correr-respaldo.sh
```

`correr-respaldo.sh` registra el entorno, genera las fotos de prueba, siembra los datos y corre todas
las pruebas. Mientras corre cada una, muestrea CPU y memoria de la API y la base cada ~2 s. Por cada
prueba deja en `resultados/`:

- `<prueba>.txt`: salida completa de k6.
- `<prueba>.json`: resumen exportado por k6 (`--summary-export`).
- `<prueba>-contenedor.txt`: si el contenedor o algún worker de PHP murió por memoria.
- `recursos-<prueba>.csv`: CPU y memoria durante la prueba.

Los tokens (`tokens.json`) y las fotos (`fotos/`) se generan en cada corrida y no se suben al repositorio.

## Resultados

Corrida del **25/11/2026** sobre el commit `f0f2f25` (detalle del equipo en `resultados/entorno.txt`):
Intel Core i7-11800H; la API limitada a 1 CPU / 1 GB y la base a 1 CPU / 2 GB, con 101.000 respuestas
previas. En **ninguna** prueba murió el contenedor ni algún worker de PHP por memoria
(`resultados/*-contenedor.txt`).

### 1. Los «400 usuarios» (`k6-campo.js`)

| Perfil | Duración | Peticiones | Peticiones/s (promedio de toda la prueba) | Errores | p95 | p99 | Máx. | CPU de la API (mediana / máx.) | Memoria máx. de la API |
|---|---|---|---|---|---|---|---|---|---|
| **campo** (pausas de 10 a 30 s) | 7,5 min | 7.701 | 16,1 | **0 %** | **115 ms** | 294 ms | 719 ms | 38 % / 99 % | 110 MiB |
| **estrés** (sin pausas) | 5,5 min | 10.781 | 32,7 | **0 %** | **13,0 s** | 13,4 s | 13,8 s | 100 % / 100 % | 134 MiB |

p95 por ruta en el perfil campo: envío 125 ms, avance 104 ms, descarga de formularios 136 ms, usuario 85 ms.

**Lectura:**
- Con ritmo de campo, 400 encuestadores se atienden sin errores y con respuestas de ~0,1 s. La API usa
  menos de la mitad de su CPU la mayor parte del tiempo.
- Con los 400 pidiendo sin pausa **tampoco hay errores, pero las peticiones hacen fila**: la API está al
  100 % de su CPU, atiende unas 33 peticiones por segundo y cada persona espera ~12 s. **El límite es la CPU**,
  como dice TI. No es un uso real (nadie envía sin parar), pero marca el techo: **~33 peticiones/s** con 1 CPU.

### 2. Envíos con foto

**Una foto a la vez** (`fotos-curl.sh`, `resultados/fotos-curl.txt`):

| Foto | JSON enviado | Tiempo del envío |
|---|---|---|
| 1 MB | 1,4 MB | 1,1 s |
| 5 MB | 7,0 MB | 1,4 a 1,7 s |
| 30 MB | 41,9 MB | 2,9 a 3,4 s |

Unos **1,0 s de cada envío son del almacenamiento simulado, no de la API**. El cliente HTTP de Laravel
(Guzzle) manda `Expect: 100-continue` en las subidas de más de 1 MB y espera hasta 1 s la respuesta; el
servidor integrado de PHP no la da (medido: 1,005 s con el encabezado y 0,004 s sin él). Ese segundo
hace de «latencia de red hacia el almacenamiento». Sin él, la API procesa una foto de 30 MB en ~2 s.

**Varias fotos de 30 MB a la vez** (el peor caso de memoria):

| Fotos de 30 MB simultáneas | Resultado | La primera termina en | La última termina en | Memoria máx. de la API |
|---|---|---|---|---|
| 1 | 1/1 OK | 3,1 s | 3,1 s | 193 MiB |
| 4 | 4/4 OK | 9,2 s | 13,6 s | 452 MiB |
| 8 | 8/8 OK | 19,9 s | 30,7 s | **1.019 MiB** |
| 12 | 12/12 OK | 33,8 s | 50,7 s | **1.022 MiB** (tope: 1.024) |

**Ritmo sostenido** (`k6-fotos.js`, todas al mismo formulario):

| Escenario | Enviados | Errores | p95 | Observación |
|---|---|---|---|---|
| 1 MB, 60 por minuto | 121 | 0 % | 5,5 s | La API usa solo un 10 % de CPU (mediana): esperan en fila, no por CPU. |
| 5 MB, 30 por minuto | 61 | 0 % | 1,6 s | Sin fila. |
| 5 MB, 30 por minuto, **subida de 4 s** (3 s extra) | 35 | 0 % | **61,8 s** | Solo ~14 envíos/min; k6 descartó 12 por no poder lanzarlos a tiempo. |

**Lectura:**
- **Memoria:** cada foto de 30 MB en proceso usa ~100 MB de la API (el JSON de 42 MB más sus copias al
  validar y decodificar el base64). Con 8 a la vez ya se llega al tope de 1 GB. En la prueba no murió
  nada (parte de esa cifra es caché de archivos que el sistema libera), pero **no queda margen**: 12 fotos
  grandes a la vez más cualquier otra cosa pesada (una exportación) pueden agotar la memoria.
- **Hallazgo: los envíos con foto al mismo formulario van en fila.** Cada envío bloquea la fila del
  formulario (para las metas) y **la subida del archivo al almacenamiento ocurre con ese bloqueo tomado**
  (`StoreFormResponse`). Por eso las 12 fotos terminan una cada ~1,5 s, y con una subida de 4 s el
  formulario no pasa de ~14 envíos con foto por minuto. **En producción el tiempo de subida a SharePoint
  pasa directo a ser tiempo de espera de los demás encuestadores de ese formulario.**

### 3. Exportaciones simultáneas (`k6-exportaciones.js`)

| Prueba | Resultado | Tiempo de cada una | Tamaño | Memoria máx. de la API | CPU |
|---|---|---|---|---|---|
| 6 CSV a la vez (formularios de ~35.000 respuestas) | 6/6 OK | 38,4 s | 20 MB c/u | **530 MiB** | 100 % |
| 5 XLSX a la vez (1.000 respuestas, el máximo permitido) | 5/5 OK | 12,6 s | 0,25 MB c/u | 295 MiB | 100 % |

**Lectura:** las exportaciones ocupan toda la CPU mientras corren (los encuestadores esperan más en ese
lapso) y 6 CSV grandes usan la mitad de la memoria. Combinadas con varias fotos grandes, superan 1 GB.

### 4. Escritura sin archivos (23/11/2026, `resultados/escritura-2026-11-23/`)

Solo envíos sin archivo y con zona, a ritmo fijo (`k6-escritura.js`), antes y después de las mejoras de
índices y del contador de metas por zona:

| Envíos/s | Antes | Después |
|---|---|---|
| 10 | p95 565 ms, 0 % errores | p95 51 ms, 0 % errores |
| 30 | se satura (atiende ~11/s) | p95 73 ms, 0 % errores |
| Techo | ~12/s | ~33/s (la API llega al 99 % de CPU) |

### 5. Mixta: 400 encuestadores + fotos + exportaciones a la vez (26/11/2026, `k6-mixta.js`; entorno en `resultados/entorno-2026-11-26.txt`)

Con los cambios de este día: la foto se sube antes de bloquear el formulario, la PWA reduce las fotos y el
límite de envíos es por persona. Almacenamiento simulado con **3 s por subida**. En la misma corrida de 7,5 min:
400 encuestadores con ritmo de campo, fotos de 0,5 MB a 30 por minuto durante 5 min y **6 exportaciones CSV**
de ~35.000 respuestas que arrancan juntas al minuto 3.

| Escenario | Peticiones | Errores | Mediana | p95 | Máx. |
|---|---|---|---|---|---|
| Encuestadores | 7.326 | **0 %** | 29 ms | 9,1 s | 11,5 s |
| Fotos de 0,5 MB (3 s por subida) | 150 | **0 %** | 3,1 s | 13,9 s | 14,7 s |
| Exportaciones CSV (20 MB c/u) | 6 | **0 %** | 53 s | 55,7 s | 56,3 s |

API: CPU mediana 30 %, **100 % durante ~55 s** (lo que duran las 6 exportaciones); **memoria máxima 518 MiB**
de 1 GB; ningún worker murió. Ningún 429.

**Lectura:**
- **Memoria resuelta para las fotos:** con fotos de 0,5 MB el pico (518 MiB) es prácticamente el de las 6
  exportaciones solas (530 MiB). Antes, 8 fotos de 30 MB a la vez ya llegaban a 1 GB.
- **Las fotos ya no hacen fila por el bloqueo:** con 3 s por subida pasaron las 30 por minuto (150 de 150).
  Antes, con la subida dentro del bloqueo, el mismo formulario no pasaba de ~14 por minuto.
- **Lo que queda: las exportaciones grandes.** Mientras corren las 6 CSV, la CPU está al 100 % y el p95 de los
  encuestadores sube a ~9 s (fuera de ese minuto, la mediana es 29 ms). No hay errores, pero se nota.

### 6. IP compartida: los 400 detrás de una sola IP (26/11/2026, `k6-campo.js` con `IP_COMPARTIDA`)

Igual que la prueba de campo, pero **todos llegan con la misma IP** (203.0.113.10), como una brigada o un
campus en la misma red. Fueron ~2.300 envíos (el 30 % de 7.695 peticiones), unos 300 por minuto desde esa IP.

| Peticiones | Errores | 429 | p95 | Máx. | CPU de la API (mediana / máx.) | Memoria máx. |
|---|---|---|---|---|---|---|
| 7.695 | **0 %** | **0** | 38 ms | 177 ms | 27 % / 51 % | 123 MiB |

**Lectura:** con el límite anterior (60 envíos por minuto **por IP**), la mayor parte de esos ~300 por minuto
habría recibido 429. Con el límite **por persona** (60/min, y 30/min por formulario) no hubo ninguno.

## Conclusiones para TI

1. **«400 usuarios» significa:** 400 usuarios virtuales a la vez durante 5 min sostenidos, con pausas de
   10 a 30 s entre acciones (ritmo de campo): **0 % de errores, p95 de 115 ms, ~16 peticiones/s**.
   Sin pausas también hay 0 % de errores, pero el p95 sube a 13 s porque la CPU llega al 100 %.
2. **Paralelismo:** coincidimos con TI. Con 12 workers y 1 CPU, el techo medido es **~33 peticiones/s
   livianas**. 400 encuestadores funcionan porque la mayoría está llenando la encuesta en el teléfono.
3. **Memoria:** coincidimos con TI. En uso normal la API no pasa de ~135 MiB, pero **8 a 12 fotos de 30 MB
   a la vez llegan a 1 GB**, y 6 exportaciones CSV grandes usan 530 MiB.
4. **Mixta e IP compartida (26/11):** los 400 usuarios con fotos y 6 exportaciones a la vez dan 0 % de errores y
   518 MiB de memoria máxima; los 400 detrás de una sola IP, 0 % de errores y ningún 429.
5. **Lo que no se probó:** producción (a propósito), la latencia real de SharePoint (se imitó con 3 s), la red
   y Traefik.

## Recomendaciones

| # | Qué | Por qué |
|---|---|---|
| 1 | ✅ **Hecho (26/11).** El archivo se sube antes de tomar el bloqueo del formulario y se borra si el envío falla (`StoreFormResponse`). | Antes la latencia de SharePoint hacía fila para todo el formulario (~14 envíos/min con 4 s de subida). |
| 2 | ✅ **Hecho (26/11).** La PWA reduce las fotos a 1600 px y JPEG al 80 % (~0,5 MB; `utils/reducir-foto.ts`). | Una foto de teléfono pasa de 30 MB a menos de 1 MB: menos memoria, menos datos móviles y envíos más rápidos. |
| 3 | **Subir el contenedor de la API a 2 GB**, o bajar `pm.max_children` si se mantiene en 1 GB. | 12 workers × ~100 MB por foto grande no caben en 1 GB con margen. |
| 4 | Si hace falta más de ~33 peticiones/s, **dar 2 CPU a la API** antes que más workers. | El límite medido es la CPU, no la cantidad de workers. |
| 5 | ✅ **Hecho (26/11).** Ante un 429 o 503, la PWA pausa el envío, avisa «Servidor ocupado, se reintentará» y reintenta sola según `Retry-After`. | Seguir insistiendo solo alargaba la fila del servidor. |
| 6 | ✅ **Hecho (26/11).** El límite de envíos es por persona, no por IP. | Las brigadas comparten la IP de la red; el límite por IP las frenaba a todas juntas. |
| 7 | Evitar que las exportaciones grandes frenen a los encuestadores: generarlas en segundo plano (cola) o limitar cuántas corren a la vez. | En la prueba mixta, 6 CSV grandes llevan la CPU al 100 % durante ~55 s y el p95 de los encuestadores sube a ~9 s. |
