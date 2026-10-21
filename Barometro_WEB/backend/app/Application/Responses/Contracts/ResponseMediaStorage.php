<?php

declare(strict_types=1);

namespace App\Application\Responses\Contracts;

interface ResponseMediaStorage
{
    public function upload(string $path, string $bytes, string $mimeType): void;

    public function temporaryUrl(string $path, int $expiresInSeconds = 300): string;

    public function delete(string $path): void;

    public function driverName(): string;
}
