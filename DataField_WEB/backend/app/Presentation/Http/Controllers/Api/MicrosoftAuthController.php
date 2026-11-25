<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Application\Auth\Services\InstitutionalEmail;
use App\Application\Auth\Services\MicrosoftOidc;
use App\Application\Auth\Services\SessionIssuer;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Presentation\Http\Resources\Auth\AuthResource;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Inicio de sesión con Microsoft 365 para cuentas institucionales.
 *
 * 1. El frontend (web o PWA) abre /auth/microsoft/redirect?return=<su página de retorno>.
 * 2. Microsoft devuelve al usuario a /auth/microsoft/callback; aquí se valida y se busca la cuenta.
 * 3. Se redirige a la página de retorno con un código de un solo uso (el token nunca viaja en la URL).
 * 4. El frontend canjea ese código en /auth/microsoft/exchange y recibe la sesión de siempre.
 */
class MicrosoftAuthController extends Controller
{
    private const STATE_TTL_SECONDS = 600;

    private const LOGIN_CODE_TTL_SECONDS = 120;

    /** Cuánto se recuerda el resultado de un callback para responder igual si el navegador lo repite. */
    private const CALLBACK_REPLAY_TTL_SECONDS = 30;

    /** Clave del callback en curso (state + código de Microsoft); null si no se debe recordar. */
    private ?string $replayKey = null;

    public function __construct(
        private readonly MicrosoftOidc $microsoft,
        private readonly SessionIssuer $sessions,
    ) {}

    /** Qué métodos de inicio de sesión ofrece el servidor (para mostrar u ocultar el botón). */
    public function providers(): JsonResponse
    {
        return response()->json([
            'microsoft' => $this->microsoft->enabled(),
            'internal_domains' => config('services.internal_email_domains'),
        ]);
    }

    public function redirect(Request $request): RedirectResponse|JsonResponse
    {
        abort_unless($this->microsoft->enabled(), 404, __('El inicio de sesión con Microsoft no está configurado.'));
        $return = $this->allowedReturnUrl((string) $request->query('return', ''));
        abort_if($return === null, 422, __('La página de retorno no está permitida.'));

        $flow = $this->microsoft->beginAuthorization();
        Cache::put("ms-oidc:{$flow['state']}", [
            'nonce' => $flow['nonce'], 'verifier' => $flow['verifier'], 'return' => $return,
        ], self::STATE_TTL_SECONDS);

        return redirect()->away($flow['url']);
    }

