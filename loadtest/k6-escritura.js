// Prueba de carga de ESCRITURA: solo envíos de encuestas desde la PWA (POST /api/mobile/submit).
// Sirve para comparar el costo de los índices de form_responses al guardar (A/B con y sin un índice).
//
// Cada envío bloquea la fila del formulario (lockForUpdate) y, con el bloqueo tomado, cuenta las
// respuestas del encuestador y de la zona para las metas. Por eso el tiempo de esos conteos limita
// cuántos envíos por segundo admite cada formulario. Los datos deben sembrarse con zonas:
//   php loadtest-seed.php 400 100000 4 > tokens-escritura.json
//
// Llega a un ritmo fijo (no depende de lo que tarde la API), así se ve cuándo se satura:
//   RATE  envíos por segundo (por defecto 15)      DURACION  (por defecto 90s)
//
// docker run --rm --network udf-loadtest_default -v "$PWD:/scripts" -e RATE=30 \
//   grafana/k6:1.3.0 run /scripts/k6-escritura.js

import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://api:8080';
const RATE = Number(__ENV.RATE || 15);
const DURACION = __ENV.DURACION || '90s';

const datos = JSON.parse(open(__ENV.DATOS || './tokens-escritura.json'));
const usuarios = new SharedArray('usuarios', () => datos.users);
const formularios = new SharedArray('formularios', () => datos.forms);

const tEnvio = new Trend('t_envio', true);
const rechazos = new Counter('envios_rechazados');

export const options = {
  scenarios: {
    envios: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURACION,
      preAllocatedVUs: Math.max(50, RATE * 4),
      maxVUs: Math.max(200, RATE * 20),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    t_envio: ['p(95)<2000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const valores = { NUMBER: 7, SINGLE_CHOICE: 'Opción B', MULTIPLE_CHOICE: ['Opción A', 'Opción C'], TEXT: 'Respuesta k6' };

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function () {
  // Encuestador al azar (no por VU): reparte el límite de 30 envíos/min por persona y formulario.
  const i = Math.floor(Math.random() * usuarios.length);
  const u = usuarios[i];
  const f = formularios[Math.floor(Math.random() * formularios.length)];
  const headers = {
    Authorization: `Bearer ${u.token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Forwarded-For': `198.51.${Math.floor(i / 250)}.${i % 250}`,
  };

  const data = { _consentimiento_aceptado: true };
  for (const q of f.questions) data[q.id] = valores[q.type];
  if (f.zones && f.zones.length) {
    data._project_geofence = {
      zone_id: f.zones[Math.floor(Math.random() * f.zones.length)],
      latitud: -0.95, longitud: -80.72, fuera_de_zona: false,
    };
  }

  const r = http.post(`${BASE}/api/mobile/submit`, JSON.stringify({ client_submission_id: uuid(), form_id: f.id, data }), {
    headers,
    tags: { name: 'envio' },
  });
  tEnvio.add(r.timings.duration);
  const ok = check(r, { 'envío 2xx': (res) => res.status >= 200 && res.status < 300 });
  if (!ok) {
    rechazos.add(1, { status: String(r.status) });
    if (Math.random() < 0.02) console.warn(`HTTP ${r.status}: ${String(r.body).slice(0, 200)}`);
  }
}
