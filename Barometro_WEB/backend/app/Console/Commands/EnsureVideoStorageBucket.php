<?php

namespace App\Console\Commands;

use App\Application\Responses\Contracts\VideoStorageAdapter;
use App\Infrastructure\Storage\LocalVideoStorageAdapter;
use App\Infrastructure\Storage\S3VideoStorageAdapter;
use App\Infrastructure\Storage\SupabaseVideoStorageAdapter;
use Illuminate\Console\Command;
use Throwable;

class EnsureVideoStorageBucket extends Command
{
    protected $signature = 'storage:ensure-video-bucket {--driver= : Driver a verificar o provisionar (supabase, local, s3)}';

    protected $description = 'Verifica y crea el bucket o directorio de almacenamiento de videos en el proveedor configurado (Supabase u otro)';

    public function handle(VideoStorageAdapter $defaultAdapter): int
    {
        $driver = $this->option('driver') ?: config('services.video_storage.driver', 'supabase');

        $this->info("Verificando almacenamiento de videos con driver: [{$driver}]...");

        $adapter = match (strtolower((string) $driver)) {
            'local' => app(LocalVideoStorageAdapter::class),
            's3' => app(S3VideoStorageAdapter::class),
            'supabase' => app(SupabaseVideoStorageAdapter::class),
            default => $defaultAdapter,
        };

        try {
            $adapter->ensureBucket();
            $this->info("✓ Bucket/Directorio verificado y listo en [{$adapter->getDriverName()}].");

            if ($adapter->getDriverName() === 'supabase') {
                $bucketName = config('services.supabase.video_bucket', 'videos');
                $this->line("  Bucket de Supabase: <comment>{$bucketName}</comment>");
                $this->line("  URL de endpoint: <comment>" . config('services.supabase.url') . "/storage/v1/object/public/{$bucketName}</comment>");
            }

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error("✗ Error configurando el almacenamiento de videos: " . $e->getMessage());

            return self::FAILURE;
        }
    }
}
