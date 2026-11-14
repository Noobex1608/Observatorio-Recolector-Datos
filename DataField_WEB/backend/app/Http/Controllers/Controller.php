<?php

namespace App\Http\Controllers;

use OpenApi\Attributes as OA;

#[OA\Info(
    version: '1.0.0',
    title: 'Observatorio ULEAM Forms API',
    description: 'API para crear formularios dinamicos, publicar enlaces de recoleccion, gestionar usuarios y consultar respuestas.',
    contact: new OA\Contact(
        name: 'ULEAM',
        email: 'soporte@uleam.edu.ec'
    )
)]
#[OA\Server(
    url: '/api',
    description: 'Servidor actual'
)]
#[OA\SecurityScheme(
    securityScheme: 'sanctum',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'Sanctum token',
    description: 'Usa el token devuelto por POST /login. En Swagger pulsa Authorize y pega solo el token, sin escribir Bearer.'
)]
abstract class Controller
{
    //
}
