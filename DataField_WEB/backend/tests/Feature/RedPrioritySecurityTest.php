<?php

namespace Tests\Feature;

use App\Jobs\SyncFormResponseToSupabase;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\ResponseSyncQueue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RedPrioritySecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // La cola de sincronización con Supabase debe existir sin depender del .env local.
        config(['services.supabase.response_sync_enabled' => true]);
        Bus::fake([SyncFormResponseToSupabase::class]);
    }

    private function campaign(): array
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        $project = Project::create(['name' => 'Campaña aislada']);
        $project->leaders()->attach($owner);
        $form = Form::create(['title' => 'Instrumento', 'user_id' => $owner->id, 'project_id' => $project->id,
            'state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid(), 'instrument_locked' => true,
            'consent_text' => 'Acepto participar voluntariamente en esta investigación.']);
        $q = $form->questions()->create(['type' => 'TEXT', 'label' => 'Respuesta', 'required' => true, 'order' => 1]);
        $form->shares()->create(['user_id' => $collector->id, 'role' => 'RECOLECTOR', 'target_responses' => 1]);
        $payload = ['form_id' => $form->id, 'client_submission_id' => (string) Str::uuid(),
            'data' => [$q->id => 'Dato de prueba', '_consentimiento_aceptado' => true]];

        return [$form, $owner, $collector, $payload, $q];
    }

    public function test_unassigned_and_revoked_collectors_cannot_submit_or_create_outbox(): void
    {
        [$form, , $collector, $payload] = $this->campaign();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));
        $this->postJson('/api/mobile/submit', $payload)->assertForbidden();
        $form->shares()->delete();
        Sanctum::actingAs($collector);
        $this->postJson('/api/mobile/submit', $payload)->assertForbidden();
        $this->assertDatabaseCount('form_responses', 0);
        $this->assertDatabaseCount('response_sync_queue', 0);
    }

    public function test_schema_is_projected_and_collector_cannot_read_global_data(): void
    {
        [$form, $owner, $collector] = $this->campaign();
        Sanctum::actingAs($collector);
        $this->getJson('/api/forms/'.$form->id)->assertOk()->assertJsonMissingPath('shares')
            ->assertJsonMissingPath('owner')->assertJsonMissingPath('project');
        foreach (['responses', 'stats', 'export', 'shares'] as $action) {
            $this->getJson("/api/forms/{$form->id}/{$action}")->assertForbidden();
        }
        $this->postJson("/api/forms/{$form->id}/log-export")->assertForbidden();
        Sanctum::actingAs($owner);
        $this->getJson("/api/forms/{$form->id}/responses")->assertOk();
    }

    public function test_ten_retries_have_one_effect_and_changed_payload_conflicts(): void
    {
        [$form, , $collector, $payload, $q] = $this->campaign();
        Sanctum::actingAs($collector);
        $id = $this->postJson('/api/mobile/submit', $payload)->assertCreated()->json('id');
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/mobile/submit', $payload)->assertCreated()->assertJsonPath('id', $id);
        }
        $payload['data'][$q->id] = 'Cambio posterior';
        $this->postJson('/api/mobile/submit', $payload)->assertStatus(409);
        $this->assertDatabaseCount('form_responses', 1);
        $this->assertDatabaseCount('response_sync_queue', 1);
        $saved = FormResponse::findOrFail($id);
        $this->assertSame($collector->id, $saved->user_id);
        $this->assertSame($form->consent_text, $saved->consent_evidence['text']);
        $this->assertSame(hash('sha256', $form->consent_text), $saved->consent_evidence['sha256']);
        $this->assertSame($q->label, $saved->instrument_snapshot['questions'][0]['label']);
    }

    public function test_outbox_failure_rolls_back_response(): void
    {
        [, , $collector, $payload] = $this->campaign();
        Sanctum::actingAs($collector);
        ResponseSyncQueue::creating(fn () => throw new \RuntimeException('Simulated outbox failure'));
        try {
            $this->postJson('/api/mobile/submit', $payload)->assertStatus(500);
            $this->assertDatabaseCount('form_responses', 0);
        } finally {
            ResponseSyncQueue::flushEventListeners();
        }
    }

    public function test_public_qr_remains_anonymous_but_invalid_bearer_cannot_downgrade(): void
    {
        [$form, , , $payload] = $this->campaign();
        $this->withToken('invalid-token')->postJson('/api/forms/submit/'.$form->link_uuid, $payload)->assertUnauthorized();
        $this->flushHeaders();
        Auth::forgetGuards();
        $id = $this->postJson('/api/forms/submit/'.$form->link_uuid, $payload)->assertCreated()->json('id');
        $this->assertNull(FormResponse::find($id)->user_id);
    }

    public function test_missing_consent_or_submission_id_is_rejected(): void
    {
        [, , $collector, $payload] = $this->campaign();
        Sanctum::actingAs($collector);
        unset($payload['data']['_consentimiento_aceptado']);
        $this->postJson('/api/mobile/submit', $payload)->assertStatus(422);
        $payload['data']['_consentimiento_aceptado'] = true;
        unset($payload['client_submission_id']);
        $this->postJson('/api/mobile/submit', $payload)->assertStatus(422);
        $this->assertDatabaseCount('form_responses', 0);
    }

    public function test_archived_instrument_cannot_be_changed_but_can_be_cloned(): void
    {
        [$form, $owner, , , $q] = $this->campaign();
        $form->update(['state' => 'ARCHIVED']);
        Sanctum::actingAs($owner);
        $this->putJson('/api/forms/questions/'.$q->id, ['label' => 'Otra pregunta'])->assertStatus(409);
        $this->deleteJson('/api/forms/questions/'.$q->id)->assertStatus(409);
        $this->putJson('/api/forms/'.$form->id, ['consent_text' => 'Consentimiento distinto'])->assertStatus(409);
        $clone = $this->postJson('/api/forms/'.$form->id.'/clone')->assertCreated();
        $this->assertNotEquals($form->id, $clone->json('id'));
        $this->assertFalse(Form::find($clone->json('id'))->instrument_locked);
        $this->assertSame('Respuesta', $q->fresh()->label);
    }

    public function test_put_deactivation_and_password_reset_revoke_real_tokens(): void
    {
        $admin = User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]);
        $user = User::factory()->create(['rol' => User::ROLE_USER]);
        $token = $user->createToken('collector')->plainTextToken;
        Sanctum::actingAs($admin);
        $this->putJson('/api/users/'.$user->id, ['is_active' => false])->assertOk();
        $this->assertSame(0, $user->tokens()->count());
        Auth::forgetGuards();
        $this->withToken($token)->getJson('/api/user')->assertUnauthorized();
        $this->flushHeaders();
        Auth::forgetGuards();
        Sanctum::actingAs($admin);
        $user->update(['is_active' => true]);
        $user->createToken('second');
        $this->putJson('/api/users/'.$user->id, ['password' => 'temporary-test-password'])->assertOk();
        $this->assertSame(0, $user->tokens()->count());
        $this->putJson('/api/users/'.$admin->id, ['is_active' => false])->assertStatus(422);
        $this->putJson('/api/users/'.$admin->id, ['rol' => 'ADMIN'])->assertStatus(422);
        $this->patchJson('/api/users/'.$admin->id.'/role', ['rol' => 'ADMIN'])->assertStatus(422);
    }

    public function test_inactive_account_with_existing_token_is_denied(): void
    {
        $user = User::factory()->create(['is_active' => false]);
        $this->withToken($user->createToken('stale')->plainTextToken)->getJson('/api/user')->assertForbidden();
    }

    public function test_complete_draft_is_atomic_and_checks_revision(): void
    {
        [$form, $owner, , , $q] = $this->campaign();
        $form->update(['state' => 'DRAFT', 'instrument_locked' => false, 'link_uuid' => null]);
        $form->project->technicalSheet()->create(['status' => 'VALIDATED', 'created_by' => $owner->id, 'validated_by' => $owner->id]);
        Sanctum::actingAs($owner);
        $payload = ['title' => 'Nuevo título', 'step_by_step' => true, 'consent_text' => $form->consent_text,
            'expected_revision' => 0, 'questions' => [
                ['id' => $q->id, 'type' => 'TEXT', 'label' => 'Actualizada', 'required' => true, 'order' => 1],
                ['id' => (string) Str::uuid(), 'type' => 'TEXT', 'label' => 'Inválida', 'required' => false, 'order' => 1],
            ]];
        $this->putJson('/api/forms/'.$form->id.'/draft', $payload)->assertStatus(422);
        $this->assertSame('Instrumento', $form->fresh()->title);
        $this->assertSame('Respuesta', $q->fresh()->label);
        $this->assertSame(1, $form->questions()->count());
        $payload['questions'][1]['order'] = 2;
        $this->putJson('/api/forms/'.$form->id.'/draft', $payload)->assertOk()->assertJsonPath('draft_revision', 1);
        $this->putJson('/api/forms/'.$form->id.'/draft', $payload)
            ->assertStatus(409)
            ->assertJsonPath('expected_revision', 0)
            ->assertJsonPath('current_revision', 1);
    }
}
