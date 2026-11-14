@php
    // Rutas relativas: los recursos siempre se piden al mismo origen que sirve la página.
    $asset = fn (string $file) => preg_replace('#^https?://[^/]+#', '', l5_swagger_asset('default', $file));
    $version = substr(md5((string) filemtime(storage_path('api-docs/api-docs.json'))), 0, 8);
@endphp
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Docs - Observatorio ULEAM</title>
    <link rel="stylesheet" type="text/css" href="{{ $asset('swagger-ui.css') }}">
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *,
        *:before,
        *:after {
            box-sizing: inherit;
        }
        body {
            margin: 0;
            background: #fafafa;
        }
        .swagger-ui .topbar {
            background-color: #1976d2;
        }
        .swagger-ui .topbar .download-url-wrapper .select-label select {
            border-color: #1976d2;
        }
    </style>
</head>
<body>
    <div id="swagger-ui" data-url="/api/documentation?v={{ $version }}"></div>

    <script src="{{ $asset('swagger-ui-bundle.js') }}"></script>
    <script src="{{ $asset('swagger-ui-standalone-preset.js') }}"></script>
    <script src="/swagger-init.js"></script>
</body>
</html>
