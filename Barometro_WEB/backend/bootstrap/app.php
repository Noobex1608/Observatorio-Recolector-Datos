<?php

use App\Domain\Shared\Exceptions\ApiException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withSchedule(function (Schedule $schedule): void {
        $schedule->command('responses:sync-pending --limit=200')->everyMinute()->withoutOverlapping();
    })
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(\Illuminate\Http\Middleware\HandleCors::class);

        $middleware->alias([
            'role' => \App\Http\Middleware\CheckRole::class,
        ]);

        // Agregar middleware ForceJsonResponse y CorrelationIdMiddleware a TODAS las rutas API
        $middleware->prependToGroup('api', \App\Http\Middleware\ForceJsonResponse::class);
        $middleware->prependToGroup('api', \App\Presentation\Http\Middleware\CorrelationIdMiddleware::class);

        // Para API: NO redirigir a login, sino devolver JSON 401
        $middleware->redirectGuestsTo(function (Request $request) {
            // Solo redirigir si NO es una petición API
            if (!$request->is('api/*') && !$request->expectsJson()) {
                return route('login');
            }
            return null; // No redirigir, dejar que el exception handler lo maneje
        });
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Handle ApiException - structured error responses
        $exceptions->render(function (ApiException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json($e->toArray(), $e->getCode());
            }
        });

        // Manejar AuthenticationException para API - devolver JSON en lugar de redirigir
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'No autenticado.',
                ], 401);
            }
            // Para peticiones web, redirigir a login
            return redirect('/login');
        });

        // Capturar cualquier excepcion en API y responder siempre con JSON estructurado + Log
        $exceptions->render(function (\Throwable $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                \Illuminate\Support\Facades\Log::error('API Exception [' . get_class($e) . ']: ' . $e->getMessage(), [
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                ]);

                $statusCode = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;
                if ($statusCode < 400 || $statusCode > 599) {
                    $statusCode = 500;
                }

                $payload = [
                    'message' => config('app.debug') ? $e->getMessage() : 'No se pudo completar la operacion. Intenta nuevamente o contacta al administrador.',
                ];
                if (config('app.debug')) {
                    $payload['exception'] = get_class($e);
                    $payload['file'] = $e->getFile() . ':' . $e->getLine();
                }

                return response()->json($payload, $statusCode);
            }
        });

        // Garantizar que TODAS las respuestas de excepciones (401, 403, 404, 500) incluyan headers CORS
        $exceptions->respond(function ($response) {
            $response->headers->set('Access-Control-Allow-Origin', '*');
            $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            $response->headers->set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With, Origin, Correlation-Id');
            return $response;
        });
    })->create();
