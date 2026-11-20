<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Request;

/**
 * Registro de auditoría en lenguaje natural.
 *
 * Cada evento guarda su frase en español (`description_es`, la que se busca y la que ven los registros
 * antiguos) y, en `metadata.i18n`, la plantilla con sus datos (`key` + `params`). Al listar, describe()
 * arma la frase en el idioma de la petición; la plantilla es el texto en español con marcadores `:dato`
 * y su versión en inglés vive en lang/en.json. Los parámetros terminados en `role` guardan el código del
 * rol y se muestran con su nombre en el idioma pedido.
 */
class AuditLogService
{
    /**
     * Registra una actividad. `$description` es la plantilla (texto fijo o con marcadores :dato) y
     * `$params` sus valores.
     */
    public static function log(
        ?User $actor,
        string $action,
        string $module,
        string $description,
        array $metadata = [],
        array $params = [],
    ): AuditLog {
        return AuditLog::create([
            'user_id' => $actor?->id,
            'user_name' => $actor?->name ?? 'Usuario Anónimo / Sistema',
            'user_email' => $actor?->email ?? 'N/A',
            'user_role' => $actor?->rol ?? 'ANONYMOUS',
            'action' => strtoupper($action),
            'module' => strtolower($module),
            'description_es' => self::render($description, $params, 'es'),
            'ip_address' => Request::ip() ?? '127.0.0.1',
            'user_agent' => Request::header('User-Agent') ?? 'System/API',
            'metadata' => array_merge($metadata, [
                'correlation_id' => Request::header('X-Correlation-ID'),
                'i18n' => ['key' => $description, 'params' => $params],
            ]),
        ]);
    }

    /** Frase del registro en el idioma pedido. Los registros anteriores a las plantillas quedan en español. */
    public static function describe(AuditLog $log, ?string $locale = null): string
    {
        $i18n = is_array($log->metadata) ? ($log->metadata['i18n'] ?? null) : null;
        if (! is_array($i18n) || ! is_string($i18n['key'] ?? null)) {
            return (string) $log->description_es;
        }

        return self::render($i18n['key'], is_array($i18n['params'] ?? null) ? $i18n['params'] : [], $locale ?? app()->getLocale());
    }

    private static function render(string $template, array $params, string $locale): string
    {
        $params = array_filter($params, fn ($value) => $value !== null);
        foreach ($params as $name => $value) {
            if (str_ends_with((string) $name, 'role') && is_string($value)) {
                $params[$name] = self::roleLabel($value, $locale);
            } elseif (! is_scalar($value) && $value !== null) {
                $params[$name] = json_encode($value, JSON_UNESCAPED_UNICODE);
            }
        }

        return __($template, $params, $locale);
    }

    /** Log that the server finished preparing an export; delivery to the client is not provable here. */
    public static function logGeneratedExport(User $actor, Form $form, int $responseCount, string $format): AuditLog
    {
        return self::log($actor, 'EXPORT_GENERATED', 'descargas',
            "El servidor generó :format con :count respuesta(s) del formulario ':form' para :name. La entrega al cliente no está confirmada.", [
                'form_id' => $form->id,
                'form_title' => $form->title,
                'responses_count' => $responseCount,
                'format' => strtoupper($format),
                'source' => 'server',
            ], ['format' => strtoupper($format), 'count' => $responseCount, 'form' => $form->title, 'name' => $actor->name]);
    }

    /** A browser-side PDF report can only be asserted by the browser itself. */
    public static function logClientReportedExport(User $actor, Form $form, int $responseCount): AuditLog
    {
        return self::log($actor, 'EXPORT_CLIENT_REPORTED', 'descargas',
            "El cliente de :name informó que generó un PDF del formulario ':form'. La descarga no fue verificada por el servidor.", [
                'form_id' => $form->id,
                'form_title' => $form->title,
                'responses_count' => $responseCount,
                'format' => 'PDF',
                'source' => 'client',
            ], ['name' => $actor->name, 'form' => $form->title]);
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
        $template = $targetResponses !== null
            ? "El usuario :name (:actor_role) asignó permisos de ':assigned_role' (con límite de :limit respuestas) al usuario :target (:email) en el formulario ':form'."
            : "El usuario :name (:actor_role) asignó permisos de ':assigned_role' al usuario :target (:email) en el formulario ':form'.";

        return self::log($actor, 'SHARE_PERMISSION', 'permisos', $template, [
            'form_id' => $form->id,
            'form_title' => $form->title,
            'target_user_id' => $target->id,
            'target_user_name' => $target->name,
            'assigned_role' => $role,
            'target_responses' => $targetResponses,
        ], [
            'name' => $actor->name, 'actor_role' => $actor->rol, 'assigned_role' => $role, 'limit' => $targetResponses,
            'target' => $target->name, 'email' => $target->email, 'form' => $form->title,
        ]);
    }

    /**
     * Log permission revocation.
     */
    public static function logPermissionRevoke(User $actor, User $target, Form $form): AuditLog
    {
        return self::log($actor, 'REVOKE_PERMISSION', 'permisos',
            "El usuario :name (:actor_role) revocó los permisos de acceso de :target (:email) en el formulario ':form'.", [
                'form_id' => $form->id,
                'form_title' => $form->title,
                'target_user_id' => $target->id,
                'target_user_name' => $target->name,
            ], ['name' => $actor->name, 'actor_role' => $actor->rol, 'target' => $target->name, 'email' => $target->email, 'form' => $form->title]);
    }

