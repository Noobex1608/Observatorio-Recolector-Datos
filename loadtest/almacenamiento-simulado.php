<?php

// Almacenamiento simulado para k6-fotos.js: responde como el Storage de Supabase (el adaptador que usa la
// API con RESPONSE_MEDIA_DRIVER=supabase) sin salir a internet. Recibe el archivo completo y lo descarta.
// STUB_DELAY_MS agrega una demora por subida para imitar la red hacia SharePoint/Supabase en producción.
// Se ejecuta con el servidor integrado de PHP:  php -S 0.0.0.0:8080 almacenamiento-simulado.php
// (PHP_CLI_SERVER_WORKERS permite atender varias subidas a la vez).

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
header('Content-Type: application/json');

// Verificación del bucket privado (assertPrivateBucket).
if ($method === 'GET' && preg_match('#^/storage/v1/bucket/([^/]+)$#', $path, $m)) {
    echo json_encode(['id' => $m[1], 'name' => $m[1], 'public' => false]);

    return true;
}

// Subida de un medio: se lee el cuerpo completo (como lo haría el servicio real) y se descarta.
if ($method === 'POST' && str_starts_with($path, '/storage/v1/object/')) {
    $in = fopen('php://input', 'rb');
    $bytes = 0;
    while (! feof($in)) {
        $bytes += strlen((string) fread($in, 1 << 20));
    }
    $delay = (int) (getenv('STUB_DELAY_MS') ?: 0);
    if ($delay > 0) {
        usleep($delay * 1000);
    }
    echo json_encode(['Key' => substr($path, strlen('/storage/v1/object/')), 'bytes' => $bytes]);

    return true;
}

// Borrado u otras operaciones: se aceptan sin hacer nada.
if (str_starts_with($path, '/storage/v1/')) {
    echo json_encode(['message' => 'ok']);

    return true;
}

http_response_code(404);
echo json_encode(['message' => 'no encontrado']);

return true;
