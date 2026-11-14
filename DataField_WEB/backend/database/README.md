# Manual de Publicación y Gestión de Base de Datos

Este directorio contiene las migraciones y seeders para la plataforma de recolección de datos (**Barómetro ULEAM**).

---

## 1. Ejecución de Migraciones

Para entornos de desarrollo y pruebas:
```bash
php artisan migrate
```

Para entornos de producción (dentro de contenedor Docker o CLI del servidor):
```bash
php artisan migrate --force
```

---

## 2. Generación de Diffs SQL para Administradores de BD (DBAs)

Por políticas institucionales, los cambios a la estructura de base de datos en ambientes productivos deben ser auditados mediante scripts SQL puros antes de su aplicación.

Para generar un diff SQL en texto plano sin alterar la base de datos:
```bash
php artisan migrate --pretend --no-interaction > database/scripts/migration_diff_$(date +%Y%m%d).sql
```

---

## 3. Inicialización de Datos (Seeders)

Para siembra inicial de roles y administrador inicial:
```bash
php artisan db:seed --class=AdminUserSeeder
```

> **Nota:** Por razones de seguridad (SEC-02), la ejecución de seeders mediante peticiones HTTP `/api/seed` ha sido deshabilitada. Todos los seeders deben ser ejecutados exclusivamente por línea de comandos CLI autenticada.
