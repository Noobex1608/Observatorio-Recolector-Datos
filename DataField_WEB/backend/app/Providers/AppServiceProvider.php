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
        // Destino de los archivos nuevos. Los ya guardados se leen con el destino que registró cada
        // respuesta (storage_driver), así cambiar de Supabase a SharePoint no rompe los anteriores.
        $this->app->bind(ResponseMediaStorage::class, fn () => $this->responseMediaStorage(
            (string) config('services.response_media.driver', 'supabase')
        ) ?? throw new \InvalidArgumentException('Proveedor de medios de respuestas no configurado.'));
        $this->app->bind('response-media.storage-for', fn () => fn (string $driver) => $this->responseMediaStorage($driver));

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

    private function responseMediaStorage(string $driver): ?ResponseMediaStorage
    {
        return match ($driver) {
            'supabase' => $this->app->make(SupabaseResponseMediaStorage::class),
            'sharepoint' => $this->app->make(\App\Infrastructure\Storage\SharePointResponseMediaStorage::class),
            default => null,
        };
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // MAIL_MAILER=microsoft-graph: correo saliente desde el buzón de la app en Microsoft 365.
        \Illuminate\Support\Facades\Mail::extend('microsoft-graph', fn () => new \App\Infrastructure\Mail\MicrosoftGraphTransport(
            (string) config('services.microsoft.tenant_id'),
            (string) config('services.microsoft.client_id'),
            (string) config('services.microsoft.client_secret'),
            (string) (config('services.microsoft.mail_sender') ?: config('mail.from.address')),
        ));

        // Envíos: el límite es por persona, no por IP. Las brigadas comparten la red del lugar (una sola
        // IP para decenas de teléfonos) y un límite por IP las frenaba a todas juntas. La IP solo cuenta
        // si la petición llega sin sesión.
        // El envío público (/forms/submit) no pasa por auth:sanctum: el token se lee aquí con ese guard.
        $quien = fn (Request $request): string => ($user = $request->user('sanctum'))
            ? 'user:'.$user->getAuthIdentifier()
            : 'ip:'.($request->ip() ?? 'unknown');
        RateLimiter::for('public-form-submit', fn (Request $request) => [
            Limit::perMinute(30)->by('public-submit:'.$quien($request)),
            Limit::perMinute(20)->by('public-submit-form:'.$request->route('link_uuid').':'.$quien($request)),
        ]);
        RateLimiter::for('mobile-form-submit', fn (Request $request) => [
            Limit::perMinute(60)->by('mobile-submit:'.$quien($request)),
            Limit::perMinute(30)->by('mobile-submit-form:'.$request->input('form_id', 'unknown').':'.$quien($request)),
        ]);
        RateLimiter::for('response-export', fn (Request $request) => [
            Limit::perMinute(10)->by('response-export-user:'.($request->user()?->id ?? 'anonymous')),
            Limit::perMinute(5)->by('response-export-form:'.$request->route('id').':'.($request->user()?->id ?? 'anonymous')),
        ]);
    }
}
