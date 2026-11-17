<?php

declare(strict_types=1);

namespace App\Infrastructure\Microsoft;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Token de aplicación de Microsoft Graph (client credentials) con la app registrada en Entra ID.
 * Los permisos efectivos (sitio de SharePoint, buzón) los concede DIIT a esa app.
 */
class GraphAppToken
{
    public function get(): string
    {
        $tenant = (string) config('services.microsoft.tenant_id');
        $client = (string) config('services.microsoft.client_id');
        $secret = (string) config('services.microsoft.client_secret');
        if ($tenant === '' || $client === '' || $secret === '') {
            throw new RuntimeException('Faltan MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID o MICROSOFT_CLIENT_SECRET.');
        }

        // El token dura ~60 min; se renueva antes de que venza.
        return Cache::remember("microsoft-graph-app-token:{$client}", now()->addMinutes(50), function () use ($tenant, $client, $secret) {
            $response = Http::asForm()->acceptJson()->timeout(15)
                ->post('https://login.microsoftonline.com/'.rawurlencode($tenant).'/oauth2/v2.0/token', [
                    'client_id' => $client,
                    'client_secret' => $secret,
                    'grant_type' => 'client_credentials',
                    'scope' => 'https://graph.microsoft.com/.default',
                ]);
            $token = $response->json('access_token');
            if ($response->failed() || ! is_string($token)) {
                throw new RuntimeException('No se obtuvo el token de Microsoft Graph (HTTP '.$response->status().').');
            }

            return $token;
        });
    }

    public function forget(): void
    {
        Cache::forget('microsoft-graph-app-token:'.config('services.microsoft.client_id'));
    }
}
