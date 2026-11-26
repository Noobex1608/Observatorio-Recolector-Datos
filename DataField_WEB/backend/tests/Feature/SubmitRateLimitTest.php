<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Los envíos se limitan por persona: una brigada detrás de una sola IP no se frena entre sí. */
class SubmitRateLimitTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function keys(string $limiter, ?User $user, string $ip = '203.0.113.7'): array
    {
        if ($user) {
            Sanctum::actingAs($user);
        } else {
            $this->app['auth']->forgetGuards();
        }
        $request = Request::create('/api/mobile/submit', 'POST', ['form_id' => 'f1'], server: ['REMOTE_ADDR' => $ip]);
        $request->setUserResolver(fn ($guard = null) => $this->app['auth']->guard($guard)->user());

        return array_map(fn ($limit) => $limit->key, RateLimiter::limiter($limiter)($request));
    }

    public function test_mobile_and_public_submits_are_limited_per_user_not_per_ip(): void
    {
        [$a, $b] = User::factory()->count(2)->create();

        foreach (['mobile-form-submit', 'public-form-submit'] as $limiter) {
            $keysA = $this->keys($limiter, $a);
            $keysB = $this->keys($limiter, $b);
            $this->assertEmpty(array_intersect($keysA, $keysB), "$limiter: dos personas con la misma IP no comparten cupo");
            foreach ($keysA as $key) {
                $this->assertStringContainsString('user:'.$a->id, $key);
                $this->assertStringNotContainsString('203.0.113.7', $key);
            }
        }
    }

    public function test_requests_without_session_fall_back_to_the_ip(): void
    {
        foreach ($this->keys('public-form-submit', null) as $key) {
            $this->assertStringContainsString('ip:203.0.113.7', $key);
        }
    }
}
