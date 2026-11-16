<?php

declare(strict_types=1);

namespace Tests\Fakes;

use App\Application\Responses\Contracts\ResponseMediaStorage;
use RuntimeException;

class InMemoryResponseMediaStorage implements ResponseMediaStorage
{
    /** @var array<string, array{bytes: string, mime: string}> */
    public array $objects = [];

    public bool $failUpload = false;

    public function upload(string $path, string $bytes, string $mimeType): void
    {
        if ($this->failUpload) {
            throw new RuntimeException('storage unavailable');
        }
        if (isset($this->objects[$path])) {
            throw new RuntimeException('duplicate path');
        }
        $this->objects[$path] = ['bytes' => $bytes, 'mime' => $mimeType];
    }

    public function temporaryUrl(string $path, int $expiresInSeconds = 300): string
    {
        if (! isset($this->objects[$path])) {
            throw new RuntimeException('missing');
        }

        return 'https://media.test/signed/'.rawurlencode($path);
    }

    public function delete(string $path): void
    {
        unset($this->objects[$path]);
    }

    public function driverName(): string
    {
        return 'test_private';
    }
}
