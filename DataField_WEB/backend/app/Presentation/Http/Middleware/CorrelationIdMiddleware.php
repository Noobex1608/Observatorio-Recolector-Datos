<?php

declare(strict_types=1);

namespace App\Presentation\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class CorrelationIdMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $incomingId = $request->header('X-Correlation-ID');
        $correlationId = is_string($incomingId)
            && preg_match('/\\A[A-Za-z0-9._:-]{1,128}\\z/D', $incomingId) === 1
                ? $incomingId
                : (string) Str::uuid();

        $request->headers->set('X-Correlation-ID', $correlationId);

        // Append to Log context for structured tracing
        Log::withContext([
            'correlation_id' => $correlationId,
        ]);

        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Correlation-ID', $correlationId);

        return $response;
    }
}
