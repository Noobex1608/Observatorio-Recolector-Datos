<?php

declare(strict_types=1);

namespace App\Application\Auth\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Inicio de sesión con Microsoft 365 / Entra ID por OpenID Connect (flujo de código con PKCE).
 *
 * El id_token se obtiene directamente del endpoint de tokens de Microsoft por TLS, autenticando la
 * aplicación con su secret; por eso basta validar sus claims (OIDC Core §3.1.3.7) sin librería JWT.
 */
class MicrosoftOidc
{
    public function enabled(): bool
    {
        return filled(config('services.microsoft.client_id'))
            && filled(config('services.microsoft.client_secret'))
            && filled(config('services.microsoft.tenant_id'));
    }

    /** @return array{url: string, state: string, nonce: string, verifier: string} */
    public function beginAuthorization(): array
    {
        $state = Str::random(40);
        $nonce = Str::random(40);
        $verifier = Str::random(64);
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

        $query = http_build_query([
            'client_id' => config('services.microsoft.client_id'),
            'response_type' => 'code',
            'redirect_uri' => config('services.microsoft.redirect_uri'),
            'response_mode' => 'query',
            'scope' => 'openid profile email',
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
            'prompt' => 'select_account',
        ]);

        return [
            'url' => $this->authority().'/oauth2/v2.0/authorize?'.$query,
            'state' => $state, 'nonce' => $nonce, 'verifier' => $verifier,
        ];
    }

    /**
     * Canjea el código por tokens y devuelve el correo y el identificador estable del usuario en Microsoft.
     *
     * @return array{email: string, oid: string, name: string}
     */
    public function completeAuthorization(string $code, string $verifier, string $nonce): array
    {
        $response = Http::asForm()->acceptJson()->timeout(15)->post($this->authority().'/oauth2/v2.0/token', [
            'client_id' => config('services.microsoft.client_id'),
            'client_secret' => config('services.microsoft.client_secret'),
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => config('services.microsoft.redirect_uri'),
            'code_verifier' => $verifier,
            'scope' => 'openid profile email',
        ]);
        if ($response->failed() || ! is_string($response->json('id_token'))) {
            throw new RuntimeException(__('Microsoft rechazó el inicio de sesión.'));
        }

        $claims = $this->decodeClaims($response->json('id_token'));
        $tenant = (string) config('services.microsoft.tenant_id');
        $now = time();
        $valid = ($claims['aud'] ?? null) === config('services.microsoft.client_id')
            && ($claims['tid'] ?? null) === $tenant
            && ($claims['iss'] ?? null) === "https://login.microsoftonline.com/{$tenant}/v2.0"
            && hash_equals($nonce, (string) ($claims['nonce'] ?? ''))
            && is_numeric($claims['exp'] ?? null) && (int) $claims['exp'] > $now - 60
            && (! isset($claims['nbf']) || (int) $claims['nbf'] <= $now + 60);
        if (! $valid) {
            throw new RuntimeException(__('El token de Microsoft no es válido para esta aplicación.'));
        }

        $email = strtolower(trim((string) ($claims['email'] ?? $claims['preferred_username'] ?? '')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || ! is_string($claims['oid'] ?? null)) {
            throw new RuntimeException(__('La cuenta de Microsoft no tiene un correo válido.'));
        }

        return ['email' => $email, 'oid' => $claims['oid'], 'name' => (string) ($claims['name'] ?? '')];
    }

    private function authority(): string
    {
        return 'https://login.microsoftonline.com/'.rawurlencode((string) config('services.microsoft.tenant_id'));
    }

    /** @return array<string, mixed> */
    private function decodeClaims(string $jwt): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            throw new RuntimeException(__('Token de Microsoft con formato inválido.'));
        }
        $segment = strtr($parts[1], '-_', '+/');
        $payload = json_decode((string) base64_decode(str_pad($segment, (int) ceil(strlen($segment) / 4) * 4, '='), true), true);

        return is_array($payload) ? $payload : throw new RuntimeException(__('Token de Microsoft ilegible.'));
    }
}
