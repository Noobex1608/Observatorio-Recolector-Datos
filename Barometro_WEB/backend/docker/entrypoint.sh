#!/bin/sh
set -e

echo "=========================================="
echo "  Observatorio ULEAM - Backend Laravel"
echo "=========================================="

# Crear directorios de logs si no existen
mkdir -p /var/log/supervisor
mkdir -p /var/log/nginx

# Crear directorios de storage si no existen
mkdir -p /var/www/html/storage/framework/cache/data
mkdir -p /var/www/html/storage/framework/sessions
mkdir -p /var/www/html/storage/framework/views
mkdir -p /var/www/html/storage/logs
mkdir -p /var/www/html/storage/app/public/avatars
mkdir -p /var/www/html/storage/api-docs
mkdir -p /var/www/html/bootstrap/cache

# Establecer permisos ANTES de cualquier comando artisan
echo "Estableciendo permisos..."
chown -R www:www /var/www/html/storage
chown -R www:www /var/www/html/bootstrap/cache
chmod -R 777 /var/www/html/storage
chmod -R 777 /var/www/html/bootstrap/cache

# Esperar a que la base de datos esté disponible
if [ -n "$DB_HOST" ]; then
    echo "Esperando a que la base de datos esté disponible..."
    max_tries=30
    counter=0
    until php -r "new PDO('pgsql:host=$DB_HOST;port=${DB_PORT:-5432};dbname=$DB_DATABASE', '$DB_USERNAME', '$DB_PASSWORD');" 2>/dev/null; do
        counter=$((counter + 1))
        if [ $counter -gt $max_tries ]; then
            echo "Error: No se pudo conectar a la base de datos después de $max_tries intentos"
            exit 1
        fi
        echo "Intento $counter/$max_tries - Base de datos no disponible, esperando..."
        sleep 2
    done
    echo "Base de datos conectada!"
fi

# Generar clave de aplicación si no existe
if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "base64:" ]; then
    echo "Generando APP_KEY..."
    php artisan key:generate --force
fi

# Limpiar cachés antiguos primero
echo "Limpiando cachés antiguos..."
php artisan config:clear || true
php artisan route:clear || true
php artisan view:clear || true

# Cachear configuración para producción
echo "Cacheando configuración..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Re-establecer permisos después de cachear (los archivos de caché se crean como root)
echo "Re-estableciendo permisos después de cache..."
chown -R www:www /var/www/html/storage
chown -R www:www /var/www/html/bootstrap/cache
chmod -R 777 /var/www/html/storage
chmod -R 777 /var/www/html/bootstrap/cache

# Ejecutar migraciones
echo "Ejecutando migraciones..."
php artisan migrate --force

# Ejecutar seeders solo si no hay usuarios (primera ejecución)
echo "Verificando si se necesitan seeders..."
USER_COUNT=$(php artisan tinker --execute="echo \App\Models\User::count();" 2>/dev/null | tail -1)
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
    echo "Base de datos vacía, ejecutando seeders..."
    php artisan db:seed --force
    echo "Seeders ejecutados correctamente!"
else
    echo "Base de datos ya contiene datos ($USER_COUNT usuarios), saltando seeders."
fi

# Generar documentación Swagger
echo "Generando documentación Swagger..."
php artisan swagger:generate || true

# Crear enlace de storage si no existe
if [ ! -L "/var/www/html/public/storage" ]; then
    echo "Creando enlace de storage..."
    php artisan storage:link || true
fi

# Permisos finales - asegurar que todo sea accesible
echo "Estableciendo permisos finales..."
chown -R www:www /var/www/html/storage
chown -R www:www /var/www/html/bootstrap/cache
chmod -R 777 /var/www/html/storage
chmod -R 777 /var/www/html/bootstrap/cache

echo "=========================================="
echo "  Iniciando servicios..."
echo "=========================================="

# Ejecutar el comando pasado (supervisor)
exec "$@"
