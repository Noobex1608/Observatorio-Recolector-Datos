<?php

namespace App\Providers;

use App\Application\Forms\Contracts\SupabaseFormSchemaWriter;
use App\Application\Responses\Contracts\ResponseMediaStorage;
use App\Application\Responses\Contracts\SupabaseResponseWriter;
use App\Application\Responses\Contracts\VideoStorageAdapter;
use App\Infrastructure\Storage\LocalVideoStorageAdapter;
use App\Infrastructure\Storage\S3VideoStorageAdapter;
use App\Infrastructure\Storage\SupabaseResponseMediaStorage;
use App\Infrastructure\Storage\SupabaseVideoStorageAdapter;
use App\Infrastructure\Supabase\HttpSupabaseFormSchemaWriter;
use App\Infrastructure\Supabase\HttpSupabaseResponseWriter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(SupabaseFormSchemaWriter::class, HttpSupabaseFormSchemaWriter::class);
        $this->app->bind(SupabaseResponseWriter::class, HttpSupabaseResponseWriter::class);
        $this->app->bind(ResponseMediaStorage::class, function () {
            return match (config('services.response_media.driver', 'supabase')) {
                'supabase' => $this->app->make(SupabaseResponseMediaStorage::class),
                default => throw new \InvalidArgumentException('Proveedor de medios de respuestas no configurado.'),
            };
        });

        $this->app->bind(VideoStorageAdapter::class, function () {
            $driver = strtolower((string) config('services.video_storage.driver', 'supabase'));

            return match ($driver) {
                'local' => $this->app->make(LocalVideoStorageAdapter::class),
                's3' => $this->app->make(S3VideoStorageAdapter::class),
                'supabase' => $this->app->make(SupabaseVideoStorageAdapter::class),
                default => $this->app->make(SupabaseVideoStorageAdapter::class),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('public-form-submit', function (Request $request) {
            $ip = $request->ip() ?? 'unknown';
            $form = (string) $request->route('link_uuid');

            return [
                Limit::perMinute(30)->by('public-submit-ip:'.$ip),
                Limit::perMinute(20)->by('public-submit-form:'.$form.':'.$ip),
            ];
        });
        RateLimiter::for('mobile-form-submit', function (Request $request) {
            $ip = $request->ip() ?? 'unknown';
            $user = $request->user()?->id ?? 'anonymous';
            $form = (string) $request->input('form_id', 'unknown');

            return [
                Limit::perMinute(60)->by('mobile-submit-ip:'.$ip),
                Limit::perMinute(30)->by('mobile-submit-user-form:'.$user.':'.$form),
            ];
        });
        RateLimiter::for('response-export', fn (Request $request) => [
            Limit::perMinute(10)->by('response-export-user:'.($request->user()?->id ?? 'anonymous')),
            Limit::perMinute(5)->by('response-export-form:'.$request->route('id').':'.($request->user()?->id ?? 'anonymous')),
        ]);
    }
}
