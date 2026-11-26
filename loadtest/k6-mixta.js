// Prueba MIXTA: lo que TI pidió ver junto en la misma corrida. A la vez:
//   1. encuestadores: los 400 de k6-campo.js con ritmo de campo (una acción cada 10-30 s).
//      2 min de subida, 5 min sostenido, 30 s de bajada (7,5 min).
//   2. fotos: envíos con foto (k6-fotos.js) a ritmo fijo durante los 5 min sostenidos.
//      MB elige el archivo fotos/foto-<MB>mb.png. El respaldo usa MB=0.5: el tamaño con que la PWA las
//      manda ahora que las reduce (lado mayor de 1600 px, JPEG al 80 %). MB=30 repite el peor caso anterior.
//   3. exportaciones: N exportaciones (k6-exportaciones.js) que arrancan juntas al minuto 3, con los
//      400 encuestadores y las fotos en curso. FORMATO csv (por defecto) o xlsx.
//
// Variables: VUS (400), MB (1; el respaldo pasa 0.5), POR_MIN (fotos por minuto, 30), N (exportaciones, 6), FORMATO (csv),
//            IP_COMPARTIDA (opcional: todos con la misma IP).
//
// docker run --rm --network udf-loadtest_default -v "$PWD:/scripts" -e DATOS=/scripts/tokens.json \
//   grafana/k6:1.3.0 run --summary-export /scripts/resultados/mixta.json /scripts/k6-mixta.js

import { sleep } from 'k6';
import { accionEncuestador } from './k6-campo.js';
import { envioConFoto } from './k6-fotos.js';
import { exportacion } from './k6-exportaciones.js';

const VUS = Number(__ENV.VUS || 400);
const POR_MIN = Number(__ENV.POR_MIN || 30);
const N = Number(__ENV.N || 6);

export const options = {
  scenarios: {
    encuestadores: {
      executor: 'ramping-vus',
      exec: 'encuestadores',
      startVUs: 0,
      stages: [
        { duration: '2m', target: VUS },
        { duration: '5m', target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    fotos: {
      executor: 'constant-arrival-rate',
      exec: 'fotos',
      startTime: '2m',
      duration: '5m',
      rate: POR_MIN,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 40,
    },
    exportaciones: {
      executor: 'per-vu-iterations',
      exec: 'exportaciones',
      startTime: '3m',
      vus: N,
      iterations: 1,
      maxDuration: '6m',
    },
  },
  thresholds: {
    // Por escenario: así se ve si alguno empeora a los demás.
    'http_req_failed{scenario:encuestadores}': ['rate<0.01'],
    'http_req_duration{scenario:encuestadores}': ['p(95)<2000'],
    'http_req_failed{scenario:fotos}': ['rate<0.01'],
    'http_req_failed{scenario:exportaciones}': ['rate<0.01'],
    estado_429_limite: ['count==0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function encuestadores() {
  accionEncuestador();
  sleep(10 + Math.random() * 20);
}

export function fotos() {
  envioConFoto();
}

export function exportaciones() {
  exportacion();
}
