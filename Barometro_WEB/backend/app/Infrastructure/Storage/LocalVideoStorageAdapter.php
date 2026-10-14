<?php

namespace App\Infrastructure\Storage;

use App\Application\Responses\Contracts\VideoStorageAdapter;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class LocalVideoStorageAdapter implements VideoStorageAdapter
{
    private string $disk;
    private string $directory;

    public function __construct(string $disk = 'public', string $directory = 'videos')
    {
        $this->disk = $disk;
        $this->directory = trim($directory, '/');
    }

    public function upload(string $path, string $binaryData, string $mimeType = 'video/mp4'): string
    {
        $targetPath = $this->resolvePath($path);
        $saved = Storage::disk($this->disk)->put($targetPath, $binaryData);

        if (!$saved) {
            throw new RuntimeException("Error al guardar video en disco local '{$this->disk}'.");
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
        if (!Storage::disk($this->disk)->exists($this->directory)) {
            Storage::disk($this->disk)->makeDirectory($this->directory);
        }
    }

    public function getDriverName(): string
    {
        return 'local';
    }

    private function resolvePath(string $path): string
    {
        $cleanPath = ltrim($path, '/');

        return $this->directory !== '' ? "{$this->directory}/{$cleanPath}" : $cleanPath;
    }
}
