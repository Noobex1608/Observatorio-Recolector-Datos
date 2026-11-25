<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\AccountInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Microsoft 365 para internos (ULEAM) y correo de confirmación para externos. */
class MicrosoftAuthAndInvitationTest extends TestCase
{
    use RefreshDatabase;

    private const TENANT = '11111111-2222-3333-4444-555555555555';

    private const CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    private const RETURN_URL = 'http://localhost:4200/auth/microsoft';

    private string $pendingIdToken = '';

    private bool $tokenEndpointFaked = false;

    /** URL del último callback de signInWithMicrosoft, para repetirlo como lo hace el navegador. */
    private string $lastCallbackUrl = '';

    private function enableMicrosoft(): void
    {
        config([
            'services.microsoft.client_id' => self::CLIENT,
            'services.microsoft.client_secret' => 'secreto-de-prueba',
            'services.microsoft.tenant_id' => self::TENANT,
            'services.microsoft.redirect_uri' => 'http://localhost:8000/api/auth/microsoft/callback',
            'cors.allowed_origins' => ['http://localhost:4200', 'http://localhost:4201'],
        ]);
    }

    private function idToken(array $claims): string
    {
        $encode = fn (array $data) => rtrim(strtr(base64_encode(json_encode($data)), '+/', '-_'), '=');

        return $encode(['alg' => 'RS256', 'typ' => 'JWT']).'.'.$encode($claims).'.firma';
    }

    /** Recorre redirect, Microsoft (simulado) y callback; devuelve la URL final hacia el frontend. */
    private function signInWithMicrosoft(string $email, array $overrides = []): string
    {
        $redirect = $this->get('/api/auth/microsoft/redirect?return='.urlencode(self::RETURN_URL));
        $redirect->assertRedirect();
        parse_str((string) parse_url($redirect->headers->get('Location'), PHP_URL_QUERY), $authorize);
        $flow = Cache::get("ms-oidc:{$authorize['state']}");

        // Http::fake acumula respuestas: la respuesta se arma en cada petición con el id_token pendiente.
        $this->pendingIdToken = $this->idToken(array_merge([
            'aud' => self::CLIENT, 'tid' => self::TENANT,
            'iss' => 'https://login.microsoftonline.com/'.self::TENANT.'/v2.0',
            'nonce' => $flow['nonce'], 'exp' => time() + 3600, 'nbf' => time() - 10,
            'oid' => 'oid-123', 'preferred_username' => $email, 'name' => 'Persona ULEAM',
        ], $overrides));
        if (! $this->tokenEndpointFaked) {
            $this->tokenEndpointFaked = true;
            Http::fake(['login.microsoftonline.com/*/oauth2/v2.0/token' => fn () => Http::response([
                'id_token' => $this->pendingIdToken, 'access_token' => 'x', 'token_type' => 'Bearer',
            ])]);
        }

        $this->lastCallbackUrl = '/api/auth/microsoft/callback?code=codigo&state='.$authorize['state'];

        return (string) $this->get($this->lastCallbackUrl)->headers->get('Location');
    }

    public function test_microsoft_is_disabled_until_configured(): void
    {
        $this->getJson('/api/auth/providers')->assertOk()
            ->assertJsonPath('microsoft', false)
            ->assertJsonPath('internal_domains', ['uleam.edu.ec', 'live.uleam.edu.ec', 'dn.uleam.edu.ec']);
        $this->get('/api/auth/microsoft/redirect?return='.urlencode(self::RETURN_URL))->assertNotFound();
    }

    public function test_redirect_uses_pkce_and_only_returns_to_allowed_frontends(): void
    {
        $this->enableMicrosoft();
        $location = (string) $this->get('/api/auth/microsoft/redirect?return='.urlencode(self::RETURN_URL))->headers->get('Location');

        $this->assertStringStartsWith('https://login.microsoftonline.com/'.self::TENANT.'/oauth2/v2.0/authorize?', $location);
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
        $this->assertSame(self::CLIENT, $query['client_id']);
        $this->assertSame('S256', $query['code_challenge_method']);
        $this->assertArrayHasKey('nonce', $query);

        $this->get('/api/auth/microsoft/redirect?return='.urlencode('https://atacante.example/robar'))->assertStatus(422);
        $this->get('/api/auth/microsoft/redirect?return='.urlencode(self::RETURN_URL.'?x=1'))->assertStatus(422);
    }

