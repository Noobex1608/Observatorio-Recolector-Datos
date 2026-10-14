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

    'supabase' => [
        'url' => env('SUPABASE_URL'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
        'schema' => env('SUPABASE_SCHEMA', 'public'),
        'surveys_table' => env('SUPABASE_SURVEYS_TABLE', 'surveys'),
        'questions_table' => env('SUPABASE_QUESTIONS_TABLE', 'questions'),
        'responses_table' => env('SUPABASE_RESPONSES_TABLE', 'responses'),
        'max_retry_attempts' => (int) env('SUPABASE_MAX_RETRY_ATTEMPTS', 12),
        'retry_base_seconds' => (int) env('SUPABASE_RETRY_BASE_SECONDS', 30),
        'video_bucket' => env('SUPABASE_VIDEO_BUCKET', 'videos'),
        'storage_file_limit' => (int) env('SUPABASE_STORAGE_FILE_LIMIT', 52428800), // 50MB
    ],

    'video_storage' => [
        'driver' => env('VIDEO_STORAGE_DRIVER', 'supabase'), // Opciones: supabase, local, s3
    ],

    'seed' => [
        'token' => env('SEED_TOKEN'),
        'admin_name' => env('ADMIN_NAME', 'Super Administrador'),
        'admin_email' => env('ADMIN_EMAIL'),
        'admin_password' => env('ADMIN_PASSWORD'),
    ],

];

