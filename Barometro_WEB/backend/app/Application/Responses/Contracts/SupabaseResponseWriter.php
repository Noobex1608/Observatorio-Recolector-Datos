<?php

namespace App\Application\Responses\Contracts;

interface SupabaseResponseWriter
{
    /**
     * @throws \RuntimeException
     */
    public function upsertResponse(array $record): void;
}