    public function test_internal_user_signs_in_with_one_time_code(): void
    {
        $this->enableMicrosoft();
        $user = User::factory()->create(['email' => 'docente@uleam.edu.ec', 'rol' => User::ROLE_PROJECT,
            'email_verified_at' => null, 'must_change_password' => true]);

        $location = $this->signInWithMicrosoft('Docente@ULEAM.edu.ec');
        $this->assertStringStartsWith(self::RETURN_URL.'?code=', $location);
        parse_str((string) parse_url($location, PHP_URL_QUERY), $back);

        $this->postJson('/api/auth/microsoft/exchange', ['code' => $back['code']])->assertOk()
            ->assertJsonPath('user.email', 'docente@uleam.edu.ec')
            ->assertJsonPath('user.must_change_password', false)
            ->assertJsonStructure(['token']);
        $this->assertNotNull($user->fresh()->email_verified_at);
        // El código es de un solo uso.
        $this->postJson('/api/auth/microsoft/exchange', ['code' => $back['code']])->assertStatus(401);
    }

    public function test_repeated_callback_from_the_browser_returns_the_same_result_instead_of_expired(): void
    {
        $this->enableMicrosoft();
        User::factory()->create(['email' => 'docente@uleam.edu.ec', 'rol' => User::ROLE_PROJECT]);

        $first = $this->signInWithMicrosoft('docente@uleam.edu.ec');
        $this->assertStringStartsWith(self::RETURN_URL.'?code=', $first);
        // Chrome en Android repite el callback con la misma URL: recibe el mismo resultado, no «expired».
        parse_str((string) parse_url($first, PHP_URL_QUERY), $back);
        $callbackUrl = $this->lastCallbackUrl;
        $this->assertSame($first, (string) $this->get($callbackUrl)->headers->get('Location'));

        // El código de inicio sigue siendo de un solo uso.
        $this->postJson('/api/auth/microsoft/exchange', ['code' => $back['code']])->assertOk();
        $this->postJson('/api/auth/microsoft/exchange', ['code' => $back['code']])->assertStatus(401);

        // Mismo state con otro código de Microsoft: no se reutiliza el resultado.
        $otherCode = str_replace('code=codigo', 'code=otro', $callbackUrl);
        $this->assertStringEndsWith('error=expired', (string) $this->get($otherCode)->headers->get('Location'));
    }

    public function test_callback_rejects_external_unknown_inactive_and_tampered_logins(): void
    {
        $this->enableMicrosoft();
        User::factory()->create(['email' => 'inactivo@live.uleam.edu.ec', 'is_active' => false]);

        $this->assertStringEndsWith('error=not_institutional', $this->signInWithMicrosoft('alguien@gmail.com'));
        $this->assertStringEndsWith('error=inactive', $this->signInWithMicrosoft('inactivo@live.uleam.edu.ec'));
        $this->assertStringEndsWith('error=failed', $this->signInWithMicrosoft('nuevo@uleam.edu.ec', ['nonce' => 'otro']));
        $this->assertStringEndsWith('error=failed', $this->signInWithMicrosoft('nuevo@uleam.edu.ec', ['tid' => 'otro-tenant']));
        $this->assertStringEndsWith('error=failed', $this->signInWithMicrosoft('nuevo@uleam.edu.ec', ['aud' => 'otra-app']));
        $this->assertStringEndsWith('error=expired', (string) $this->get('/api/auth/microsoft/callback?code=x&state=desconocido')->headers->get('Location'));
    }

