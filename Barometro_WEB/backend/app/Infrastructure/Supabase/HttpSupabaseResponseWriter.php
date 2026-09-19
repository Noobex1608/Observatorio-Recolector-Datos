<?php

namespace App\Infrastructure\Supabase;

use App\Application\Responses\Contracts\SupabaseResponseWriter;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class HttpSupabaseResponseWriter implements SupabaseResponseWriter
{
    public function upsertResponse(array $record): void
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = trim((string) config('services.supabase.service_role_key'));
        $table = (string) config('services.supabase.responses_table', 'form_responses');
        $schema = (string) config('services.supabase.schema', 'public');

        if ($url === '' || $serviceKey === '') {
            throw new RuntimeException('Supabase no esta configurado en backend.');
        }

        $this->assertValidServiceRoleKey($serviceKey);

        $endpoint = sprintf('%s/rest/v1/%s?on_conflict=id', $url, $table);

        $response = Http::timeout(10)
            ->withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer ' . $serviceKey,
                'Content-Type' => 'application/json',
                'Prefer' => 'resolution=merge-duplicates,return=minimal',
                'Accept-Profile' => $schema,
                'Content-Profile' => $schema,
            ])
            ->post($endpoint, [$record]);

        if (!$response->successful()) {
            $message = $response->json('message')
                ?? $response->json('error')
                ?? ('Supabase respondio con estado ' . $response->status());

            throw new RuntimeException((string) $message);
        }
    }

    private function assertValidServiceRoleKey(string $serviceKey): void
    {
        SupabaseKeyValidator::validate($serviceKey);
    }
}