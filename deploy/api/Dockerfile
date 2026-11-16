# Imagen udf/api para el servidor OTM (contrato: Infra-OTM/docs/publicar-una-app.md §4).
# Extiende la imagen del equipo externo (DataField_WEB/backend/Dockerfile) sin modificar su código:
#   - corre como usuario no root (www, uid 1000), nginx escucha en 8080;
#   - solo nginx + php-fpm (worker, scheduler y migraciones son servicios aparte del compose);
#   - no aplica migraciones al arrancar (hallazgo H-02); se hacen en el servicio "migraciones";
#   - Swagger no se publica (H-04) y se confía en X-Forwarded-* de Traefik (H-03) desde nginx.
# El pipeline construye primero la base:  docker build -t udf-api-base DataField_WEB/backend
ARG BASE=udf-api-base
FROM ${BASE}

USER root
# nginx, supervisord y php-fpm con rutas escribibles por www; nada en /run ni /var/lib/nginx.
COPY deploy/api/nginx.conf /etc/nginx/nginx.conf
COPY deploy/api/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY deploy/api/php-fpm.conf /usr/local/etc/php-fpm.d/zz-otm.conf
COPY deploy/api/entrypoint.sh /usr/local/bin/otm-entrypoint.sh
RUN chmod 0755 /usr/local/bin/otm-entrypoint.sh \
    && rm -f /etc/nginx/http.d/default.conf \
    && sed -i -e '/^user = /d' -e '/^group = /d' /usr/local/etc/php-fpm.d/www.conf \
    && mkdir -p /var/www/html/storage/app/public/avatars /var/www/html/storage/app/public/videos \
    && chown -R www:www /var/www/html/storage /var/www/html/bootstrap/cache

USER www
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/up >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/otm-entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
