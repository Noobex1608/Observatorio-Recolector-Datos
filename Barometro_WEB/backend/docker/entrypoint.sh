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
chmod -R 775 /var/www/html/storage
chmod -R 775 /var/www/html/bootstrap/cache

# Adaptar puerto de Nginx si Render o el entorno define $PORT
if [ -n "$PORT" ] && [ "$PORT" != "8000" ]; then
    echo "Configurando Nginx para escuchar en el puerto asignado por Render: $PORT..."
    sed -i "s/listen 8000;/listen $PORT;/g" /etc/nginx/http.d/default.conf || true
    sed -i "s/listen \[::\]:8000;/listen [::]:$PORT;/g" /etc/nginx/http.d/default.conf || true
fi

# Esperar a que la base de datos esté disponible
if [ -n "$DB_HOST" ]; then
    echo "Verificando conexión con la base de datos en $DB_HOST..."
    max_tries=10
    counter=0
    SSL_PARAM=""
    if [ "$DB_SSLMODE" = "require" ] || echo "$DB_HOST" | grep -q "supabase"; then
        SSL_PARAM=";sslmode=require"
    fi

    until php -r "try { new PDO('pgsql:host=$DB_HOST;port=${DB_PORT:-5432};dbname=$DB_DATABASE$SSL_PARAM', '$DB_USERNAME', '$DB_PASSWORD', [PDO::ATTR_TIMEOUT => 3]); exit(0); } catch (Exception \$e) { fwrite(STDERR, 'Aviso de conexión: ' . \$e->getMessage() . PHP_EOL); exit(1); }"; do
        counter=$((counter + 1))
        if [ $counter -gt $max_tries ]; then
            echo "Error: la base de datos no está disponible tras $max_tries intentos."
            exit 1
        fi
        echo "Intento $counter/$max_tries - Esperando base de datos (2s)..."
        sleep 2
    done
    echo "Verificación de base de datos concluida."
fi

# La clave debe ser estable entre recreaciones y despliegues.
if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "base64:" ]; then
    echo "Error: configure APP_KEY antes de iniciar."
    exit 1
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
chmod -R 775 /var/www/html/storage
chmod -R 775 /var/www/html/bootstrap/cache

# Migraciones y usuario inicial se ejecutan como tarea explícita de liberación.

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
chmod -R 775 /var/www/html/storage
chmod -R 775 /var/www/html/bootstrap/cache

echo "=========================================="
echo "  Iniciando servicios..."
echo "=========================================="

# Ejecutar el comando pasado (supervisor)
exec "$@"
