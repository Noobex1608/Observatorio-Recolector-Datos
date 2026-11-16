<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditExportEventsTest extends TestCase
{
    use RefreshDatabase;

    public function test_server_export_and_browser_report_are_separate_events(): void
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $project = Project::create(['name' => 'Proyecto auditoría']);
        $form = Form::create([
            'project_id' => $project->id,
            'user_id' => $owner->id,
            'title' => 'Encuesta auditada',
            'state' => 'DEPLOYED',
        ]);
        FormResponse::create(['form_id' => $form->id, 'user_id' => $owner->id, 'data' => []]);
        Sanctum::actingAs($owner);

        $download = $this->get("/api/forms/{$form->id}/export?format=csv");
        $download->assertOk();
        $this->assertDatabaseMissing('audit_logs', ['action' => 'EXPORT_GENERATED']);
        $this->assertStringContainsString('_submission_time', $download->streamedContent());
        $this->assertSame(1, AuditLog::where('action', 'EXPORT_GENERATED')->count());

        $this->postJson("/api/forms/{$form->id}/log-export", ['format' => 'pdf'])->assertOk();
        $this->postJson("/api/forms/{$form->id}/log-export", ['format' => 'csv'])->assertStatus(422);
        $this->assertSame(1, AuditLog::where('action', 'EXPORT_CLIENT_REPORTED')->count());

        $this->getJson('/api/audit-logs/stats')->assertForbidden();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]));
        $this->getJson('/api/audit-logs/stats')->assertOk()
            ->assertJsonPath('summary.total_downloads', 1)
            ->assertJsonPath('summary.total_client_reported_exports', 1)
            ->assertJsonPath('summary.total_responses_exported', 1);
    }
}