    /**
     * Log user role updates.
     */
    public static function logUserRoleChange(User $actor, User $target, string $oldRole, string $newRole): AuditLog
    {
        return self::log($actor, 'UPDATE_ROLE', 'usuarios',
            "El SuperAdministrador :name cambió el rol del usuario :target (:email) de ':old_role' a ':new_role'.", [
                'target_user_id' => $target->id,
                'target_user_name' => $target->name,
                'old_role' => $oldRole,
                'new_role' => $newRole,
            ], ['name' => $actor->name, 'target' => $target->name, 'email' => $target->email, 'old_role' => $oldRole, 'new_role' => $newRole]);
    }

    /**
     * Log user status changes (active / inactive).
     */
    public static function logUserStatusChange(User $actor, User $target, bool $isActive): AuditLog
    {
        $template = $isActive
            ? 'El usuario :name (:actor_role) activó la cuenta del usuario :target (:email).'
            : 'El usuario :name (:actor_role) desactivó la cuenta del usuario :target (:email).';

        return self::log($actor, 'TOGGLE_USER_STATUS', 'usuarios', $template, [
            'target_user_id' => $target->id,
            'target_user_name' => $target->name,
            'is_active' => $isActive,
        ], ['name' => $actor->name, 'actor_role' => $actor->rol, 'target' => $target->name, 'email' => $target->email]);
    }

    /**
     * Log form modifications (create, edit, deploy, archive, delete, clone).
     * Para CLONE, `$sourceTitle` es el título del formulario de origen.
     */
    public static function logFormAction(User $actor, Form $form, string $actionType, ?string $sourceTitle = null): AuditLog
    {
        $type = strtoupper($actionType);
        $template = match ($type) {
            'CREATE' => "El usuario :name (:actor_role) creó el formulario en borrador ':form'.",
            'UPDATE' => "El usuario :name (:actor_role) modificó la estructura o configuración del formulario ':form'.",
            'DEPLOY' => "El usuario :name (:actor_role) publicó e implementó para recolección activa el formulario ':form'.",
            'ARCHIVE' => "El usuario :name (:actor_role) archivó el formulario ':form'.",
            'DELETE' => "El usuario :name (:actor_role) eliminó el formulario ':form'.",
            'CLONE' => $sourceTitle !== null
                ? "El usuario :name (:actor_role) clonó el formulario ':form' (Clonado de ':source')."
                : "El usuario :name (:actor_role) clonó el formulario ':form'.",
            default => "El usuario :name (:actor_role) realizó la acción ':action' en ':form'.",
        };

        return self::log($actor, 'FORM_'.$type, 'formularios', $template, [
            'form_id' => $form->id,
            'form_title' => $form->title,
            'form_state' => $form->state,
            'project_id' => $form->project_id,
        ], ['name' => $actor->name, 'actor_role' => $actor->rol, 'form' => $form->title, 'source' => $sourceTitle, 'action' => $actionType]);
    }

    /**
     * Log user creation.
     */
    public static function logUserCreation(User $actor, User $newUser): AuditLog
    {
        return self::log($actor, 'CREATE_USER', 'usuarios',
            "El usuario :name (:actor_role) creó la cuenta del nuevo usuario :target (:email) con el rol ':new_role'.", [
                'new_user_id' => $newUser->id,
                'new_user_email' => $newUser->email,
                'new_user_role' => $newUser->rol,
            ], ['name' => $actor->name, 'actor_role' => $actor->rol, 'target' => $newUser->name, 'email' => $newUser->email, 'new_role' => $newUser->rol]);
    }

    /**
     * Log project creation or update.
     */
    public static function logProjectAction(User $actor, Project $project, string $actionType): AuditLog
    {
        $type = strtoupper($actionType);
        $template = match ($type) {
            'CREATE' => "El usuario :name (:actor_role) creó el nuevo proyecto ':project'.",
            'UPDATE' => "El usuario :name (:actor_role) actualizó la información del proyecto ':project'.",
            'DELETE' => "El usuario :name (:actor_role) eliminó el proyecto ':project'.",
            default => "El usuario :name (:actor_role) modificó el proyecto ':project'.",
        };

        return self::log($actor, 'PROJECT_'.$type, 'proyectos', $template, [
            'project_id' => $project->id,
            'project_name' => $project->name,
        ], ['name' => $actor->name, 'actor_role' => $actor->rol, 'project' => $project->name]);
    }

    /** Nombre del rol en el idioma de la petición. */
    public static function getRoleLabel(string $role): string
    {
        return self::roleLabel($role, app()->getLocale());
    }

    private static function roleLabel(string $role, string $locale): string
    {
        $label = match (strtoupper($role)) {
            'SUPER_ADMIN' => 'SuperAdministrador',
            'ADMIN' => 'Administrador',
            'PROJECT' => 'Líder de Proyecto',
            'RECOLECTOR' => 'Recolector de Campo',
            default => null,
        };

        return $label === null ? $role : __($label, [], $locale);
    }
}
