<?php

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use OpenApi\Attributes as OA;

#[OA\Tag(name: 'Projects', description: 'Gestion de proyectos y asignacion de lideres')]
class ProjectController extends Controller
{
    #[OA\Get(path: '/projects', summary: 'Listar proyectos visibles', security: [['sanctum' => []]], tags: ['Projects'])]
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Project::with(['leaders:id,name,email,rol', 'creator:id,name,email,rol'])
            ->withCount('forms')
            ->latest();

        if ($user->canManageProjects()) {
            // Admin y Super Admin ven todos los proyectos.
        } elseif ($user->isProjectLeader()) {
            $query->whereHas('leaders', fn($leaders) => $leaders->where('users.id', $user->id));
        } else {
            $query->whereHas('forms.shares', fn($shares) => $shares->where('user_id', $user->id));
        }

        return response()->json($query->get());
    }

    #[OA\Get(path: '/projects/leaders', summary: 'Listar lideres asignables', security: [['sanctum' => []]], tags: ['Projects'])]
    public function leaders(Request $request): JsonResponse
    {
        if (!$request->user()->canManageProjects()) {
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

    #[OA\Post(path: '/projects', summary: 'Crear proyecto', security: [['sanctum' => []]], tags: ['Projects'])]
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->canManageProjects()) {
            return response()->json(['message' => 'No tienes permisos para crear proyectos'], 403);
        }

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'leader_ids' => 'sometimes|array',
            'leader_ids.*' => [
                'integer',
                Rule::exists('users', 'id')->where('rol', User::ROLE_PROJECT),
            ],
        ]);

        $project = Project::create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'created_by' => $user->id,
        ]);

        if (array_key_exists('leader_ids', $data)) {
            $project->leaders()->sync($data['leader_ids']);
        }

        return response()->json($this->projectPayload($project->load(['leaders:id,name,email,rol', 'forms.shares.user:id,name,email,rol'])), 201);
    }

    #[OA\Get(path: '/projects/{id}', summary: 'Ver proyecto', security: [['sanctum' => []]], tags: ['Projects'])]
    public function show(Request $request, string $id): JsonResponse
    {
        $project = Project::with(['leaders:id,name,email,rol', 'forms.owner:id,name,email,rol', 'forms.shares.user:id,name,email,rol'])->findOrFail($id);
        $user = $request->user();

        if (!$this->canViewProject($project, $user)) {
            return response()->json(['message' => 'No tienes permisos para ver este proyecto'], 403);
        }

        if (!$this->canManageProjectForms($project, $user)) {
            $project->setRelation(
                'forms',
                $project->forms->filter(fn($form) => $form->shares->contains('user_id', $user->id))->values()
            );
        }

        return response()->json($this->projectPayload($project));
    }

    #[OA\Put(path: '/projects/{id}', summary: 'Actualizar proyecto', security: [['sanctum' => []]], tags: ['Projects'])]
    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (!$user->canManageProjects()) {
            return response()->json(['message' => 'No tienes permisos para actualizar proyectos'], 403);
        }

        $project = Project::findOrFail($id);
        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'leader_ids' => 'sometimes|array',
            'leader_ids.*' => [
                'integer',
                Rule::exists('users', 'id')->where('rol', User::ROLE_PROJECT),
            ],
        ]);

        $project->fill($request->only(['name', 'description']));
        $project->save();

        if (array_key_exists('leader_ids', $data)) {
            $project->leaders()->sync($data['leader_ids']);
        }

        return response()->json($this->projectPayload($project->load(['leaders:id,name,email,rol', 'forms.shares.user:id,name,email,rol'])));
    }

    #[OA\Delete(path: '/projects/{id}', summary: 'Eliminar proyecto', security: [['sanctum' => []]], tags: ['Projects'])]
    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (!$user->isSuperAdmin()) {
            return response()->json(['message' => 'Solo el super admin puede eliminar proyectos'], 403);
        }

        $project = Project::withCount('forms')->findOrFail($id);
        if ($project->forms_count > 0) {
            return response()->json(['message' => 'No se puede eliminar un proyecto con formularios asociados'], 422);
        }

        $project->delete();

        return response()->json(null, 204);
    }

    private function canViewProject(Project $project, User $user): bool
    {
        return $user->canManageProjects()
            || $user->leadsProject($project->id)
            || $project->forms->contains(fn($form) => $form->shares->contains('user_id', $user->id));
    }

    private function canManageProjectForms(Project $project, User $user): bool
    {
        return $user->canManageProjects() || $user->leadsProject($project->id);
    }

    private function projectPayload(Project $project): array
    {
        $payload = $project->toArray();
        $payload['members'] = $this->buildMembers($project);

        return $payload;
    }

    private function buildMembers(Project $project): array
    {
        $members = [];

        foreach ($project->leaders as $leader) {
            $members["leader-{$leader->id}"] = [
                'user_id' => $leader->id,
                'name' => $leader->name,
                'email' => $leader->email,
                'role' => 'PROJECT',
                'scope' => 'Proyecto',
                'form_id' => null,
                'form_title' => null,
            ];
        }

        foreach ($project->forms as $form) {
            foreach ($form->shares as $share) {
                $shareUser = $share->user;
                if (!$shareUser) {
                    continue;
                }

                $members["form-{$form->id}-{$shareUser->id}"] = [
                    'user_id' => $shareUser->id,
                    'name' => $shareUser->name,
                    'email' => $shareUser->email,
                    'role' => $share->role,
                    'scope' => 'Formulario',
                    'form_id' => $form->id,
                    'form_title' => $form->title,
                ];
            }
        }

        return array_values($members);
    }
}
