<?php

namespace App\Infrastructure\Storage;

use App\Application\Responses\Contracts\VideoStorageAdapter;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class S3VideoStorageAdapter implements VideoStorageAdapter
{
    private string $disk;
    private string $directory;

    public function __construct(string $disk = 's3', string $directory = 'videos')
    {
        $this->disk = $disk;
        $this->directory = trim($directory, '/');
    }

    public function upload(string $path, string $binaryData, string $mimeType = 'video/mp4'): string
    {
        $targetPath = $this->resolvePath($path);
        $saved = Storage::disk($this->disk)->put($targetPath, $binaryData, [
            'visibility' => 'public',
            'mimetype' => $mimeType,
        ]);

        if (!$saved) {
            throw new RuntimeException("Error al guardar video en S3/Cloud Storage '{$this->disk}'.");
        }

        return $this->getUrl($path);
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
        $targetPath = $this->resolvePath($path);

        return Storage::disk($this->disk)->delete($targetPath);
    }

    public function getUrl(string $path): string
    {
        $targetPath = $this->resolvePath($path);

        return Storage::disk($this->disk)->url($targetPath);
    }

    public function ensureBucket(): void
    {
        // En S3, el bucket es provisionado en la infraestructura cloud o via Terraform/AWS CLI.
        // Verificamos conexión simple:
        try {
            Storage::disk($this->disk)->exists('health-check');
        } catch (\Throwable $e) {
            // Ignorado si no existe
        }
    }

    public function getDriverName(): string
    {
        return 's3';
    }

    private function resolvePath(string $path): string
    {
        $cleanPath = ltrim($path, '/');

        return $this->directory !== '' ? "{$this->directory}/{$cleanPath}" : $cleanPath;
    }
}