    public function callback(Request $request): RedirectResponse
    {
        $state = (string) $request->query('state', '');
        // Chrome en Android puede pedir el callback dos veces seguidas al volver a la app instalada.
        // La segunda petición ya no encuentra el flujo (se consume en la primera) y respondía «expired»,
        // que era lo que veía la persona. Con la misma URL (state + código de Microsoft) se repite el
        // resultado de la primera; el código de inicio que lleva sigue siendo de un solo uso.
        $this->replayKey = $state !== '' ? 'ms-oidc-done:'.hash('sha256', $state.'|'.(string) $request->query('code', '')) : null;
        if ($this->replayKey !== null && is_string($previous = Cache::get($this->replayKey))) {
            return redirect()->away($previous);
        }
        $flow = $state !== '' ? Cache::pull("ms-oidc:{$state}") : null;
        $return = is_array($flow) ? $flow['return'] : config('services.frontend_url').'/auth/microsoft';

        if (! is_array($flow)) {
            $this->replayKey = null;

            return $this->back($return, ['error' => 'expired']);
        }
        if ($request->filled('error')) {
            // Microsoft devolvió el error en la URL (p. ej. AADSTS50011, URI de retorno no registrada): se
            // registra su código para poder diagnosticarlo; la persona solo ve «cancelado» o «fallido».
            if ($request->query('error') !== 'access_denied') {
                Log::warning('Microsoft devolvió un error en el inicio de sesión', [
                    'error' => Str::limit((string) $request->query('error'), 100, ''),
                    'description' => Str::limit((string) $request->query('error_description'), 300, ''),
                ]);
            }

            return $this->back($return, ['error' => $request->query('error') === 'access_denied' ? 'cancelled' : 'failed']);
        }

        try {
            $identity = $this->microsoft->completeAuthorization((string) $request->query('code', ''), $flow['verifier'], $flow['nonce']);
        } catch (Throwable $e) {
            Log::warning('Inicio de sesión con Microsoft fallido', ['error' => $e->getMessage()]);

            return $this->back($return, ['error' => 'failed']);
        }

        if (! InstitutionalEmail::isInternal($identity['email'])) {
            return $this->back($return, ['error' => 'not_institutional']);
        }

        // La cuenta se identifica por el ID estable de Microsoft (oid); el correo solo sirve para el primer enlace.
        $user = User::withTrashed()->where('microsoft_oid', $identity['oid'])->first()
            ?? User::withTrashed()->whereRaw('LOWER(email) = ?', [$identity['email']])->first();
        if ($user && $user->microsoft_oid !== null && $user->microsoft_oid !== $identity['oid']) {
            // El correo ya pertenece a otra persona de Microsoft (correo reasignado): no se hereda la cuenta.
            Log::warning('Inicio con Microsoft: el correo está atado a otra identidad', ['user_id' => $user->id]);

            return $this->back($return, ['error' => 'account_mismatch']);
        }
        if ($user?->trashed()) {
            return $this->back($return, ['error' => 'inactive']);
        }

        if (! $user) {
            $this->createAccessRequest($identity);

            return $this->back($return, ['error' => 'pending_approval']);
        }
        if ($user->access_request_status === User::ACCESS_PENDING) {
            return $this->back($return, ['error' => 'pending_approval']);
        }
        if ($user->access_request_status === User::ACCESS_REJECTED) {
            return $this->back($return, ['error' => 'rejected']);
        }
        if (! $user->is_active) {
            return $this->back($return, ['error' => 'inactive']);
        }

        // Microsoft ya verificó el correo y la contraseña; no aplica el cambio de contraseña temporal.
        $user->forceFill([
            'microsoft_oid' => $identity['oid'],
            'email_verified_at' => $user->email_verified_at ?? now(),
            'must_change_password' => false,
        ])->save();
        AuditLogService::log($user, 'LOGIN_MICROSOFT', 'autenticacion', ':name inició sesión con Microsoft 365.', [], params: ['name' => $user->name]);

        $code = Str::random(64);
        Cache::put("ms-login:{$code}", $user->id, self::LOGIN_CODE_TTL_SECONDS);

        return $this->back($return, ['code' => $code]);
    }

    public function exchange(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'size:64']]);
        $userId = Cache::pull("ms-login:{$data['code']}");
        $user = $userId ? User::find($userId) : null;
        abort_unless($user && $user->is_active, 401, __('El código de inicio de sesión expiró. Vuelve a intentarlo.'));

        return response()->json(new AuthResource($this->sessions->issue($user)));
    }

    /**
     * Persona de ULEAM que entró con Microsoft sin estar registrada: queda una cuenta inactiva, sin acceso,
     * hasta que un SUPER_ADMIN o ADMIN apruebe la solicitud y le asigne un rol.
     *
     * @param  array{email: string, oid: string, name: string}  $identity
     */
    private function createAccessRequest(array $identity): void
    {
        $user = User::create([
            'name' => $identity['name'] !== '' ? Str::limit($identity['name'], 250, '') : Str::before($identity['email'], '@'),
            'email' => $identity['email'],
            'password' => app(\App\Application\Auth\Services\AccountInvitation::class)->placeholderPassword(),
            'rol' => User::ROLE_USER,
            'is_active' => false,
            'must_change_password' => false,
            'microsoft_oid' => $identity['oid'],
            'access_request_status' => User::ACCESS_PENDING,
            'access_requested_at' => now(),
        ]);
        $user->forceFill(['email_verified_at' => now()])->save();
        AuditLogService::log($user, 'ACCESS_REQUESTED', 'usuarios', ':name solicitó acceso al iniciar sesión con Microsoft 365.', [], params: ['name' => $user->name]);
    }

    /** Solo se vuelve a orígenes del frontend autorizados en CORS (evita redirecciones abiertas). */
    private function allowedReturnUrl(string $url): ?string
    {
        $parts = parse_url($url);
        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host']) || ! in_array($parts['scheme'], ['http', 'https'], true)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            return null;
        }
        $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');

        return in_array($origin, (array) config('cors.allowed_origins', []), true) ? $url : null;
    }

    private function back(string $return, array $params): RedirectResponse
    {
        $url = $return.'?'.http_build_query($params);
        if ($this->replayKey !== null) {
            Cache::put($this->replayKey, $url, self::CALLBACK_REPLAY_TTL_SECONDS);
        }

        return redirect()->away($url);
    }
}
