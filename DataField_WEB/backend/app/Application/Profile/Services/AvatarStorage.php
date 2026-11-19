<?php

declare(strict_types=1);

namespace App\Application\Profile\Services;

use GdImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

final class AvatarStorage
{
    private const DISK = 'public';

    /** Lado del avatar guardado: cubre el doble del tamaño mayor en pantalla (círculos de 32 a 120 px). */
    public const SIZE = 256;

    /** Calidad WebP: a 256 px el archivo queda en unos pocos KB sin pérdida visible. */
    private const WEBP_QUALITY = 80;

    /**
     * Guarda la foto optimizada para la web: recortada al centro en cuadrado, reducida a 256×256,
     * en WebP y sin metadatos (EXIF, incluida la ubicación GPS de la foto). Respeta la orientación
     * de las fotos tomadas con el celular.
     */
    public function store(UploadedFile $file): string
    {
        return $this->storeOptimized((string) file_get_contents($file->getRealPath()));
    }

    /** Optimiza los bytes de una imagen y la guarda; devuelve la URL pública. */
    public function storeOptimized(string $contents): string
    {
        $bytes = $this->optimize($contents);
        $path = 'avatars/'.Str::uuid().'.webp';

        if (! Storage::disk(self::DISK)->put($path, $bytes, 'public')) {
            throw new RuntimeException('No se pudo guardar el avatar.');
        }

        return rtrim((string) config('app.url'), '/').'/api/avatars/'.basename($path);
    }

    /** @return string bytes WebP */
    public function optimize(string $contents): string
    {
        if (! function_exists('imagewebp')) {
            throw new RuntimeException('El servidor no tiene soporte de imágenes WebP (extensión GD).');
        }
        $source = $contents !== '' ? @imagecreatefromstring($contents) : false;
        if (! $source instanceof GdImage) {
            throw ValidationException::withMessages([
                'avatar' => 'No se pudo leer la imagen. Usa una foto JPG, PNG o WebP.',
            ]);
        }

        $source = $this->orient($source, $contents);
        $width = imagesx($source);
        $height = imagesy($source);
        $side = min($width, $height);
        $target = min(self::SIZE, $side);

        $avatar = imagecreatetruecolor($target, $target);
        // Conserva la transparencia de PNG y WebP.
        imagealphablending($avatar, false);
        imagesavealpha($avatar, true);
        imagefill($avatar, 0, 0, imagecolorallocatealpha($avatar, 0, 0, 0, 127));
        imagecopyresampled(
            $avatar, $source, 0, 0,
            intdiv($width - $side, 2), intdiv($height - $side, 2),
            $target, $target, $side, $side,
        );

        ob_start();
        $ok = imagewebp($avatar, null, self::WEBP_QUALITY);
        $bytes = (string) ob_get_clean();
        imagedestroy($source);
        imagedestroy($avatar);

        if (! $ok || $bytes === '') {
            throw new RuntimeException('No se pudo convertir el avatar a WebP.');
        }

        return $bytes;
    }

    /** Gira la foto según su orientación EXIF (los celulares guardan la foto «acostada» y la marcan así). */
    private function orient(GdImage $image, string $contents): GdImage
    {
        if (! function_exists('exif_read_data') || ! str_starts_with($contents, "\xFF\xD8")) {
            return $image;
        }
        $exif = @exif_read_data('data://image/jpeg;base64,'.base64_encode($contents));
        $orientation = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;

        $rotated = match ($orientation) {
            3 => imagerotate($image, 180, 0),
            6 => imagerotate($image, -90, 0),
            8 => imagerotate($image, 90, 0),
            default => $image,
        };
        if ($rotated instanceof GdImage && $rotated !== $image) {
            imagedestroy($image);

            return $rotated;
        }

        return $image;
    }

    /** Bytes de una foto ya guardada (disco actual o ubicación de versiones anteriores); null si no existe. */
    public function read(?string $avatarUrl): ?string
    {
        $filename = $this->filenameOf($avatarUrl);
        if ($filename === null) {
            return null;
        }
        foreach ([[self::DISK, 'avatars/'.$filename], ['local', 'public/avatars/'.$filename]] as [$disk, $filePath]) {
            if (Storage::disk($disk)->exists($filePath)) {
                return Storage::disk($disk)->get($filePath);
            }
        }

        return null;
    }

    private function filenameOf(?string $avatarUrl): ?string
    {
        $path = $avatarUrl ? parse_url($avatarUrl, PHP_URL_PATH) : null;
        if (! is_string($path) || ! preg_match('~/api/avatars/([A-Za-z0-9_.-]+)$~', $path, $matches)
            || in_array($matches[1], ['.', '..'], true)) {
            return null;
        }

        return $matches[1];
    }

    /** Remove avatars from the current disk and the location used by older releases. */
    public function delete(?string $avatarUrl): bool
    {
        if ($avatarUrl === null || $avatarUrl === '') {
            return true;
        }

        $path = parse_url($avatarUrl, PHP_URL_PATH);
        if (! is_string($path) || ! preg_match('~/api/avatars/([A-Za-z0-9_.-]+)$~', $path, $matches)) {
            return false;
        }

        $filename = $matches[1];
        if ($filename === '.' || $filename === '..') {
            return false;
        }

        $locations = [
            [self::DISK, 'avatars/'.$filename],
            // Older releases wrote `public/avatars` on the default local disk.
            ['local', 'public/avatars/'.$filename],
        ];

        foreach ($locations as [$disk, $filePath]) {
            $storage = Storage::disk($disk);
            if ($storage->exists($filePath) && ! $storage->delete($filePath)) {
                return false;
            }
        }

        return true;
    }
}
