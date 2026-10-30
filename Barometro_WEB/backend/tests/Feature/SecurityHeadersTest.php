<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Cabeceras y respuestas de error señaladas por OWASP ZAP. */
class SecurityHeadersTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_responses_carry_security_headers_without_php_version(): void
    {
        $response = $this->getJson('/api/health')->assertOk();

        $response->assertHeaderMissing('X-Powered-By')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('Cross-Origin-Opener-Policy', 'same-origin')
            ->assertHeader('Cross-Origin-Resource-Policy', 'same-origin')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        $this->assertStringContainsString('camera=()', $response->headers->get('Permissions-Policy'));
    }

    public function test_unknown_routes_and_malformed_ids_answer_404_in_json(): void
    {
        $this->get('/api/no-existe')->assertNotFound()->assertHeader('Content-Type', 'application/json');
        $this->get('/no-existe')->assertNotFound()->assertHeader('Content-Type', 'application/json');
        $this->get('/api/forms/fetch/7023344718575334843')->assertNotFound()
            ->assertJsonPath('message', 'Recurso no encontrado.');
    }

    public function test_root_answers_json_instead_of_a_server_error(): void
    {
        $this->get('/')->assertOk()->assertJsonPath('name', 'Observatorio ULEAM Forms API');
    }

    public function test_docs_page_uses_local_assets_and_a_strict_csp(): void
    {
        $response = $this->get('/api/docs')->assertOk();

        $this->assertStringNotContainsString('unpkg.com', $response->getContent());
        $this->assertStringContainsString('swagger-init.js', $response->getContent());
        $this->assertStringContainsString("script-src 'self'", $response->headers->get('Content-Security-Policy'));
        $response->assertHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }

    public function test_public_files_stay_loadable_from_the_web_and_app(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('avatars/foto.png', 'png');

        $this->get('/api/avatars/foto.png')->assertOk()->assertHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}
