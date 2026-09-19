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
        $middleware->alias([
            'role' => \App\Http\Middleware\CheckRole::class,
        ]);

        // Agregar middleware ForceJsonResponse a TODAS las rutas API
        // Esto asegura que Laravel SIEMPRE responda JSON en rutas /api/*
        $middleware->prependToGroup('api', \App\Http\Middleware\ForceJsonResponse::class);

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

        // No exponer consultas SQL, host, tablas ni columnas en respuestas API.
        $exceptions->render(function (QueryException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'No se pudo completar la operacion. Intenta nuevamente o contacta al administrador.',
                ], 500);
            }
        });
    })->create();
