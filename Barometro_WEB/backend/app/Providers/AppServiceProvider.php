<?php

namespace App\Providers;

use App\Application\Auth\Contracts\SupabaseAuthUserProvisioner;
use App\Application\Forms\Contracts\SupabaseFormSchemaWriter;
use App\Application\Responses\Contracts\SupabaseResponseWriter;
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
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
