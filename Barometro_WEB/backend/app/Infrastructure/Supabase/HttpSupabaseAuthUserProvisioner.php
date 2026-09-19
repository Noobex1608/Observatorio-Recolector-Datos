<?php

namespace App\Infrastructure\Supabase;

use App\Application\Auth\Contracts\SupabaseAuthUserProvisioner;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class HttpSupabaseAuthUserProvisioner implements SupabaseAuthUserProvisioner
{
    public function ensureUser(User $user, ?string $plainPassword = null): void
    {
        try {
            $url = rtrim((string) config('services.supabase.url'), '/');
            $serviceKey = trim((string) config('services.supabase.service_role_key'));

            if ($url === '' || $serviceKey === '') {
                return;
            }

            $this->assertValidServiceRoleKey($serviceKey);

            $http = Http::timeout(5)
                ->withHeaders([
                    'apikey' => $serviceKey,
                    'Authorization' => 'Bearer ' . $serviceKey,
                    'Content-Type' => 'application/json',
                ]);

            $payload = [
                'email' => $user->email,
                'email_confirm' => true,
                'user_metadata' => [
                    'name' => $user->name,
                    'local_user_id' => (string) $user->id,
                    'role' => $user->rol,
                    'is_active' => (bool) $user->is_active,
                ],
                'app_metadata' => [
                    'provider' => 'email',
                    'providers' => ['email'],
                    'role' => $user->rol,
                ],
                'ban_duration' => $user->is_active ? 'none' : '876000h',
            ];

            if ($plainPassword !== null && $plainPassword !== '') {
                $payload['password'] = $plainPassword;
            }

            if ($user->supabase_auth_id) {
                $endpoint = sprintf('%s/auth/v1/admin/users/%s', $url, $user->supabase_auth_id);
                $response = $http->put($endpoint, $payload);

                if ($response->successful()) {
                    return;
                }

                if ($response->status() === 404) {
                    $user->forceFill(['supabase_auth_id' => null])->saveQuietly();
                } else {
                    $error = (string) ($response->json('msg')
                        ?? $response->json('message')
                        ?? $response->json('error_description')
                        ?? $response->json('error')
                        ?? '');

                    throw new RuntimeException('No se pudo actualizar usuario en Supabase Auth. ' . $error);
                }
            }

            $endpoint = sprintf('%s/auth/v1/admin/users', $url);
            $response = $http->post($endpoint, [
                ...$payload,
                'password' => $payload['password'] ?? Str::password(40),
            ]);

            if ($response->successful()) {
                $authId = (string) ($response->json('id') ?? $response->json('user.id') ?? '');
                if ($authId !== '') {
                    $user->forceFill(['supabase_auth_id' => $authId])->saveQuietly();
                }

                return;
            }

            $error = (string) ($response->json('msg')
                ?? $response->json('message')
                ?? $response->json('error_description')
                ?? $response->json('error')
                ?? '');

            if ($this->isDuplicateUserError($response->status(), $error)) {
                // Usuario ya existe en Auth pero no tenemos id local. Mantener login local sin romper.
                return;
            }

            throw new RuntimeException('No se pudo aprovisionar usuario en Supabase Auth. ' . $error);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Supabase Auth provisioning skipped due to connection: ' . $e->getMessage());
        }
    }

    public function deleteUser(?string $supabaseAuthId): void
    {
        if (!$supabaseAuthId) {
            return;
        }

        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = trim((string) config('services.supabase.service_role_key'));

        if ($url === '' || $serviceKey === '') {
            throw new RuntimeException('Supabase no esta configurado en backend.');
        }

        $this->assertValidServiceRoleKey($serviceKey);

        $endpoint = sprintf('%s/auth/v1/admin/users/%s', $url, $supabaseAuthId);

        $response = Http::timeout(10)
            ->withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer ' . $serviceKey,
                'Content-Type' => 'application/json',
            ])
            ->delete($endpoint);

        if ($response->successful() || $response->status() === 404) {
            return;
        }

        $error = (string) ($response->json('msg')
            ?? $response->json('message')
            ?? $response->json('error_description')
            ?? $response->json('error')
            ?? '');

        throw new RuntimeException('No se pudo eliminar usuario en Supabase Auth. ' . $error);
    }

    private function isDuplicateUserError(int $status, string $error): bool
    {
        if (!in_array($status, [400, 409, 422], true)) {
            return false;
        }

        $haystack = mb_strtolower($error);

        return str_contains($haystack, 'already')
            || str_contains($haystack, 'registered')
            || str_contains($haystack, 'exists')
            || str_contains($haystack, 'duplicate')
            || str_contains($haystack, 'unique');
    }

    private function assertValidServiceRoleKey(string $serviceKey): void
    {
        SupabaseKeyValidator::validate($serviceKey);
    }
}