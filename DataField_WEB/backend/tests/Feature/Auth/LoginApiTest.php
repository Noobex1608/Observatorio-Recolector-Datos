<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LoginApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_login_returns_json_token_structure(): void
    {
        $user = User::factory()->create([
            'email' => 'login_api@uleam.edu.ec',
            'password' => Hash::make('Secret123!'),
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'login_api@uleam.edu.ec',
            'password' => 'Secret123!',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'token',
                'user' => ['id', 'email', 'name', 'rol'],
            ]);
    }

    public function test_api_login_rate_limiting_throttles_after_five_failed_attempts(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', [
                'email' => 'bruteforce@uleam.edu.ec',
                'password' => 'WrongPass',
            ]);
        }

        $response = $this->postJson('/api/login', [
            'email' => 'bruteforce@uleam.edu.ec',
            'password' => 'WrongPass',
        ]);

        $response->assertStatus(429); // 429 Too Many Requests
    }
}
