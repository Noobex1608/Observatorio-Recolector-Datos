#!/bin/sh
# Arranque de udf/api (api, worker, scheduler y migraciones usan la misma imagen).
# Sin root, sin migraciones automáticas, sin chown: la imagen ya deja storage y bootstrap/cache a www.
set -e

if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "base64:" ]; then
    echo "Error: falta APP_KEY." >&2
    exit 1
fi

mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views \
    storage/logs storage/app/public/avatars storage/app/public/videos bootstrap/cache

# La configuración depende de las variables del entorno: se cachea al arrancar.
php artisan config:cache --no-interaction >/dev/null

exec "$@"
