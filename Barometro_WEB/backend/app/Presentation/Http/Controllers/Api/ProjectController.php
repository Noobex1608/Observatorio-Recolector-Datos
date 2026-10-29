<?php

namespace App\Presentation\Http\Controllers\Api;

use App\Domain\Forms\Services\FormLifecycleService;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\User;
use App\Presentation\Http\Requests\CreateProjectRequest;
use App\Presentation\Http\Requests\UpdateProjectRequest;
use App\Presentation\Http\Resources\ProjectResource;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;

#[OA\Tag(name: 'Projects', description: 'Gestion de proyectos y asignacion de lideres')]
class ProjectController extends Controller
{
    public function __construct(
        protected FormLifecycleService $lifecycleService
    ) {}

    #[OA\Get(path: '/projects', summary: 'Listar proyectos visibles', security: [['sanctum' => []]], tags: ['Projects'])]
    public function index(Request $request): JsonResponse
    {
        $this->lifecycleService->syncStatesIfDue();
        $user = $request->user();

        $query = Project::with(['leaders:id,name,email,rol', 'delegates:id,name,email,rol', 'supervisors:id,name,email,rol', 'creator:id,name,email,rol'])
            ->withCount('forms')
            ->latest();

        if ($user->canManageProjects()) {
            // Admin y Super Admin ven todos los proyectos.
        } elseif ($user->isProjectLeader()) {
            $query->where(fn ($q) => $q->whereHas('leaders', fn ($members) => $members->where('users.id', $user->id))
                ->orWhereHas('delegates', fn ($members) => $members->where('users.id', $user->id)));
        } elseif ($user->rol === User::ROLE_SUPERVISOR) {
            $query->whereHas('supervisors', fn ($members) => $members->where('users.id', $user->id));
        } else {
            $query->whereHas('forms.shares', fn ($shares) => $shares->where('user_id', $user->id));
        }

        return response()->json(ProjectResource::collection($query->get()));
    }

