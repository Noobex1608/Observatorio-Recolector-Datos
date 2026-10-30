#!/bin/sh
# Compatibilidad: las migraciones ahora corren dentro de entrypoint.sh en cada arranque.
exec /usr/local/bin/entrypoint.sh supervisord -c /etc/supervisor/conf.d/supervisord.conf
