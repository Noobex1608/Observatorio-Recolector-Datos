# Imagen udf/pwa (Angular, npm) para el servidor OTM, publicada bajo /m/. Contexto: raíz del repo.
# No modifica el código del equipo externo: dentro de esta construcción el servidor por defecto del
# login pasa de Render al mismo origen (Traefik enruta /api a udf/api).
FROM node:24-alpine AS build
WORKDIR /app
COPY DataField_MOVIL/kobo-mobile/package.json DataField_MOVIL/kobo-mobile/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY DataField_MOVIL/kobo-mobile/ ./
RUN grep -q "'https://barometro-backend.onrender.com'" src/app/login/login.component.ts \
    && sed -i "s#'https://barometro-backend.onrender.com'#window.location.origin#" src/app/login/login.component.ts \
    && npx ng build --base-href /m/ \
    && test -f dist/kobo-mobile/browser/index.html \
    && rm -f dist/kobo-mobile/browser/_headers dist/kobo-mobile/browser/_redirects

FROM nginxinc/nginx-unprivileged:1.28.2-alpine
COPY deploy/pwa/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/kobo-mobile/browser/ /usr/share/nginx/html/m/
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
