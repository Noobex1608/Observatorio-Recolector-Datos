<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeceras de seguridad para todas las respuestas (hallazgos de OWASP ZAP): sin versión de PHP,
 * sin sniffing de tipos, sin incrustar en iframes, política de permisos y CSP.
 */
class SecurityHeaders
{
    private const JSON_CSP = "default-src 'none'; frame-ancestors 'none'";

    private const HTML_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        ."script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if (! headers_sent()) {
            header_remove('X-Powered-By');
        }

        $headers = $response->headers;
        $headers->remove('X-Powered-By');
        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('X-Frame-Options', 'DENY');
        $headers->set('Referrer-Policy', 'no-referrer');
        $headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
        $headers->set('Cross-Origin-Opener-Policy', 'same-origin');

        $type = (string) $headers->get('Content-Type');
        $isHtml = str_contains($type, 'text/html');
        $isJson = $type === '' || str_contains($type, 'json');
        if (! $headers->has('Cross-Origin-Resource-Policy')) {
            // Las respuestas JSON se leen con CORS, al que esta cabecera no afecta. Los archivos (imágenes,
            // audio) se cargan desde la web y la app en otro dominio, así que se permiten entre orígenes.
            $headers->set('Cross-Origin-Resource-Policy', $isJson || $isHtml ? 'same-origin' : 'cross-origin');
        }
        if (! $headers->has('Content-Security-Policy')) {
            $headers->set('Content-Security-Policy', $isHtml ? self::HTML_CSP : self::JSON_CSP);
        }
        if ($isHtml) {
            $headers->set('Cross-Origin-Embedder-Policy', 'require-corp');
        }

        return $response;
    }
}
