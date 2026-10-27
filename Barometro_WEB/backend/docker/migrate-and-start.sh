#!/bin/sh
set -e

cd /var/www/html
php artisan migrate --force
exec /usr/local/bin/entrypoint.sh supervisord -c /etc/supervisor/conf.d/supervisord.conf
