<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Request;

class AuditLogService
{
    /**
     * Log a generic natural language activity.
     */
    public static function log(
        ?User $actor,
        string $action,
        string $module,
        string $descriptionEs,
        array $metadata = []
    ): AuditLog {
        return AuditLog::create([
            'user_id' => $actor?->id,
            'user_name' => $actor?->name ?? 'Usuario Anónimo / Sistema',
            'user_email' => $actor?->email ?? 'N/A',
            'user_role' => $actor?->rol ?? 'ANONYMOUS',
            'action' => strtoupper($action),
            'module' => strtolower($module),
            'description_es' => $descriptionEs,
            'ip_address' => Request::ip() ?? '127.0.0.1',
            'user_agent' => Request::header('User-Agent') ?? 'System/API',
            'metadata' => $metadata,
        ]);
    }

    /**
     * Log response exports/downloads in natural language.
     */
    public static function logDownload(User $actor, Form $form, int $responseCount, string $format): AuditLog
    {
        $roleName = self::getRoleLabel($actor->rol);
        $formatUpper = strtoupper($format);
        $description = sprintf(
            "El usuario %s (%s) exportó %d respuesta(s) del formulario '%s' en formato %s.",
            $actor->name,
            $roleName,
            $responseCount,
            $form->title,
            $formatUpper
        );

        return self::log($actor, 'EXPORT_DATA', 'descargas', $description, [
            'form_id' => $form->id,
            'form_title' => $form->title,
            'responses_count' => $responseCount,
            'format' => $formatUpper,
        ]);
    }

    /**
     * Log form share / permission assignment.
     */
    public static function logPermissionShare(
        User $actor,
        User $target,
        Form $form,
        string $role,
        ?int $targetResponses = null
    ): AuditLog {
        $actorRole = self::getRoleLabel($actor->rol);
        $assignedRole = self::getRoleLabel($role);
        
        $targetInfo = $targetResponses !== null 
            ? sprintf(" (con límite de %d respuestas)", $targetResponses)
            : "";

        $description = sprintf(
            "El usuario %s (%s) asignó permisos de '%s'%s al usuario %s (%s) en el formulario '%s'.",
            $actor->name,
            $actorRole,
            $assignedRole,
            $targetInfo,
            $target->name,
            $target->email,
            $form->title
        );

        return self::log($actor, 'SHARE_PERMISSION', 'permisos', $description, [
            'form_id' => $form->id,
            'form_title' => $form->title,
            'target_user_id' => $target->id,
            'target_user_name' => $target->name,
            'assigned_role' => $role,
            'target_responses' => $targetResponses,
        ]);
    }

    /**
     * Log permission revocation.
     */
    public static function logPermissionRevoke(User $actor, User $target, Form $form): AuditLog
    {
        $actorRole = self::getRoleLabel($actor->rol);
        $description = sprintf(
            "El usuario %s (%s) revocó los permisos de acceso de %s (%s) en el formulario '%s'.",
            $actor->name,
            $actorRole,
            $target->name,
            $target->email,
            $form->title
        );

        return self::log($actor, 'REVOKE_PERMISSION', 'permisos', $description, [
            'form_id' => $form->id,
            'form_title' => $form->title,
            'target_user_id' => $target->id,
            'target_user_name' => $target->name,
        ]);
    }

    /**
     * Log user role updates.
     */
    public static function logUserRoleChange(User $actor, User $target, string $oldRole, string $newRole): AuditLog
    {
        $actorRole = self::getRoleLabel($actor->rol);
        $oldRoleLabel = self::getRoleLabel($oldRole);
        $newRoleLabel = self::getRoleLabel($newRole);

        $description = sprintf(
            "El SuperAdministrador %s cambió el rol del usuario %s (%s) de '%s' a '%s'.",
            $actor->name,
            $target->name,
            $target->email,
            $oldRoleLabel,
            $newRoleLabel
        );

        return self::log($actor, 'UPDATE_ROLE', 'usuarios', $description, [
            'target_user_id' => $target->id,
            'target_user_name' => $target->name,
            'old_role' => $oldRole,
            'new_role' => $newRole,
        ]);
    }

