# Contrato operativo del backend

Laravel/PostgreSQL es la fuente operativa y Laravel Sanctum es la única autoridad de identidad. Supabase Auth no participa en el inicio de sesión ni en la administración de usuarios; la columna histórica `supabase_auth_id` se conserva temporalmente para no perder datos. Las tablas replicadas a Supabase son una **proyección analítica parcial** de formularios, preguntas y respuestas; no incluyen proyectos, zonas, asignaciones, consentimiento ni fechas de campaña en el contrato remoto actual. **No** sustituyen el respaldo de PostgreSQL ni de los medios. El archivo `docker-compose.prod.yml` requiere `APP_KEY`, `DB_PASSWORD` y `CORS_ALLOWED_ORIGINS` antes de arrancar. La lista CORS debe contener los orígenes exactos de la web y la PWA (esquema, host y puerto, sin ruta); no incluir la URL del API como sustituto de los clientes.

Para el piloto: `CORS_ALLOWED_ORIGINS=https://incredible-cactus-e2cb5a.netlify.app,https://timely-druid-80b292.netlify.app` y `APP_URL=https://barometro-backend.onrender.com`. Al mover las aplicaciones al servidor universitario, cambie estos valores por los nuevos orígenes, revise la CSP y repita las pruebas de CORS.

Configure también `APP_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` para el primer arranque, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` si se usa la réplica, y el almacenamiento de video elegido. Guarde las credenciales en el gestor de secretos del entorno, fuera del repositorio. `GET /api/health` devuelve 200 solo cuando Laravel puede consultar PostgreSQL; el monitor de colas necesita vigilancia separada. Antes de publicar, confirme que el worker y el scheduler procesan una respuesta de prueba y que el proceso de recuperación puede reenviarla sin duplicarla.

## Medios de respuestas

En el piloto, fotos, audio, videos y firmas nuevos se guardan fuera de PostgreSQL en el bucket privado de Supabase indicado por `SUPABASE_RESPONSE_MEDIA_BUCKET` (por defecto `response-media`). Prepare o verifique ese bucket con `php artisan storage:ensure-response-media-bucket` antes de recibir respuestas. El comando rechaza un bucket existente que sea público; no cambia el bucket histórico `SUPABASE_VIDEO_BUCKET`. El backend conserva solo la ruta, el tipo MIME y el proveedor, y entrega una URL firmada de cinco minutos desde `GET /api/forms/{formId}/responses/{responseId}/media/{questionId}` tras comprobar permisos de revisión. Los límites configurables son `RESPONSE_MEDIA_MAX_FILES`, `RESPONSE_MEDIA_MAX_FILE_BYTES` y `RESPONSE_MEDIA_MAX_TOTAL_BYTES`.

El contrato `ResponseMediaStorage` permite sustituir Supabase por un adaptador de SharePoint cuando la universidad facilite tenant, sitio, biblioteca, identidad de servicio y política de permisos/retención. Antes de activar ese proveedor, migre los objetos existentes y sus referencias de forma verificable; cambiar solo `RESPONSE_MEDIA_DRIVER` no realiza la migración. Los videos históricos guardados en el bucket público siguen requiriendo revisión y traslado separado.

## Liberación

Si el CDN de Alpine no responde desde la red de construcción, compruebe primero DNS y HTTPS desde el host y un contenedor. El Dockerfile acepta una réplica HTTPS solo para ese build; por ejemplo, desde `Barometro_WEB/backend`:

```bash
docker build --build-arg ALPINE_MIRROR=https://mirrors.ibh.net/alpine -t observatorio-backend-audit -f Dockerfile .
```

Sin el argumento se usan los repositorios originales de la imagen base. Verifique la vigencia y conectividad de la réplica elegida antes de emplearla en otra red.

1. Respalde la base de datos y los medios persistidos. Registre versión de aplicación, hash de imagen, migraciones pendientes y número de trabajos pendientes.
2. Compruebe variables y secretos mediante `docker compose --env-file .env.production -f docker-compose.prod.yml config` en un entorno controlado. No publique su salida: puede contener secretos.
3. Arranque PostgreSQL con `docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres`. Ejecute `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend php artisan migrate --force`. Solo en una base nueva y con `ADMIN_EMAIL` y `ADMIN_PASSWORD` configurados, ejecute `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend php artisan db:seed --class=AdminUserSeeder --force`. Después arranque el backend con `docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend`. El entrypoint ya no migra ni genera claves automáticamente.
4. Verifique `/api/health`, inicio de sesión, publicación de formulario de prueba, respuesta pública y asignada, descarga privada y trabajo de cola. Confirme que archivos y base de datos sobreviven a recrear el contenedor.
5. Observe tasa de errores, pendientes de cola, antigüedad del pendiente más viejo y fallos de réplica antes de cerrar la liberación.

## Respaldo y restauración

La copia debe incluir PostgreSQL, `storage/app`, secretos necesarios para descifrar datos y el almacenamiento externo de medios. Automatice la copia fuera del servidor de aplicación y registre una política de retención. Defina RPO (pérdida máxima aceptable) y RTO (tiempo máximo de restauración) con los responsables del proyecto; no hay valores aprobados en el repositorio.

Pruebe la restauración en un entorno aislado: restaure la base, los archivos y la configuración compatible, ejecute verificaciones de integridad, compare conteos de formularios/respuestas/medios y realice un envío de prueba. Registre duración real, fecha, responsable y discrepancias. No ejecute `migrate:fresh` en una base compartida o productiva.

Las fechas de vigencia de campañas se interpretan con `America/Guayaquil`; los instantes de auditoría se conservan en UTC.
