<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Las cuentas eliminadas (borrado suave) se listan aparte y se pueden restaurar. */
class RestoreDeletedUserTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_lists_and_restores_a_deleted_account(): void
    {
        $super = User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]);
        $docente = User::factory()->create(['email' => 'docente@uleam.edu.ec', 'rol' => User::ROLE_PROJECT]);
        Sanctum::actingAs($super);

        $this->deleteJson("/api/users/{$docente->id}")->assertOk();
        $this->assertSoftDeleted($docente);
        $this->getJson('/api/users')->assertOk()->assertJsonMissing(['email' => 'docente@uleam.edu.ec']);
        $this->getJson('/api/users?deleted=1')->assertOk()
            ->assertJsonPath('data.0.email', 'docente@uleam.edu.ec')
            ->assertJsonPath('meta.total', 1);

        $this->postJson("/api/users/{$docente->id}/restore")->assertOk()->assertJsonPath('data.is_active', true);
        $restored = $docente->fresh();
        $this->assertNull($restored->deleted_at);
        $this->assertTrue($restored->is_active);
        $this->assertSame(User::ROLE_PROJECT, $restored->rol);
        $this->getJson('/api/users?deleted=1')->assertOk()->assertJsonPath('meta.total', 0);

        // Una cuenta que no está eliminada no se "restaura".
        $this->postJson("/api/users/{$docente->id}/restore")->assertNotFound();
    }

    public function test_admin_restores_only_roles_they_manage(): void
    {
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        $otherAdmin = User::factory()->create(['rol' => User::ROLE_ADMIN]);
        $collector->delete();
        $otherAdmin->delete();

        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_ADMIN]));
        $this->getJson('/api/users?deleted=1')->assertOk()->assertJsonPath('meta.total', 1);
        $this->postJson("/api/users/{$otherAdmin->id}/restore")->assertForbidden();
        $this->postJson("/api/users/{$collector->id}/restore")->assertOk();

        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));
        $this->getJson('/api/users?deleted=1')->assertForbidden();
    }
}
