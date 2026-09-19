<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @param  string  ...$roles  Roles permitidos (ADMIN, USER)
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        // Debug temporal
        \Log::info('CheckRole middleware', [
            'user_id' => $user?->id,
            'user_rol' => $user?->rol,
            'required_roles' => $roles,
            'path' => $request->path(),
        ]);

        if (!$user) {
            return response()->json([
                'message' => 'No autenticado.',
            ], 401);
        }

        // Si no se especifican roles, solo verificar que esté autenticado
        if (empty($roles)) {
            return $next($request);
        }

        // Verificar si el usuario tiene alguno de los roles permitidos
        if (!in_array($user->rol, $roles)) {
            return response()->json([
                'message' => 'No tienes permisos para acceder a este recurso.',
                'required_roles' => $roles,
                'user_role' => $user->rol,
            ], 403);
        }

        return $next($request);
    }
}
