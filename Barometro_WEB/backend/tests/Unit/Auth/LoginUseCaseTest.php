<?php

declare(strict_types=1);

namespace Tests\Unit\Auth;

use App\Application\Auth\Contracts\SupabaseAuthUserProvisioner;
use App\Application\Auth\DTOs\LoginDTO;
use App\Application\Auth\UseCases\LoginUseCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class LoginUseCaseTest extends TestCase
{
    use RefreshDatabase;

    private LoginUseCase $useCase;

    protected function setUp(): void
    {
        parent::setUp();

        $provisioner = $this->createMock(SupabaseAuthUserProvisioner::class);
        $provisioner->method('ensureUser');

        $this->useCase = new LoginUseCase($provisioner);
    }

    public function test_login_successful_returns_user_and_token(): void
    {
        $user = User::factory()->create([
            'email' => 'active@uleam.edu.ec',
            'password' => Hash::make('Password123!'),
            'is_active' => true,
        ]);

        $dto = new LoginDTO(email: 'active@uleam.edu.ec', password: 'Password123!');
        $response = $this->useCase->execute($dto);

        $this->assertNotEmpty($response->token);
        $this->assertEquals($user->email, $response->user->email);
    }

    public function test_login_fails_for_inactive_user(): void
    {
        User::factory()->create([
            'email' => 'inactive@uleam.edu.ec',
            'password' => Hash::make('Password123!'),
            'is_active' => false,
        ]);

        $dto = new LoginDTO(email: 'inactive@uleam.edu.ec', password: 'Password123!');

        $this->expectException(ValidationException::class);
        $this->useCase->execute($dto);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        User::factory()->create([
            'email' => 'user@uleam.edu.ec',
            'password' => Hash::make('CorrectPassword123!'),
            'is_active' => true,
        ]);

        $dto = new LoginDTO(email: 'user@uleam.edu.ec', password: 'WrongPassword!');

        $this->expectException(ValidationException::class);
        $this->useCase->execute($dto);
    }

    public function test_token_pruning_keeps_at_most_nine_tokens(): void
    {
        $user = User::factory()->create([
            'email' => 'tokens@uleam.edu.ec',
            'password' => Hash::make('Password123!'),
            'is_active' => true,
        ]);

        // Create 12 tokens
        for ($i = 0; $i < 12; $i++) {
            $user->createToken('token-' . $i);
        }

        $dto = new LoginDTO(email: 'tokens@uleam.edu.ec', password: 'Password123!');
        $this->useCase->execute($dto);

        // After login, 1 new token created, old ones pruned to max 9 => total <= 10
        $this->assertLessThanOrEqual(10, $user->tokens()->count());
    }
}
