<?php

namespace App\Infrastructure\Storage;

use App\Application\Responses\Contracts\VideoStorageAdapter;
use App\Infrastructure\Supabase\SupabaseKeyValidator;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class SupabaseVideoStorageAdapter implements VideoStorageAdapter
{
    private string $bucket;
    private string $url;
    private string $serviceKey;

    public function __construct()
    {
        $this->url = rtrim((string) config('services.supabase.url'), '/');
        $this->serviceKey = trim((string) config('services.supabase.service_role_key'));
        $this->bucket = (string) config('services.supabase.video_bucket', 'videos');
    }

    public function upload(string $path, string $binaryData, string $mimeType = 'video/mp4'): string
    {
        $this->ensureConfigured();
        $cleanPath = ltrim($path, '/');
        $endpoint = sprintf('%s/storage/v1/object/%s/%s', $this->url, $this->bucket, $cleanPath);

        $response = Http::timeout(60)
            ->withHeaders([
                'apikey' => $this->serviceKey,
                'Authorization' => 'Bearer ' . $this->serviceKey,
                'Content-Type' => $mimeType,
                'x-upsert' => 'true',
            ])
            ->withBody($binaryData, $mimeType)
            ->post($endpoint);

        if (!$response->successful()) {
            $message = $response->json('message')
                ?? $response->json('error')
                ?? ('Error de Supabase Storage (' . $response->status() . ')');

            throw new RuntimeException("Fallo al subir video a Supabase Storage: {$message}");
        }

        return $this->getUrl($cleanPath);
    }

    public function uploadBase64(string $path, string $base64DataUrl): string
    {
        $mimeType = 'video/mp4';
        $data = $base64DataUrl;

        if (preg_match('/^data:([^;]+);base64,(.*)$/s', $base64DataUrl, $matches)) {
            $mimeType = $matches[1];
            $data = $matches[2];
        }

        $binary = base64_decode($data);
        if ($binary === false) {
            throw new RuntimeException('Cadena Base64 de video inválida.');
        }

        return $this->upload($path, $binary, $mimeType);
    }

    public function delete(string $path): bool
    {
        $this->ensureConfigured();
        $cleanPath = ltrim($path, '/');
        $endpoint = sprintf('%s/storage/v1/object/%s', $this->url, $this->bucket);

        $response = Http::timeout(15)
            ->withHeaders([
                'apikey' => $this->serviceKey,
                'Authorization' => 'Bearer ' . $this->serviceKey,
                'Content-Type' => 'application/json',
            ])
            ->delete($endpoint, [
                'prefixes' => [$cleanPath],
            ]);

        return $response->successful();
    }

    public function getUrl(string $path): string
    {
        $cleanPath = ltrim($path, '/');

        return sprintf('%s/storage/v1/object/public/%s/%s', $this->url, $this->bucket, $cleanPath);
    }

    public function ensureBucket(): void
    {
        $this->ensureConfigured();

        $checkEndpoint = sprintf('%s/storage/v1/bucket/%s', $this->url, $this->bucket);
        $check = Http::timeout(10)
            ->withHeaders([
                'apikey' => $this->serviceKey,
                'Authorization' => 'Bearer ' . $this->serviceKey,
            ])
            ->get($checkEndpoint);

        if ($check->successful()) {
            return;
        }

        $createEndpoint = sprintf('%s/storage/v1/bucket', $this->url);
        $create = Http::timeout(15)
            ->withHeaders([
                'apikey' => $this->serviceKey,
                'Authorization' => 'Bearer ' . $this->serviceKey,
                'Content-Type' => 'application/json',
            ])
            ->post($createEndpoint, [
                'id' => $this->bucket,
                'name' => $this->bucket,
                'public' => true,
                'file_size_limit' => (int) config('services.supabase.storage_file_limit', 52428800),
                'allowed_mime_types' => [
                    'video/mp4',
                    'video/webm',
                    'video/quicktime',
                    'video/ogg',
                    'video/x-msvideo',
                    'video/mpeg',
                ],
            ]);

        if (!$create->successful() && $create->status() !== 409 && $create->status() !== 400) {
            $message = $create->json('message') ?? $create->json('error') ?? ('Estado ' . $create->status());
            throw new RuntimeException("No se pudo crear el bucket de Supabase '{$this->bucket}': {$message}");
        }
    }

    public function getDriverName(): string
    {
        return 'supabase';
    }

    private function ensureConfigured(): void
    {
        if ($this->url === '' || $this->serviceKey === '') {
            throw new RuntimeException('Supabase URL o Service Role Key no están configurados en backend.');
        }

        SupabaseKeyValidator::validate($this->serviceKey);
    }
}
