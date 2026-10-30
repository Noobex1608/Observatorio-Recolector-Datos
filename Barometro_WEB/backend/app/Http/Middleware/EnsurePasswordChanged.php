<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordChanged
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->must_change_password && ! $request->is('api/user', 'api/logout', 'api/change-password')) {
            return response()->json(['message' => 'Debes cambiar tu contraseña temporal antes de continuar.'], 403);
        }
        return $next($request);
    }
}
