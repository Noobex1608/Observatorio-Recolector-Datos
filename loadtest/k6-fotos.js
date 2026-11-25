// Prueba de carga de envíos CON FOTO (POST /api/mobile/submit), como los manda la PWA: la foto viaja
// dentro del JSON en base64 (una foto de 30 MB son ~40 MB de JSON). La API la valida, la decodifica y la
// sube al almacenamiento (aquí, el almacenamiento simulado de compose.yml; STUB_DELAY_MS imita la red).
//
// Variables:
//   MB        tamaño de la foto: 1, 5 o 30 (archivo fotos/foto-<MB>mb.png, lo genera correr-respaldo.sh)
//   POR_MIN   envíos por minuto (llegan a ritmo fijo, no dependen de lo que tarde la API; por defecto 30)
//   DURACION  por defecto 2m
//   MAX_VUS   envíos en curso como máximo del lado de k6 (por defecto 30)
//
// docker run --rm --network udf-loadtest_default -v "$PWD:/scripts" -e MB=5 -e POR_MIN=60 \
//   grafana/k6:1.3.0 run --summary-export /scripts/resultados/fotos-5mb.json /scripts/k6-fotos.js

import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import encoding from 'k6/encoding';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://api:8080';
const MB = Number(__ENV.MB || 1);
const POR_MIN = Number(__ENV.POR_MIN || 30);
const DURACION = __ENV.DURACION || '2m';
const MAX_VUS = Number(__ENV.MAX_VUS || 30);

const datos = JSON.parse(open(__ENV.DATOS || './tokens.json'));
const usuarios = new SharedArray('usuarios', () => datos.users);
const formulario = datos.media_form;
// Se codifica una sola vez y se comparte entre los usuarios virtuales.
const foto = new SharedArray('foto', () => [`data:image/png;base64,${encoding.b64encode(open(`./fotos/foto-${MB}mb.png`, 'b'))}`]);

const tEnvio = new Trend('t_envio_foto', true);
const ok2xx = new Counter('estado_2xx');
const limite429 = new Counter('estado_429_limite');
const otros4xx = new Counter('estado_4xx_otros');
const errores5xx = new Counter('estado_5xx');
const sinRespuesta = new Counter('estado_sin_respuesta');

export const options = {
  scenarios: {
    envios_con_foto: {
      executor: 'constant-arrival-rate',
      rate: POR_MIN,
      timeUnit: '1m',
      duration: DURACION,
      preAllocatedVUs: Math.min(MAX_VUS, 10),
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    t_envio_foto: ['p(95)<10000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function () {
  const i = Math.floor(Math.random() * usuarios.length);
  const data = { _consentimiento_aceptado: true };
  for (const q of formulario.questions) {
    data[q.id] = q.type === 'MULTIMEDIA' ? { dataUrl: foto[0], mediaType: 'IMAGE' } : 'Dato de prueba k6';
  }
  const r = http.post(`${BASE}/api/mobile/submit`, JSON.stringify({ client_submission_id: uuid(), form_id: formulario.id, data }), {
    headers: {
      Authorization: `Bearer ${usuarios[i].token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Forwarded-For': `198.51.${Math.floor(i / 250)}.${i % 250}`,
    },
    timeout: '120s',
    tags: { name: 'envio_con_foto' },
  });
  tEnvio.add(r.timings.duration);
  if (r.status >= 200 && r.status < 300) ok2xx.add(1);
  else if (r.status === 429) limite429.add(1);
  else if (r.status >= 400 && r.status < 500) otros4xx.add(1);
  else if (r.status >= 500) errores5xx.add(1);
  else sinRespuesta.add(1);
  if (!check(r, { 'envío 2xx': (res) => res.status >= 200 && res.status < 300 }) && Math.random() < 0.05) {
    console.warn(`HTTP ${r.status}: ${String(r.body).slice(0, 200)}`);
  }
}
