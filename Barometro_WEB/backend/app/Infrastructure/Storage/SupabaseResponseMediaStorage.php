<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

use App\Application\Responses\Contracts\ResponseMediaStorage;
use App\Infrastructure\Supabase\SupabaseKeyValidator;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class SupabaseResponseMediaStorage implements ResponseMediaStorage
{
    private readonly string $url;

    private readonly string $key;

    private readonly string $bucket;

    private bool $privateVerified = false;

    public function __construct()
    {
        $this->url = rtrim((string) config('services.supabase.url'), '/');
        $this->key = trim((string) config('services.supabase.service_role_key'));
        $this->bucket = (string) config('services.supabase.response_media_bucket', 'response-media');
    }

    public function upload(string $path, string $bytes, string $mimeType): void
    {
        $this->assertConfigured();
        $this->assertPrivateBucket();
        $response = $this->request()->withHeaders([
            'Content-Type' => $mimeType,
            'x-upsert' => 'false',
        ])->withBody($bytes, $mimeType)->post($this->objectUrl($path));

        if (! $response->successful()) {
            throw new RuntimeException('No se pudo guardar el medio en el bucket privado de Supabase (HTTP '.$response->status().').');
        }
    }

    public function temporaryUrl(string $path, int $expiresInSeconds = 300): string
    {
        $this->assertConfigured();
        $this->assertPrivateBucket();
        $endpoint = sprintf('%s/storage/v1/object/sign/%s/%s', $this->url, $this->bucket, ltrim($path, '/'));
        $response = $this->request()->post($endpoint, ['expiresIn' => $expiresInSeconds]);
        $signed = $response->json('signedURL');
        if (! $response->successful() || ! is_string($signed) || $signed === '') {
            throw new RuntimeException('No se pudo generar el acceso temporal al medio.');
        }

        return str_starts_with($signed, 'http') ? $signed : $this->url.'/storage/v1'.(str_starts_with($signed, '/') ? '' : '/').$signed;
    }

    public function delete(string $path): void
    {
        $this->assertConfigured();
        $endpoint = sprintf('%s/storage/v1/object/%s', $this->url, $this->bucket);
        $response = $this->request()->delete($endpoint, ['prefixes' => [ltrim($path, '/')]]);
        if (! $response->successful()) {
            throw new RuntimeException('No se pudo eliminar el medio del bucket privado de Supabase.');
        }
    }

    public function driverName(): string
    {
        return 'supabase_private';
    }

    public function ensurePrivateBucket(): void
    {
        $this->assertConfigured();
        $endpoint = sprintf('%s/storage/v1/bucket/%s', $this->url, $this->bucket);
        $check = $this->request()->get($endpoint);
        if ($check->successful()) {
            if ($check->json('public') !== false) {
                throw new RuntimeException('El bucket de medios existente debe ser privado; no se modificó automáticamente.');
            }

            $this->privateVerified = true;

            return;
        }
        $missing = $check->status() === 404
            || ($check->status() === 400 && $check->json('code') === 'NoSuchBucket');
        if (! $missing) {
            throw new RuntimeException('No se pudo verificar el bucket privado de medios (HTTP '.$check->status().').');
        }

        $created = $this->request()->post($this->url.'/storage/v1/bucket', [
            'id' => $this->bucket,
            'name' => $this->bucket,
            'public' => false,
            'file_size_limit' => (int) config('services.response_media.max_file_bytes', 31457280),
            'allowed_mime_types' => [
                'image/jpeg', 'image/png', 'image/webp', 'image/gif',
                'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm',
                'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
            ],
        ]);
        if (! $created->successful()) {
            throw new RuntimeException('No se pudo crear el bucket privado de medios (HTTP '.$created->status().').');
        }
        $this->privateVerified = true;
    }

    private function objectUrl(string $path): string
    {
        return sprintf('%s/storage/v1/object/%s/%s', $this->url, $this->bucket, ltrim($path, '/'));
    }

    private function assertConfigured(): void
    {
        if ($this->url === '' || $this->key === '' || $this->bucket === '') {
            throw new RuntimeException('Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_RESPONSE_MEDIA_BUCKET.');
        }
        SupabaseKeyValidator::validate($this->key);
    }

    private function assertPrivateBucket(): void
    {
        if ($this->privateVerified) {
            return;
        }
        $endpoint = sprintf('%s/storage/v1/bucket/%s', $this->url, $this->bucket);
        $check = $this->request()->get($endpoint);
        if (! $check->successful() || $check->json('public') !== false) {
            throw new RuntimeException('El bucket de medios no existe o no es privado. Ejecute storage:ensure-response-media-bucket.');
        }
        $this->privateVerified = true;
    }

    private function request(): \Illuminate\Http\Client\PendingRequest
    {
        return Http::timeout(60)->withHeaders([
            'apikey' => $this->key,
            'Authorization' => 'Bearer '.$this->key,
        ]);
    }
}
