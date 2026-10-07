<?php

namespace Database\Seeders;

use App\Models\AuditLog;
use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Seeder;

class AuditLogSeeder extends Seeder
{
    public function run(): void
    {
        $superAdmin = User::where('rol', 'SUPER_ADMIN')->first() ?? User::first();
        $admin = User::where('rol', 'ADMIN')->first() ?? $superAdmin;
        $projectLeader = User::where('rol', 'PROJECT')->first() ?? $admin;
        $recolector = User::where('rol', 'RECOLECTOR')->first() ?? $projectLeader;

        $forms = Form::all();
        $projects = Project::all();

        $formTitle1 = $forms->first()?->title ?? 'Encuesta de Salud Barómetro';
        $formTitle2 = $forms->skip(1)->first()?->title ?? 'Evaluación de Servicios Universitarios';
        $projectName = $projects->first()?->name ?? 'Vinculación Comunitaria ULEAM';

        $logs = [
            [
                'user_id' => $superAdmin?->id,
                'user_name' => $superAdmin?->name ?? 'SuperAdmin ULEAM',
                'user_email' => $superAdmin?->email ?? 'admin@uleam.edu.ec',
                'user_role' => 'SUPER_ADMIN',
                'action' => 'UPDATE_ROLE',
                'module' => 'usuarios',
                'description_es' => sprintf("El SuperAdministrador %s cambió el rol del usuario %s de 'Recolector' a 'Líder de Proyecto'.", $superAdmin?->name ?? 'SuperAdmin', $projectLeader?->name ?? 'Carlos Mendoza'),
                'metadata' => ['target_user_id' => $projectLeader?->id, 'old_role' => 'RECOLECTOR', 'new_role' => 'PROJECT'],
                'created_at' => now()->subHours(12),
            ],
            [
                'user_id' => $admin?->id,
                'user_name' => $admin?->name ?? 'Administrador Sistema',
                'user_email' => $admin?->email ?? 'admin@barometro.org',
                'user_role' => 'ADMIN',
                'action' => 'EXPORT_DATA',
                'module' => 'descargas',
                'description_es' => sprintf("El usuario %s (Administrador) exportó 48 respuesta(s) del formulario '%s' en formato XLSX.", $admin?->name ?? 'Admin', $formTitle1),
                'metadata' => ['form_title' => $formTitle1, 'responses_count' => 48, 'format' => 'XLSX'],
                'created_at' => now()->subHours(9),
            ],
            [
                'user_id' => $projectLeader?->id,
                'user_name' => $projectLeader?->name ?? 'Líder de Proyecto',
                'user_email' => $projectLeader?->email ?? 'lider@barometro.org',
                'user_role' => 'PROJECT',
                'action' => 'SHARE_PERMISSION',
                'module' => 'permisos',
                'description_es' => sprintf("El usuario %s (Líder de Proyecto) asignó permisos de 'Recolector de Campo' (con límite de 50 respuestas) al usuario %s (%s) en el formulario '%s'.", $projectLeader?->name ?? 'Líder', $recolector?->name ?? 'Recolector 1', $recolector?->email ?? 'rec@barometro.org', $formTitle1),
                'metadata' => ['form_title' => $formTitle1, 'assigned_role' => 'RECOLECTOR', 'target_responses' => 50],
                'created_at' => now()->subHours(6),
            ],
            [
                'user_id' => $admin?->id,
                'user_name' => $admin?->name ?? 'Administrador Sistema',
                'user_email' => $admin?->email ?? 'admin@barometro.org',
                'user_role' => 'ADMIN',
                'action' => 'EXPORT_DATA',
                'module' => 'descargas',
                'description_es' => sprintf("El usuario %s (Administrador) exportó 115 respuesta(s) del formulario '%s' en formato CSV.", $admin?->name ?? 'Admin', $formTitle2),
                'metadata' => ['form_title' => $formTitle2, 'responses_count' => 115, 'format' => 'CSV'],
                'created_at' => now()->subHours(4),
            ],
            [
                'user_id' => $projectLeader?->id,
                'user_name' => $projectLeader?->name ?? 'Líder de Proyecto',
                'user_email' => $projectLeader?->email ?? 'lider@barometro.org',
                'user_role' => 'PROJECT',
                'action' => 'FORM_DEPLOY',
                'module' => 'formularios',
                'description_es' => sprintf("El usuario %s (Líder de Proyecto) publicó e implementó para recolección activa el formulario '%s'.", $projectLeader?->name ?? 'Líder', $formTitle1),
                'metadata' => ['form_title' => $formTitle1, 'state' => 'DEPLOYED'],
                'created_at' => now()->subHours(2),
            ],
            [
                'user_id' => $superAdmin?->id,
                'user_name' => $superAdmin?->name ?? 'SuperAdmin ULEAM',
                'user_email' => $superAdmin?->email ?? 'admin@uleam.edu.ec',
                'user_role' => 'SUPER_ADMIN',
                'action' => 'PROJECT_CREATE',
                'module' => 'proyectos',
                'description_es' => sprintf("El usuario %s (SuperAdministrador) creó el nuevo proyecto '%s'.", $superAdmin?->name ?? 'SuperAdmin', $projectName),
                'metadata' => ['project_name' => $projectName],
                'created_at' => now()->subMinutes(30),
            ],
        ];

        foreach ($logs as $logData) {
            AuditLog::create($logData);
        }
    }
}
