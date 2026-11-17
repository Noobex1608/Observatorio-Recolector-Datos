<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    | Inicio de sesión con Microsoft 365 / Entra ID (OpenID Connect) y envío de correo por Microsoft Graph.
    | Los datos los entrega TI al registrar la aplicación en Entra ID. El secret solo vive en el .env del backend.
    */
    'microsoft' => [
        'client_id' => env('MICROSOFT_CLIENT_ID'),
        'client_secret' => env('MICROSOFT_CLIENT_SECRET'),
        'tenant_id' => env('MICROSOFT_TENANT_ID'),
        // URL de retorno registrada en Entra ID: <backend>/api/auth/microsoft/callback
        'redirect_uri' => env('MICROSOFT_REDIRECT_URI', rtrim((string) env('APP_URL', 'http://localhost:8000'), '/').'/api/auth/microsoft/callback'),
        // Buzón (compartido) desde el que la aplicación envía correos con Microsoft Graph.
        'mail_sender' => env('MICROSOFT_MAIL_SENDER'),
    ],

    /*
    | Biblioteca de SharePoint donde se guardan fotos, audios, videos y firmas de las respuestas
    | (RESPONSE_MEDIA_DRIVER=sharepoint). Nombres de variable acordados con DIIT: su pipeline los
    | reemplaza por los IDs de producción al publicar. El acceso usa la app de Microsoft 365 (arriba).
    */
    'sharepoint' => [
        'site_id' => env('SharePoint__SiteId'),
        'library_id' => env('SharePoint__LibraryId'),
    ],

    // Correos institucionales: entran con Microsoft y no reciben correo de confirmación.
    'internal_email_domains' => array_values(array_filter(array_map(
        fn ($domain) => strtolower(trim($domain)),
        explode(',', (string) env('AUTH_INTERNAL_EMAIL_DOMAINS', 'uleam.edu.ec,live.uleam.edu.ec,dn.uleam.edu.ec'))
    ))),

    // Página del frontend web donde el usuario externo crea su contraseña (enlace del correo de invitación).
    'frontend_url' => rtrim((string) env('FRONTEND_URL', 'http://localhost:4200'), '/'),

    'supabase' => [
        'form_schema_sync_enabled' => (bool) env('SUPABASE_FORM_SCHEMA_SYNC_ENABLED', false),
        'response_sync_enabled' => (bool) env('SUPABASE_RESPONSE_SYNC_ENABLED', false),
        'url' => env('SUPABASE_URL'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
        'schema' => env('SUPABASE_SCHEMA', 'public'),
        'surveys_table' => env('SUPABASE_SURVEYS_TABLE', 'surveys'),
        'questions_table' => env('SUPABASE_QUESTIONS_TABLE', 'questions'),
        'responses_table' => env('SUPABASE_RESPONSES_TABLE', 'responses'),
        'max_retry_attempts' => (int) env('SUPABASE_MAX_RETRY_ATTEMPTS', 12),
        'retry_base_seconds' => (int) env('SUPABASE_RETRY_BASE_SECONDS', 30),
        'video_bucket' => env('SUPABASE_VIDEO_BUCKET', 'videos'),
        'response_media_bucket' => env('SUPABASE_RESPONSE_MEDIA_BUCKET', 'response-media'),
        'storage_file_limit' => (int) env('SUPABASE_STORAGE_FILE_LIMIT', 52428800), // 50MB
    ],

    'video_storage' => [
        'driver' => env('VIDEO_STORAGE_DRIVER', 'supabase'), // Opciones: supabase, local, s3
    ],

    'response_media' => [
        'driver' => env('RESPONSE_MEDIA_DRIVER', 'supabase'),
        'max_files' => (int) env('RESPONSE_MEDIA_MAX_FILES', 10),
        'max_file_bytes' => (int) env('RESPONSE_MEDIA_MAX_FILE_BYTES', 31457280),
        'max_total_bytes' => (int) env('RESPONSE_MEDIA_MAX_TOTAL_BYTES', 36700160),
    ],

    'seed' => [
        'token' => env('SEED_TOKEN'),
        'admin_name' => env('ADMIN_NAME', 'Super Administrador'),
        'admin_email' => env('ADMIN_EMAIL'),
        'admin_password' => env('ADMIN_PASSWORD'),
    ],

];
