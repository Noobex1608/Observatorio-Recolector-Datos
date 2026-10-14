<?php

namespace App\Providers;

use App\Application\Auth\Contracts\SupabaseAuthUserProvisioner;
use App\Application\Forms\Contracts\SupabaseFormSchemaWriter;
use App\Application\Responses\Contracts\SupabaseResponseWriter;
use App\Application\Responses\Contracts\VideoStorageAdapter;
use App\Infrastructure\Storage\LocalVideoStorageAdapter;
use App\Infrastructure\Storage\S3VideoStorageAdapter;
use App\Infrastructure\Storage\SupabaseVideoStorageAdapter;
use App\Infrastructure\Supabase\HttpSupabaseAuthUserProvisioner;
use App\Infrastructure\Supabase\HttpSupabaseFormSchemaWriter;
use App\Infrastructure\Supabase\HttpSupabaseResponseWriter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(SupabaseAuthUserProvisioner::class, HttpSupabaseAuthUserProvisioner::class);
        $this->app->bind(SupabaseFormSchemaWriter::class, HttpSupabaseFormSchemaWriter::class);
        $this->app->bind(SupabaseResponseWriter::class, HttpSupabaseResponseWriter::class);

        $this->app->bind(VideoStorageAdapter::class, function () {
            $driver = strtolower((string) config('services.video_storage.driver', 'supabase'));

            return match ($driver) {
                'local' => $this->app->make(LocalVideoStorageAdapter::class),
                's3' => $this->app->make(S3VideoStorageAdapter::class),
                'supabase', default => $this->app->make(SupabaseVideoStorageAdapter::class),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
