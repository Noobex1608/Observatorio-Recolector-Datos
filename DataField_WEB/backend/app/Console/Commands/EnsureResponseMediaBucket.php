<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Infrastructure\Storage\SupabaseResponseMediaStorage;
use Illuminate\Console\Command;
use Throwable;

class EnsureResponseMediaBucket extends Command
{
    protected $signature = 'storage:ensure-response-media-bucket';

    protected $description = 'Verifica o crea el bucket privado de medios de respuestas en Supabase';

    public function handle(SupabaseResponseMediaStorage $storage): int
    {
        try {
            $storage->ensurePrivateBucket();
            $this->info('Bucket privado de medios de respuestas listo.');

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
    }
}
