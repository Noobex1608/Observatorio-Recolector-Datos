# Imagen udf/web (Angular, Bun) para el servidor OTM. Contexto de construcción: raíz del repo.
# No modifica el código del equipo externo: la URL de la API se fija a "/api" (mismo host,
# Traefik enruta /api a udf/api) solo dentro de esta construcción (hallazgo H-03 del frontend).
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY DataField_WEB/frontend/package.json DataField_WEB/frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY DataField_WEB/frontend/ ./
RUN printf "export const environment = {\n  production: true,\n  apiUrl: '/api',\n};\n" > src/environments/environment.prod.ts \
    && bun run build \
    && test -f dist/frontend/browser/index.html \
    && rm -f dist/frontend/browser/_headers dist/frontend/browser/_redirects

FROM nginxinc/nginx-unprivileged:1.28.2-alpine
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