    public function test_unregistered_uleam_person_creates_an_access_request_that_an_admin_approves(): void
    {
        $this->enableMicrosoft();

        $this->assertStringEndsWith('error=pending_approval', $this->signInWithMicrosoft('nueva@dn.uleam.edu.ec'));
        $request = User::where('email', 'nueva@dn.uleam.edu.ec')->firstOrFail();
        $this->assertSame(User::ACCESS_PENDING, $request->access_request_status);
        $this->assertFalse($request->is_active);
        $this->assertSame('Persona ULEAM', $request->name);
        // Volver a intentar no duplica la solicitud.
        $this->assertStringEndsWith('error=pending_approval', $this->signInWithMicrosoft('nueva@dn.uleam.edu.ec'));
        $this->assertSame(1, User::where('email', 'nueva@dn.uleam.edu.ec')->count());

        $admin = User::factory()->create(['rol' => User::ROLE_ADMIN, 'email' => 'jefe@uleam.edu.ec']);
        Sanctum::actingAs($admin);
        $this->getJson('/api/users/access-requests')->assertOk()
            ->assertJsonPath('pending_count', 1)->assertJsonPath('data.0.email', 'nueva@dn.uleam.edu.ec');
        // La bandeja es aparte: la solicitud no aparece en la lista de usuarios ni se puede activar a mano.
        $this->assertNotContains('nueva@dn.uleam.edu.ec', collect($this->getJson('/api/users')->json('data'))->pluck('email'));
        $this->patchJson("/api/users/{$request->id}/status", ['is_active' => true])->assertStatus(400);
        // Un ADMIN no puede otorgar roles de administración.
        $this->postJson("/api/users/access-requests/{$request->id}/approve", ['rol' => User::ROLE_ADMIN])->assertForbidden();
        $this->postJson("/api/users/access-requests/{$request->id}/approve", ['rol' => User::ROLE_PROJECT])->assertOk();

        $approved = $request->fresh();
        $this->assertTrue($approved->is_active);
        $this->assertNull($approved->access_request_status);
        $this->assertSame(User::ROLE_PROJECT, $approved->rol);

        $this->app['auth']->forgetGuards();
        $this->assertStringStartsWith(self::RETURN_URL.'?code=', $this->signInWithMicrosoft('nueva@dn.uleam.edu.ec'));
    }