    #[OA\Get(path: '/projects/leaders', summary: 'Listar lideres asignables', security: [['sanctum' => []]], tags: ['Projects'])]
    public function leaders(Request $request): JsonResponse
    {
        if (! $request->user()->canManageProjects()) {
            return response()->json(['message' => 'No tienes permisos para listar lideres'], 403);
        }

        return response()->json(
            User::query()
                ->where('rol', User::ROLE_PROJECT)
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'email', 'rol'])
        );
    }

    public function assignableUsers(Request $request, string $id): JsonResponse
    {
        $project = Project::findOrFail($id);
        abort_unless($request->user()->canManageProjects() || $request->user()->leadsProject($project->id), 403);

        return response()->json(User::query()->where('is_active', true)
            ->whereIn('rol', [User::ROLE_PROJECT, User::ROLE_USER, User::ROLE_SUPERVISOR])
            ->orderBy('name')->get(['id', 'name', 'email', 'rol']));
    }

    #[OA\Post(path: '/projects', summary: 'Crear proyecto', security: [['sanctum' => []]], tags: ['Projects'])]
    public function store(CreateProjectRequest $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->canManageProjects()) {
            return response()->json(['message' => 'No tienes permisos para crear proyectos'], 403);
        }

        $data = $request->validated();
        $this->validateProjectMembers($data);

        $project = DB::transaction(function () use ($data, $user) {
            $project = Project::create([
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'created_by' => $user->id,
            ]);
            if (array_key_exists('leader_ids', $data)) {
                $project->leaders()->sync($data['leader_ids']);
            }
            $this->syncProjectMembers($project, $data);
            AuditLogService::logProjectAction($user, $project, 'CREATE');

            return $project;
        });

        $project->load(['leaders:id,name,email,rol', 'delegates:id,name,email,rol', 'supervisors:id,name,email,rol', 'forms.shares.user:id,name,email,rol']);

        return response()->json(new ProjectResource($project), 201);
    }

    #[OA\Get(path: '/projects/{id}', summary: 'Ver proyecto', security: [['sanctum' => []]], tags: ['Projects'])]
    public function show(Request $request, string $id): JsonResponse
    {
        $this->lifecycleService->syncStatesIfDue();
        $project = Project::with(['leaders:id,name,email,rol', 'delegates:id,name,email,rol', 'supervisors:id,name,email,rol', 'forms.owner:id,name,email,rol', 'forms.technicalSheet', 'forms.shares.user:id,name,email,rol', 'technicalSheet.validator:id,name,email', 'zones.assignedUsers:id,name,email,rol'])->findOrFail($id);
        $user = $request->user();

        if (! $this->canViewProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para ver este proyecto'], 403);
        }

        if (! $this->canManageProjectForms($project, $user)) {
            $project->setRelation(
                'forms',
                $project->forms->filter(fn ($form) => $form->shares->contains('user_id', $user->id))->values()
            );
        }

        return response()->json(new ProjectResource($project));
    }

    #[OA\Put(path: '/projects/{id}', summary: 'Actualizar proyecto', security: [['sanctum' => []]], tags: ['Projects'])]
    public function update(UpdateProjectRequest $request, string $id): JsonResponse
    {
        $user = $request->user();
        $project = Project::findOrFail($id);
        if (! $user->canManageProjects() && ! $user->leadsProject($id) && ! $user->isProjectDelegate($id)) {
            return response()->json(['message' => 'No tienes permisos para actualizar proyectos'], 403);
        }
        $data = $request->validated();

        if (! $user->canManageProjects() && array_key_exists('leader_ids', $data)) {
            return response()->json(['message' => 'Solo administración puede cambiar líderes'], 403);
        }
        if ($user->isProjectDelegate($id) && ! $user->leadsProject($id)
            && (array_key_exists('delegate_ids', $data) || array_key_exists('supervisor_ids', $data))) {
            return response()->json(['message' => 'El delegado solo puede editar datos generales'], 403);
        }
        $this->validateProjectMembers($data);

        DB::transaction(function () use ($project, $request, $data, $user) {
            $before = $project->only(['name', 'description']);
            $project->fill($request->only(['name', 'description']));
            $project->save();
            if (array_key_exists('leader_ids', $data)) {
                $project->leaders()->sync($data['leader_ids']);
            }
            $this->syncProjectMembers($project, $data);
            AuditLogService::log($user, 'PROJECT_UPDATE', 'proyectos',
                "Actualización del proyecto '{$project->name}'.", [
                    'project_id' => $project->id,
                    'before' => $before,
                    'after' => $project->only(['name', 'description']),
                    'member_fields_changed' => array_values(array_intersect(array_keys($data),
                        ['leader_ids', 'delegate_ids', 'supervisor_ids'])),
                ]);
        });

        $project->load(['leaders:id,name,email,rol', 'delegates:id,name,email,rol', 'supervisors:id,name,email,rol', 'forms.shares.user:id,name,email,rol']);

        return response()->json(new ProjectResource($project));
    }

    #[OA\Delete(path: '/projects/{id}', summary: 'Eliminar proyecto', security: [['sanctum' => []]], tags: ['Projects'])]
    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user->isSuperAdmin()) {
            return response()->json(['message' => 'Solo el super admin puede eliminar proyectos'], 403);
        }

        $project = Project::withCount('forms')->findOrFail($id);
        if ($project->forms_count > 0) {
            return response()->json(['message' => 'No se puede eliminar un proyecto con formularios asociados'], 422);
        }

        DB::transaction(function () use ($project, $user) {
            AuditLogService::logProjectAction($user, $project, 'DELETE');
            $project->delete();
        });

        return response()->json(null, 204);
    }

    private function canViewProject(Project $project, User $user): bool
    {
        return $user->canManageProjects()
            || $user->leadsProject($project->id)
            || $user->isProjectDelegate($project->id)
            || $user->supervisesProject($project->id)
            || $project->forms->contains(fn ($form) => $form->shares->contains('user_id', $user->id));
    }

    private function canManageProjectForms(Project $project, User $user): bool
    {
        return $user->canManageProjects() || $user->leadsProject($project->id)
            || $user->isProjectDelegate($project->id) || $user->supervisesProject($project->id);
    }

    private function syncProjectMembers(Project $project, array $data): void
    {
        foreach (['delegate_ids' => ['delegates', User::ROLE_PROJECT],
            'supervisor_ids' => ['supervisors', User::ROLE_SUPERVISOR]] as $key => [$relation, $role]) {
            if (! array_key_exists($key, $data)) {
                continue;
            }
            $project->{$relation}()->sync($data[$key] ?? []);
        }
    }

    private function validateProjectMembers(array $data): void
    {
        foreach (['delegate_ids' => User::ROLE_PROJECT, 'supervisor_ids' => User::ROLE_SUPERVISOR] as $key => $role) {
            if (array_key_exists($key, $data) && User::whereIn('id', $data[$key] ?? [])
                ->where('rol', '!=', $role)->exists()) {
                abort(422, "Los usuarios de {$key} deben tener el rol {$role}.");
            }
        }
    }
}
