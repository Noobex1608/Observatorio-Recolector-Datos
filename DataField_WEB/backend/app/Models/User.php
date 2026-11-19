<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    public const ROLE_SUPER_ADMIN = 'SUPER_ADMIN';

    public const ROLE_ADMIN = 'ADMIN';

    public const ROLE_PROJECT = 'PROJECT';

    public const ROLE_USER = 'RECOLECTOR';

    public const ROLE_SUPERVISOR = 'SUPERVISOR';

    public const ROLES = [
        self::ROLE_SUPER_ADMIN,
        self::ROLE_ADMIN,
        self::ROLE_PROJECT,
        self::ROLE_USER,
        self::ROLE_SUPERVISOR,
    ];

    /** Roles que pueden ser líderes de un proyecto. */
    public const LEADER_ROLES = [self::ROLE_PROJECT, self::ROLE_ADMIN, self::ROLE_SUPER_ADMIN];

    protected static function boot(): void
    {
        parent::boot();
    }

    protected $attributes = ['is_active' => true];

    protected $fillable = [
        'name',
        'email',
        'cedula',
        'must_change_password',
        'supabase_auth_id',
        'password',
        'rol',
        'is_active',
        'microsoft_oid',
        'access_request_status',
        'access_requested_at',
    ];

    /** Solicitud de acceso de una cuenta ULEAM que entró con Microsoft sin estar registrada. */
    public const ACCESS_PENDING = 'PENDING';

    /** Solicitud de acceso rechazada por un administrador (la cuenta sigue sin acceso). */
    public const ACCESS_REJECTED = 'REJECTED';

    protected $hidden = [
        'password',
        'remember_token',
        'microsoft_oid',
    ];

    protected function casts(): array
    {
        return [
            'access_requested_at' => 'datetime',
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
        ];
    }

    public function perfil(): HasOne
    {
        return $this->hasOne(Perfil::class);
    }

    public function ledProjects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_user_leaders')->withTimestamps();
    }

    public function assignedZones(): BelongsToMany
    {
        return $this->belongsToMany(ProjectZone::class, 'project_zone_user_assignments', 'user_id', 'zone_id')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function delegatedProjects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_user_delegates')->withTimestamps();
    }

    public function supervisedProjects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_user_supervisors')->withTimestamps();
    }

    public function isProjectDelegate(?string $projectId): bool
    {
        return $projectId !== null && $this->delegatedProjects()->whereKey($projectId)->exists();
    }

    public function supervisesProject(?string $projectId): bool
    {
        return $projectId !== null && $this->rol === self::ROLE_SUPERVISOR
            && $this->supervisedProjects()->whereKey($projectId)->exists();
    }

    public function isAdmin(): bool
    {
        return $this->rol === self::ROLE_ADMIN;
    }

    public function isSuperAdmin(): bool
    {
        return $this->rol === self::ROLE_SUPER_ADMIN;
    }

    public function isProject(): bool
    {
        return $this->rol === self::ROLE_PROJECT;
    }

    public function isProjectLeader(): bool
    {
        return $this->isProject();
    }

    /** SUPER_ADMIN y ADMIN gestionan usuarios y aprueban solicitudes de acceso. */
    public function canManageUsers(): bool
    {
        return $this->isSuperAdmin() || $this->isAdmin();
    }

    /** El ADMIN gestiona roles operativos; solo el SUPER_ADMIN crea o modifica administradores. */
    public function canManageRole(string $role): bool
    {
        if ($this->isSuperAdmin()) {
            return in_array($role, self::ROLES, true);
        }
        if ($this->isAdmin()) {
            return in_array($role, [self::ROLE_PROJECT, self::ROLE_USER, self::ROLE_SUPERVISOR], true);
        }

        return false;
    }

    /** Solicitud de acceso pendiente o rechazada: la cuenta no puede usar la plataforma. */
    public function hasAccessRequest(): bool
    {
        return $this->access_request_status !== null;
    }

    public function canManageProjects(): bool
    {
        return in_array($this->rol, [self::ROLE_SUPER_ADMIN, self::ROLE_ADMIN], true);
    }

    /**
     * Líder asignado de ese proyecto. Además de los líderes de proyecto, un ADMIN o SUPER_ADMIN puede
     * ser líder (para validar la ficha técnica y crear los formularios de un proyecto que dirige).
     */
    public function leadsProject(?string $projectId): bool
    {
        if (! $projectId || ! in_array($this->rol, self::LEADER_ROLES, true)) {
            return false;
        }

        return $this->ledProjects()->whereKey($projectId)->exists();
    }

    public function isUser(): bool
    {
        return $this->rol === self::ROLE_USER;
    }

    public function hasRole(string $role): bool
    {
        return $this->rol === $role;
    }

    public function isActive(): bool
    {
        return $this->is_active;
    }

    public function activate(): void
    {
        $this->is_active = true;
        $this->save();
    }

    public function deactivate(): void
    {
        $this->is_active = false;
        $this->save();
    }
}