    public function test_rejected_request_keeps_the_account_without_access(): void
    {
        $this->enableMicrosoft();
        $this->signInWithMicrosoft('rechazo@live.uleam.edu.ec');
        $request = User::where('email', 'rechazo@live.uleam.edu.ec')->firstOrFail();

        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));
        $this->postJson("/api/users/access-requests/{$request->id}/reject")->assertForbidden();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]));
        $this->postJson("/api/users/access-requests/{$request->id}/reject")->assertOk();
        $this->getJson('/api/users/access-requests?status=REJECTED')->assertOk()->assertJsonPath('data.0.email', 'rechazo@live.uleam.edu.ec');

        $this->app['auth']->forgetGuards();
        $this->assertStringEndsWith('error=rejected', $this->signInWithMicrosoft('rechazo@live.uleam.edu.ec'));
    }

    public function test_admin_approves_or_rejects_several_requests_at_once(): void
    {
        $pending = fn (string $email) => User::factory()->create([
            'email' => $email, 'rol' => User::ROLE_USER, 'is_active' => false,
            'access_request_status' => User::ACCESS_PENDING, 'access_requested_at' => now(),
        ]);
        [$a, $b, $c, $d] = [$pending('a@uleam.edu.ec'), $pending('b@uleam.edu.ec'), $pending('c@uleam.edu.ec'), $pending('d@uleam.edu.ec')];
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_ADMIN, 'email' => 'jefe@uleam.edu.ec']));

        // Todo o nada: un rol que el ADMIN no puede asignar no aprueba a nadie.
        $this->postJson('/api/users/access-requests/approve', ['items' => [
            ['id' => $a->id, 'rol' => User::ROLE_USER], ['id' => $b->id, 'rol' => User::ROLE_ADMIN],
        ]])->assertForbidden();
        $this->assertSame(User::ACCESS_PENDING, $a->fresh()->access_request_status);

        $this->postJson('/api/users/access-requests/approve', ['items' => [
            ['id' => $a->id, 'rol' => User::ROLE_USER], ['id' => $b->id, 'rol' => User::ROLE_SUPERVISOR],
        ]])->assertOk()->assertJsonPath('approved', 2);
        $this->assertSame([User::ROLE_USER, true, null], [$a->fresh()->rol, $a->fresh()->is_active, $a->fresh()->access_request_status]);
        $this->assertSame(User::ROLE_SUPERVISOR, $b->fresh()->rol);

        // Ya resueltas: se pide recargar.
        $this->postJson('/api/users/access-requests/approve', ['items' => [['id' => $a->id, 'rol' => User::ROLE_USER]]])->assertStatus(422);

        $this->postJson('/api/users/access-requests/reject', ['ids' => [$c->id, $d->id]])->assertOk()->assertJsonPath('rejected', 2);
        $this->assertSame([User::ACCESS_REJECTED, false], [$c->fresh()->access_request_status, $c->fresh()->is_active]);

        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));
        $this->postJson('/api/users/access-requests/reject', ['ids' => [$d->id]])->assertForbidden();
    }

    public function test_account_is_bound_to_the_microsoft_identity(): void
    {
        $this->enableMicrosoft();
        $user = User::factory()->create(['email' => 'docente@uleam.edu.ec', 'rol' => User::ROLE_PROJECT]);

        $this->assertStringStartsWith(self::RETURN_URL.'?code=', $this->signInWithMicrosoft('docente@uleam.edu.ec'));
        $this->assertSame('oid-123', $user->fresh()->microsoft_oid);

        // Otra persona de Microsoft con el mismo correo (correo reasignado) no hereda la cuenta.
        $this->assertStringEndsWith('error=account_mismatch', $this->signInWithMicrosoft('docente@uleam.edu.ec', ['oid' => 'otra-persona']));
        // Si la persona cambia de correo en Microsoft, sigue entrando a su misma cuenta por su oid.
        $this->assertStringStartsWith(self::RETURN_URL.'?code=', $this->signInWithMicrosoft('docente.nuevo@uleam.edu.ec'));
        $this->assertSame(1, User::where('microsoft_oid', 'oid-123')->count());
    }

    public function test_admin_resets_a_wrong_microsoft_link_from_the_app(): void
    {
        $this->enableMicrosoft();
        $user = User::factory()->create(['email' => 'docente@uleam.edu.ec', 'rol' => User::ROLE_PROJECT, 'microsoft_oid' => 'identidad-equivocada']);
        $user->createToken('vieja');
        $this->assertStringEndsWith('error=account_mismatch', $this->signInWithMicrosoft('docente@uleam.edu.ec'));

        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));
        $this->postJson("/api/users/{$user->id}/microsoft/unlink")->assertForbidden();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_ADMIN, 'email' => 'jefe@uleam.edu.ec']));
        $this->getJson('/api/users')->assertOk()->assertJsonFragment(['email' => 'docente@uleam.edu.ec', 'microsoft_linked' => true]);
        $this->postJson("/api/users/{$user->id}/microsoft/unlink")->assertOk()->assertJsonPath('data.microsoft_linked', false);
        $this->postJson("/api/users/{$user->id}/microsoft/unlink")->assertUnprocessable();
        $this->assertNull($user->fresh()->microsoft_oid);
        $this->assertSame(0, $user->tokens()->count());

        // El siguiente inicio con Microsoft vuelve a vincular la cuenta a quien entra.
        $this->app['auth']->forgetGuards();
        $this->assertStringStartsWith(self::RETURN_URL.'?code=', $this->signInWithMicrosoft('docente@uleam.edu.ec'));
        $this->assertSame('oid-123', $user->fresh()->microsoft_oid);
    }

    public function test_external_users_can_only_be_collectors_or_supervisors(): void
    {
        Notification::fake();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]));

        $this->postJson('/api/users', ['name' => 'Externa', 'email' => 'externa@gmail.com', 'rol' => User::ROLE_PROJECT])
            ->assertStatus(422)->assertJsonValidationErrors('rol');
        $this->postJson('/api/users', ['name' => 'Externa', 'email' => 'externa@gmail.com', 'rol' => User::ROLE_SUPERVISOR])
            ->assertCreated();
        $external = User::where('email', 'externa@gmail.com')->firstOrFail();

        $this->patchJson("/api/users/{$external->id}/role", ['rol' => User::ROLE_ADMIN])->assertStatus(422);
        $this->putJson("/api/users/{$external->id}", ['rol' => User::ROLE_PROJECT])->assertStatus(422);
        $this->patchJson("/api/users/{$external->id}/role", ['rol' => User::ROLE_USER])->assertOk();

        // Un docente con rol PROJECT no puede pasar a un correo externo conservando ese rol.
        $leader = User::factory()->create(['email' => 'lider@uleam.edu.ec', 'rol' => User::ROLE_PROJECT]);
        $this->putJson("/api/users/{$leader->id}", ['email' => 'lider@gmail.com'])->assertStatus(422);
    }

    public function test_admin_manages_operational_roles_but_not_administrators(): void
    {
        Notification::fake();
        $this->enableMicrosoft();
        $super = User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN, 'email' => 'super@uleam.edu.ec']);
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_ADMIN, 'email' => 'admin@uleam.edu.ec']));

        $this->postJson('/api/users', ['name' => 'Líder', 'email' => 'lider@uleam.edu.ec', 'rol' => User::ROLE_PROJECT])->assertCreated();
        $this->postJson('/api/users', ['name' => 'Otro admin', 'email' => 'otro@uleam.edu.ec', 'rol' => User::ROLE_ADMIN])->assertForbidden();
        $this->putJson("/api/users/{$super->id}", ['name' => 'Cambio'])->assertForbidden();
        $this->assertNotContains('super@uleam.edu.ec', collect($this->getJson('/api/users')->json('data'))->pluck('email'));
    }

    public function test_recreating_a_deleted_email_reuses_the_account_without_its_old_access(): void
    {
        Notification::fake();
        $super = User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]);
        $old = User::factory()->create(['email' => 'steven@gmail.com', 'rol' => User::ROLE_PROJECT, 'microsoft_oid' => 'viejo']);
        $project = \App\Models\Project::create(['name' => 'Proyecto anterior']);
        $project->leaders()->attach($old->id);
        Sanctum::actingAs($super);
        $this->deleteJson("/api/users/{$old->id}")->assertOk();

        $this->postJson('/api/users', ['name' => 'Steven', 'email' => 'Steven@gmail.com', 'rol' => User::ROLE_USER])
            ->assertCreated()->assertJsonPath('data.id', $old->id)->assertJsonPath('data.rol', User::ROLE_USER);

        $restored = $old->fresh();
        $this->assertFalse($restored->trashed());
        $this->assertSame('Steven', $restored->name);
        $this->assertNull($restored->microsoft_oid);
        $this->assertNull($restored->email_verified_at);
        $this->assertSame(0, $restored->ledProjects()->count());
        Notification::assertSentTo($restored, AccountInvitationNotification::class);

        // Un correo activo sigue sin poder repetirse.
        $this->postJson('/api/users', ['name' => 'Otro', 'email' => 'Steven@gmail.com', 'rol' => User::ROLE_USER])->assertStatus(422);
        $this->postJson('/api/users', ['name' => 'Otro', 'email' => 'steven@gmail.com', 'rol' => User::ROLE_USER])->assertStatus(409);
    }

    public function test_internal_accounts_cannot_use_password_once_microsoft_is_configured(): void
    {
        User::factory()->create(['email' => 'docente@uleam.edu.ec', 'password' => Hash::make('Clave-Segura-123')]);
        User::factory()->create(['email' => 'admin@uleam.edu.ec', 'rol' => User::ROLE_SUPER_ADMIN, 'password' => Hash::make('Clave-Segura-123')]);
        User::factory()->create(['email' => 'externo@gmail.com', 'password' => Hash::make('Clave-Segura-123')]);

        $this->postJson('/api/login', ['email' => 'docente@uleam.edu.ec', 'password' => 'Clave-Segura-123'])->assertOk();

        $this->enableMicrosoft();
        $this->postJson('/api/login', ['email' => 'docente@uleam.edu.ec', 'password' => 'Clave-Segura-123'])
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->postJson('/api/login', ['email' => 'admin@uleam.edu.ec', 'password' => 'Clave-Segura-123'])->assertOk();
        $this->postJson('/api/login', ['email' => 'EXTERNO@gmail.com', 'password' => 'Clave-Segura-123'])->assertOk();
    }

    public function test_only_external_users_receive_confirmation_email_and_create_their_password(): void
    {
        Notification::fake();
        $this->enableMicrosoft();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]));

        $this->postJson('/api/users', ['name' => 'Docente', 'email' => 'docente@uleam.edu.ec', 'rol' => User::ROLE_PROJECT])
            ->assertCreated()->assertJsonPath('data.is_institutional', true)->assertJsonPath('data.invitation_pending', false);
        $this->postJson('/api/users', ['name' => 'Externa', 'email' => 'externa@gmail.com', 'rol' => User::ROLE_USER, 'password' => 'ignorada-123'])
            ->assertCreated()->assertJsonPath('data.is_institutional', false)->assertJsonPath('data.invitation_pending', true);

        $internal = User::where('email', 'docente@uleam.edu.ec')->first();
        $external = User::where('email', 'externa@gmail.com')->first();
        Notification::assertNotSentTo($internal, AccountInvitationNotification::class);
        $this->assertFalse(Hash::check('ignorada-123', $external->password));

        $url = null;
        Notification::assertSentTo($external, AccountInvitationNotification::class, function ($notification) use ($external, &$url) {
            $url = $notification->activationUrl($external);

            return str_starts_with($url, 'http://localhost:4200/auth/activar?');
        });
        parse_str((string) parse_url($url, PHP_URL_QUERY), $link);

        $this->postJson('/api/auth/activate', ['email' => $link['email'], 'token' => $link['token'],
            'password' => 'corta', 'password_confirmation' => 'corta'])->assertStatus(422);
        $this->postJson('/api/auth/activate', ['email' => $link['email'], 'token' => $link['token'],
            'password' => 'Nueva-Clave-2026', 'password_confirmation' => 'Nueva-Clave-2026'])->assertOk();
        $this->assertNotNull($external->fresh()->email_verified_at);
        $this->postJson('/api/auth/activate', ['email' => $link['email'], 'token' => $link['token'],
            'password' => 'Otra-Clave-2026', 'password_confirmation' => 'Otra-Clave-2026'])->assertStatus(422);

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/login', ['email' => 'externa@gmail.com', 'password' => 'Nueva-Clave-2026'])->assertOk();
    }

    public function test_internal_user_needs_password_while_microsoft_is_not_configured(): void
    {
        Notification::fake();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]));

        $this->postJson('/api/users', ['name' => 'Docente', 'email' => 'docente@uleam.edu.ec'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/users', ['name' => 'Docente', 'email' => 'docente@uleam.edu.ec', 'password' => 'Clave-Temporal-1'])
            ->assertCreated();
        Notification::assertNothingSent();
    }

    public function test_admin_can_resend_invitation_only_to_pending_external_users(): void
    {
        Notification::fake();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]));
        $pending = User::factory()->create(['email' => 'pendiente@gmail.com', 'email_verified_at' => null]);
        $confirmed = User::factory()->create(['email' => 'lista@gmail.com', 'email_verified_at' => now()]);
        $internal = User::factory()->create(['email' => 'docente@uleam.edu.ec', 'email_verified_at' => null]);

        $this->postJson("/api/users/{$pending->id}/invitation")->assertOk();
        $this->postJson("/api/users/{$confirmed->id}/invitation")->assertStatus(422);
        $this->postJson("/api/users/{$internal->id}/invitation")->assertStatus(422);
        Notification::assertSentToTimes($pending, AccountInvitationNotification::class, 1);

        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));
        $this->postJson("/api/users/{$pending->id}/invitation")->assertForbidden();
    }

    public function test_external_user_must_change_password_set_by_an_admin(): void
    {
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]));
        $external = User::factory()->create(['email' => 'externa@gmail.com', 'rol' => User::ROLE_USER]);
        $internal = User::factory()->create(['email' => 'docente@uleam.edu.ec', 'rol' => User::ROLE_USER]);

        $this->putJson("/api/users/{$external->id}", ['password' => 'Temporal-12345'])->assertOk();
        $this->putJson("/api/users/{$internal->id}", ['password' => 'Temporal-12345'])->assertOk();

        $this->assertTrue($external->fresh()->must_change_password);
        $this->assertFalse($internal->fresh()->must_change_password);
    }

    public function test_mail_is_sent_through_microsoft_graph_from_the_app_mailbox(): void
    {
        $this->enableMicrosoft();
        config(['services.microsoft.mail_sender' => 'datafield@uleam.edu.ec', 'mail.default' => 'microsoft-graph']);
        Http::fake([
            'login.microsoftonline.com/*' => Http::response(['access_token' => 'token-graph', 'expires_in' => 3600]),
            'graph.microsoft.com/*' => Http::response(null, 202),
        ]);

        Mail::html('<p>Hola</p>', fn ($message) => $message->to('externa@gmail.com', 'Externa')->subject('Prueba'));

        Http::assertSent(fn ($request) => $request->url() === 'https://graph.microsoft.com/v1.0/users/datafield%40uleam.edu.ec/sendMail'
            && $request->hasHeader('Authorization', 'Bearer token-graph')
            && $request['message']['subject'] === 'Prueba'
            && $request['message']['toRecipients'][0]['emailAddress']['address'] === 'externa@gmail.com');
    }
}