    /**
     * Log user status changes (active / inactive).
     */
    public static function logUserStatusChange(User $actor, User $target, bool $isActive): AuditLog
    {
        $actorRole = self::getRoleLabel($actor->rol);
        $statusLabel = $isActive ? "activó la cuenta del" : "desactivó la cuenta del";

        $description = sprintf(
            "El usuario %s (%s) %s usuario %s (%s).",
            $actor->name,
            $actorRole,
            $statusLabel,
            $target->name,
            $target->email
        );

        return self::log($actor, 'TOGGLE_USER_STATUS', 'usuarios', $description, [
            'target_user_id' => $target->id,
            'target_user_name' => $target->name,
            'is_active' => $isActive,
        ]);
    }

    /**
     * Log form modifications (create, edit, deploy, archive, delete).
     */
    public static function logFormAction(User $actor, Form $form, string $actionType, ?string $extraNote = null): AuditLog
    {
        $actorRole = self::getRoleLabel($actor->rol);
        
        $verbs = [
            'CREATE' => 'creó el formulario en borrador',
            'UPDATE' => 'modificó la estructura o configuración del formulario',
            'DEPLOY' => 'publicó e implementó para recolección activa el formulario',
            'ARCHIVE' => 'archivó el formulario',
            'DELETE' => 'eliminó el formulario',
            'CLONE' => 'clonó el formulario',
        ];

        $verb = $verbs[strtoupper($actionType)] ?? "realizó la acción '{$actionType}' en";
        $extra = $extraNote ? " ({$extraNote})" : "";

        $description = sprintf(
            "El usuario %s (%s) %s '%s'%s.",
            $actor->name,
            $actorRole,
            $verb,
            $form->title,
            $extra
        );

        return self::log($actor, "FORM_" . strtoupper($actionType), 'formularios', $description, [
            'form_id' => $form->id,
            'form_title' => $form->title,
            'form_state' => $form->state,
            'project_id' => $form->project_id,
        ]);
    }

    /**
     * Log user creation.
     */
    public static function logUserCreation(User $actor, User $newUser): AuditLog
    {
        $actorRole = self::getRoleLabel($actor->rol);
        $newRoleLabel = self::getRoleLabel($newUser->rol);

        $description = sprintf(
            "El usuario %s (%s) creó la cuenta del nuevo usuario %s (%s) con el rol '%s'.",
            $actor->name,
            $actorRole,
            $newUser->name,
            $newUser->email,
            $newRoleLabel
        );

        return self::log($actor, 'CREATE_USER', 'usuarios', $description, [
            'new_user_id' => $newUser->id,
            'new_user_email' => $newUser->email,
            'new_user_role' => $newUser->rol,
        ]);
    }

    /**
     * Log project creation or update.
     */
    public static function logProjectAction(User $actor, Project $project, string $actionType): AuditLog
    {
        $actorRole = self::getRoleLabel($actor->rol);
        $verbs = [
            'CREATE' => 'creó el nuevo proyecto',
            'UPDATE' => 'actualizó la información del proyecto',
            'DELETE' => 'eliminó el proyecto',
        ];

        $verb = $verbs[strtoupper($actionType)] ?? "modificó el proyecto";

        $description = sprintf(
            "El usuario %s (%s) %s '%s'.",
            $actor->name,
            $actorRole,
            $verb,
            $project->name
        );

        return self::log($actor, "PROJECT_" . strtoupper($actionType), 'proyectos', $description, [
            'project_id' => $project->id,
            'project_name' => $project->name,
        ]);
    }

    /**
     * Helper to get user role in readable Spanish.
     */
    public static function getRoleLabel(string $role): string
    {
        return match (strtoupper($role)) {
            'SUPER_ADMIN' => 'SuperAdministrador',
            'ADMIN' => 'Administrador',
            'PROJECT' => 'Líder de Proyecto',
            'RECOLECTOR' => 'Recolector de Campo',
            default => $role,
        };
    }
}
