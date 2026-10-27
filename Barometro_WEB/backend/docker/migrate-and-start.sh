#!/bin/sh
set -e

cd /var/www/html
php artisan migrate --force
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
