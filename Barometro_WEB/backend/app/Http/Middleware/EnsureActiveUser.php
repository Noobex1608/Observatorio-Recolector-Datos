<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class EnsureActiveUser
{
    public function handle(Request $request, Closure $next)
    {
        // Also resolve bearer tokens on public collection. Invalid tokens must not
        // silently become anonymous submissions and bypass collector quotas.
        $user = $request->user() ?? ($request->bearerToken() ? Auth::guard('sanctum')->user() : null);
        abort_if($request->bearerToken() && ! $user, 401, 'La sesión expiró. Inicie sesión nuevamente.');
        if ($user) {
            abort_unless($user->isActive(), 403, 'La cuenta está desactivada.');
            $request->setUserResolver(fn () => $user);
        }

        return $next($request);
    }
}
