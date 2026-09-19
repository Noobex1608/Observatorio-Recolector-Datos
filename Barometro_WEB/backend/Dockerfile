# ========================================
# Stage 1: Composer dependencies
# ========================================
FROM composer:2 AS composer

WORKDIR /app

# Copiar archivos de composer
COPY composer.json composer.lock ./

# Instalar dependencias sin scripts de autoload
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --prefer-dist \
    --ignore-platform-reqs

# Copiar el resto del código
COPY . .

# Generar autoload optimizado
RUN composer dump-autoload --optimize --no-dev

# ========================================
# Stage 2: Production image
# ========================================
FROM php:8.4-fpm-alpine

# Instalar dependencias del sistema
RUN apk add --no-cache \
    # Para PostgreSQL
    postgresql-dev \
    # Para GD (imágenes)
    freetype-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    libwebp-dev \
    # Para ZIP (Excel)
    libzip-dev \
    zip \
    unzip \
    # Para XML
    libxml2-dev \
    # Para intl
    icu-dev \
    # Nginx
    nginx \
    # Supervisor para manejar procesos
    supervisor \
    # Herramientas útiles
    curl \
    git

# Instalar extensiones PHP
RUN docker-php-ext-configure gd \
        --with-freetype \
        --with-jpeg \
        --with-webp \
    && docker-php-ext-install -j$(nproc) \
        pdo \
        pdo_pgsql \
        pgsql \
        gd \
        zip \
        bcmath \
        intl \
        opcache \
        pcntl

# Configurar OPcache para producción
RUN echo "opcache.enable=1" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.memory_consumption=128" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.interned_strings_buffer=8" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.max_accelerated_files=4000" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.revalidate_freq=60" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.fast_shutdown=1" >> /usr/local/etc/php/conf.d/opcache.ini

# Configurar PHP para producción
RUN echo "upload_max_filesize=50M" >> /usr/local/etc/php/conf.d/uploads.ini \
    && echo "post_max_size=50M" >> /usr/local/etc/php/conf.d/uploads.ini \
    && echo "memory_limit=256M" >> /usr/local/etc/php/conf.d/uploads.ini \
    && echo "max_execution_time=300" >> /usr/local/etc/php/conf.d/uploads.ini

# Crear usuario no-root
RUN addgroup -g 1000 www && adduser -u 1000 -G www -s /bin/sh -D www

# Directorio de trabajo
WORKDIR /var/www/html

# Copiar código desde stage de composer
COPY --from=composer /app/vendor ./vendor
COPY . .

# Copiar configuración de nginx
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# Copiar configuración de supervisor
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Crear directorios necesarios y establecer permisos
RUN mkdir -p storage/framework/cache/data \
    && mkdir -p storage/framework/sessions \
    && mkdir -p storage/framework/views \
    && mkdir -p storage/logs \
    && mkdir -p storage/app/public/avatars \
    && mkdir -p storage/api-docs \
    && mkdir -p bootstrap/cache \
    && chown -R www:www /var/www/html \
    && chmod -R 775 storage bootstrap/cache

# Crear enlace simbólico de storage
RUN ln -s /var/www/html/storage/app/public /var/www/html/public/storage

# Script de entrada
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Exponer puerto
EXPOSE 8000

# Comando de entrada
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
