<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Project;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** El panel web pide el idioma con X-App-Language; sin esa cabecera la API responde en español. */
class RequestLocaleTest extends TestCase
{
    use RefreshDatabase;

    public function test_messages_follow_the_app_language_header_and_default_to_spanish(): void
    {
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));

        $this->getJson('/api/projects/leaders')->assertForbidden()
            ->assertJsonPath('message', 'No tienes permisos para listar lideres');
        $this->getJson('/api/projects/leaders', ['X-App-Language' => 'en'])->assertForbidden()
            ->assertJsonPath('message', 'You do not have permission to list leaders');
        // Accept-Language es el idioma del dispositivo: no cambia los mensajes de la app de recolección.
        $this->getJson('/api/projects/leaders', ['Accept-Language' => 'en-US'])->assertForbidden()
            ->assertJsonPath('message', 'No tienes permisos para listar lideres');
        $this->getJson('/api/projects/leaders', ['X-App-Language' => 'fr'])->assertForbidden()
            ->assertJsonPath('message', 'No tienes permisos para listar lideres');
    }

    public function test_audit_history_is_written_in_spanish_and_listed_in_the_requested_language(): void
    {
        $super = User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN, 'name' => 'Ana']);
        $project = Project::create(['name' => 'Censo']);
        AuditLogService::logProjectAction($super, $project, 'CREATE');
        AuditLog::create([
            'user_id' => $super->id, 'user_name' => 'Ana', 'user_email' => $super->email, 'user_role' => 'SUPER_ADMIN',
            'action' => 'LEGACY', 'module' => 'proyectos', 'description_es' => 'Registro anterior a las plantillas.',
            'ip_address' => '127.0.0.1', 'user_agent' => 'test', 'metadata' => [],
        ]);

        $log = AuditLog::where('action', 'PROJECT_CREATE')->firstOrFail();
        $this->assertSame("El usuario Ana (SuperAdministrador) creó el nuevo proyecto 'Censo'.", $log->description_es);

        Sanctum::actingAs($super);
        $english = collect($this->getJson('/api/audit-logs', ['X-App-Language' => 'en'])->assertOk()->json('data'))->keyBy('action');
        $this->assertSame("The user Ana (Super administrator) created the new project 'Censo'.", $english['PROJECT_CREATE']['description']);
        $this->assertSame("El usuario Ana (SuperAdministrador) creó el nuevo proyecto 'Censo'.", $english['PROJECT_CREATE']['description_es']);
        $this->assertSame('Registro anterior a las plantillas.', $english['LEGACY']['description'], 'Los registros antiguos siguen en español.');

        $spanish = collect($this->getJson('/api/audit-logs')->assertOk()->json('data'))->keyBy('action');
        $this->assertSame("El usuario Ana (SuperAdministrador) creó el nuevo proyecto 'Censo'.", $spanish['PROJECT_CREATE']['description']);
    }
}
