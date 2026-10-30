<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Los archivos públicos (avatares y storage) solo se comparten por CORS con los orígenes permitidos. */
class PublicFilesCorsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cors.allowed_origins' => ['https://app.uleam.test']]);
    }

    public function test_avatar_cors_only_allows_configured_origins(): void
    {
        $this->get('/api/avatars/no-existe.png', ['Origin' => 'https://app.uleam.test'])
            ->assertNotFound()
            ->assertHeader('Access-Control-Allow-Origin', 'https://app.uleam.test');

        // A un origen ajeno nunca se le devuelve su propio origen ni el comodín: el navegador bloquea la lectura.
        $foreign = $this->get('/api/avatars/no-existe.png', ['Origin' => 'https://sitio-ajeno.example'])->assertNotFound();
        $this->assertNotContains($foreign->headers->get('Access-Control-Allow-Origin'), ['*', 'https://sitio-ajeno.example']);
    }

    public function test_existing_avatar_is_served_with_cache_and_resource_policy(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('avatars/foto.png', 'png');

        $this->get('/api/avatars/foto.png', ['Origin' => 'https://app.uleam.test'])
            ->assertOk()
            ->assertHeader('Cross-Origin-Resource-Policy', 'cross-origin')
            ->assertHeader('Access-Control-Allow-Origin', 'https://app.uleam.test');
    }
}
