<?php

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        'http://localhost:4200',
        'http://127.0.0.1:4200',
        'http://localhost:4201',
        'http://127.0.0.1:4201',
        'https://barometro.netlify.app',
        'https://barometromovil.netlify.app',
    ],

    'allowed_origins_patterns' => [
        '#^https://.*--barometro\.netlify\.app$#',
        '#^https://.*--barometromovil\.netlify\.app$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];