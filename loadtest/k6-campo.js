// Prueba de carga de la API (encuestadores de la PWA) con k6.
// Cada usuario virtual es un encuestador con su token y su propia IP (X-Forwarded-For, como
// llegaría detrás de Traefik), salvo con IP_COMPARTIDA.
//
// Escenarios (variable PERFIL):
//   estres  (por defecto): sube a 400 usuarios sin pausas (0,1 s entre acciones): ~400 peticiones
//           simultáneas. 1 min a 100, 1 min a 400, 3 min sostenido en 400, 30 s de bajada (5,5 min).
//   campo:  400 encuestadores con ritmo realista: una acción cada 10-30 s. 2 min de subida,
//           5 min sostenido, 30 s de bajada (7,5 min).
// Mezcla de acciones de cada usuario (lo que hace la PWA): 40 % avance (GET /api/mobile/forms/metadata),
// 15 % usuario (GET /api/user), 15 % descarga de formularios (GET /api/mobile/forms) y
// 30 % envío de una encuesta de 20 preguntas SIN archivos (POST /api/mobile/submit).
// Los envíos con fotos se miden aparte en k6-fotos.js; las exportaciones, en k6-exportaciones.js;
// todo junto, en k6-mixta.js (que reutiliza accionEncuestador de este archivo).
//
// IP_COMPARTIDA=203.0.113.10: todos los usuarios llegan con esa IP, como una brigada (o un campus)
// detrás de la misma red. Sirve para comprobar que el límite de envíos es por persona y no por IP.
//
// docker run --rm --network udf-loadtest_default -v "$PWD:/scripts" -e PERFIL=estres \
//   grafana/k6:1.3.0 run --summary-export /scripts/resultados/campo-estres.json /scripts/k6-campo.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://api:8080';
const PERFIL = __ENV.PERFIL || 'estres';
const VUS = Number(__ENV.VUS || 400);
const IP_COMPARTIDA = __ENV.IP_COMPARTIDA || '';

const datos = JSON.parse(open(__ENV.DATOS || './tokens.json'));
const usuarios = new SharedArray('usuarios', () => datos.users);
const formularios = new SharedArray('formularios', () => datos.forms);

const tMetadata = new Trend('t_metadata', true);
const tFormularios = new Trend('t_formularios', true);
const tEnvio = new Trend('t_envio', true);
const tUsuario = new Trend('t_usuario', true);

// Desglose de respuestas para explicar el porcentaje de errores (no solo contarlo).
const ok2xx = new Counter('estado_2xx');
const limite429 = new Counter('estado_429_limite');
const otros4xx = new Counter('estado_4xx_otros');
const errores5xx = new Counter('estado_5xx');
const sinRespuesta = new Counter('estado_sin_respuesta');

function contarEstado(status) {
  if (status >= 200 && status < 300) ok2xx.add(1);
  else if (status === 429) limite429.add(1);
  else if (status >= 400 && status < 500) otros4xx.add(1);
  else if (status >= 500) errores5xx.add(1);
  else sinRespuesta.add(1);
}

const etapas = {
  humo: [{ duration: '30s', target: 20 }],
  estres: [
    { duration: '1m', target: 100 },
    { duration: '1m', target: 400 },
    { duration: '3m', target: VUS },
    { duration: '30s', target: 0 },
  ],
  campo: [
    { duration: '2m', target: VUS },
    { duration: '5m', target: VUS },
    { duration: '30s', target: 0 },
  ],
};

export const options = {
  scenarios: {
    encuestadores: { executor: 'ramping-vus', startVUs: 0, stages: etapas[PERFIL], gracefulRampDown: '30s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
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

/** IP con la que llega el usuario virtual: la suya propia, o la de la red compartida. */
export function ipDe(n) {
  return IP_COMPARTIDA || `198.51.${Math.floor(n / 250)}.${n % 250}`;
}

/** Una acción de un encuestador (sin la pausa). La usan este script y k6-mixta.js. */
export function accionEncuestador() {
  const u = usuarios[(__VU - 1) % usuarios.length];
  const headers = {
    Authorization: `Bearer ${u.token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Forwarded-For': ipDe(__VU),
  };

  // Mezcla aproximada de la PWA: revisar avance, abrir la app, descargar formularios, enviar.
  const dado = Math.random();
  let r;
  if (dado < 0.4) {
    r = http.get(`${BASE}/api/mobile/forms/metadata`, { headers, tags: { name: 'metadata' } });
    tMetadata.add(r.timings.duration);
  } else if (dado < 0.55) {
    r = http.get(`${BASE}/api/user`, { headers, tags: { name: 'usuario' } });
    tUsuario.add(r.timings.duration);
  } else if (dado < 0.7) {
    r = http.get(`${BASE}/api/mobile/forms`, { headers, tags: { name: 'formularios' } });
    tFormularios.add(r.timings.duration);
  } else {
    const f = formularios[Math.floor(Math.random() * formularios.length)];
    const data = { _consentimiento_aceptado: true };
    for (const q of f.questions) data[q.id] = valores[q.type];
    r = http.post(`${BASE}/api/mobile/submit`, JSON.stringify({ client_submission_id: uuid(), form_id: f.id, data }), {
      headers,
      tags: { name: 'envio' },
    });
    tEnvio.add(r.timings.duration);
  }
  contarEstado(r.status);
  check(r, { 'respuesta 2xx': (res) => res.status >= 200 && res.status < 300 });
}

export default function () {
  accionEncuestador();
  sleep(PERFIL === 'campo' ? 10 + Math.random() * 20 : 0.1);
}
