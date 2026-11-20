<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Idioma de la respuesta según la cabecera `X-App-Language`, que solo envía el panel web con el idioma
 * elegido en la interfaz. No se usa `Accept-Language` porque el navegador la envía siempre con el idioma
 * del dispositivo: la app de recolección (solo en español) recibiría mensajes en inglés en un teléfono
 * configurado en inglés. Sin cabecera o con otro idioma, responde en español, el idioma del producto.
 */
class SetRequestLocale
{
    public const SUPPORTED = ['es', 'en'];

    public const HEADER = 'X-App-Language';

    public const DEFAULT = 'es';

    public function handle(Request $request, Closure $next): Response
    {
        App::setLocale($this->resolve($request->header(self::HEADER)));

        return $next($request);
    }

    private function resolve(?string $header): string
    {
        if (! $header) {
            return self::DEFAULT;
        }
        // "en", "en-US", "en-US,en;q=0.9": basta el primer idioma admitido, en el orden enviado.
        foreach (explode(',', $header) as $part) {
            $code = strtolower(substr(trim(explode(';', $part)[0]), 0, 2));
            if (in_array($code, self::SUPPORTED, true)) {
                return $code;
            }
        }

        return self::DEFAULT;
    }
}
