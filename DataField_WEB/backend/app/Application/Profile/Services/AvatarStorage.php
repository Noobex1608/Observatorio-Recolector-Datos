<?php

declare(strict_types=1);

namespace App\Application\Profile\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

final class AvatarStorage
{
    private const DISK = 'public';

    public function store(UploadedFile $file): string
    {
        $path = $file->storePublicly('avatars', self::DISK);

        if (! is_string($path) || $path === '') {
            throw new RuntimeException('No se pudo guardar el avatar.');
        }

        return rtrim((string) config('app.url'), '/').'/api/avatars/'.basename($path);
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
