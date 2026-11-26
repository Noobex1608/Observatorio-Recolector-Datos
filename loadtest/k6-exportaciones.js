// Prueba de EXPORTACIONES simultáneas (GET /api/forms/{id}/export), el caso que más memoria usa.
// Cada usuario virtual pide UNA exportación y todas arrancan a la vez. Las pide el líder del proyecto.
//
// Variables:
//   FORMATO   csv (los 3 formularios grandes, por defecto) o xlsx (el formulario de 1.000 respuestas,
//             que es el máximo que el código permite en XLSX)
//   N         exportaciones simultáneas (por defecto 6). El límite de la API es 10 por minuto por persona
//             y 5 por minuto por persona y formulario: con N mayor, las sobrantes reciben 429.
//
// exportacion() también la usa k6-mixta.js.
//
// Mientras corre conviene medir la memoria del contenedor de la API (lo hace correr-respaldo.sh).
//
// docker run --rm --network udf-loadtest_default -v "$PWD:/scripts" -e FORMATO=csv -e N=6 \
//   grafana/k6:1.3.0 run --summary-export /scripts/resultados/export-csv.json /scripts/k6-exportaciones.js

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://api:8080';
const FORMATO = __ENV.FORMATO || 'csv';
const N = Number(__ENV.N || 6);

const datos = JSON.parse(open(__ENV.DATOS || './tokens.json'));
const formularios = FORMATO === 'xlsx' ? [datos.xlsx_form] : datos.forms.map((f) => f.id);

const tExport = new Trend('t_exportacion', true);
const tamano = new Trend('tamano_exportacion_bytes');
const ok2xx = new Counter('estado_2xx');
const limite429 = new Counter('estado_429_limite');
const otros4xx = new Counter('estado_4xx_otros');
const errores5xx = new Counter('estado_5xx');
const sinRespuesta = new Counter('estado_sin_respuesta');

export const options = {
  scenarios: {
    exportaciones: { executor: 'per-vu-iterations', vus: N, iterations: 1, maxDuration: '10m' },
  },
  thresholds: { http_req_failed: ['rate<0.01'] },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
};

export function exportacion() {
  const formId = formularios[(__VU - 1) % formularios.length];
  const r = http.get(`${BASE}/api/forms/${formId}/export?format=${FORMATO}`, {
    headers: { Authorization: `Bearer ${datos.leader}`, Accept: '*/*' },
    timeout: '300s',
    responseType: 'binary',
    tags: { name: `exportacion_${FORMATO}` },
  });
  tExport.add(r.timings.duration);
  if (r.body) tamano.add(r.body.byteLength);
  if (r.status >= 200 && r.status < 300) ok2xx.add(1);
  else if (r.status === 429) limite429.add(1);
  else if (r.status >= 400 && r.status < 500) otros4xx.add(1);
  else if (r.status >= 500) errores5xx.add(1);
  else sinRespuesta.add(1);
  check(r, { 'exportación 2xx': (res) => res.status >= 200 && res.status < 300 });
}

export default function () {
  exportacion();
}
