<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * OWASP ZAP marcó /api/login como inyección SQL booleana. La contraseña nunca llega a SQL (se compara con
 * Hash::check) y la diferencia que vio ZAP venía del límite de 5 intentos por minuto (401 vs 429).
 */
class SqlInjectionRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_boolean_sql_payloads_get_the_same_answer_as_a_wrong_password(): void
    {
        User::factory()->create(['email' => 'zap@example.com', 'password' => bcrypt('clave-correcta-123')]);
        $answers = [];
        foreach (["zap-password", "zap-password' AND '1'='1' -- ", "zap-password' AND '1'='2' -- "] as $password) {
            RateLimiter::clear('');
            $this->app['cache']->flush();
            $response = $this->postJson('/api/login', ['email' => 'zap@example.com', 'password' => $password]);
            $answers[] = [$response->status(), $response->json('message')];
        }

        $this->assertCount(1, array_unique(array_map('json_encode', $answers)), 'Las tres respuestas deben ser idénticas');
        $this->assertNotSame(200, $answers[0][0]);
    }

    public function test_email_payloads_do_not_alter_the_lookup(): void
    {
        User::factory()->create(['email' => 'zap@example.com', 'password' => bcrypt('clave-correcta-123')]);

        $this->postJson('/api/login', ['email' => "zap@example.com' OR '1'='1", 'password' => 'clave-correcta-123'])
            ->assertStatus(422);
        $this->app['cache']->flush();
        $this->postJson('/api/login', ['email' => 'zap@example.com', 'password' => 'clave-correcta-123'])->assertOk();
    }

    public function test_repeated_attempts_are_rate_limited(): void
    {
        foreach (range(1, 5) as $_) {
            $this->postJson('/api/login', ['email' => 'nadie@example.com', 'password' => 'x']);
        }
        $this->postJson('/api/login', ['email' => 'nadie@example.com', 'password' => 'x'])->assertStatus(429);
    }
}
