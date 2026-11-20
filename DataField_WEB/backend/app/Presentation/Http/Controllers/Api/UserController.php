<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Application\User\DTOs\CreateUserDTO;
use App\Application\User\DTOs\UpdateUserDTO;
use App\Application\User\DTOs\UpdateUserRoleDTO;
use App\Application\User\UseCases\CreateUserUseCase;
use App\Application\User\UseCases\DeleteUserUseCase;
use App\Application\User\UseCases\GetUserByIdUseCase;
use App\Application\User\UseCases\GetUsersUseCase;
use App\Application\User\UseCases\RestoreUserUseCase;
use App\Application\User\UseCases\ToggleUserStatusUseCase;
use App\Application\User\UseCases\UpdateUserRoleUseCase;
use App\Application\User\UseCases\UpdateUserUseCase;
use App\Http\Controllers\Controller;
use App\Presentation\Http\Requests\User\CreateUserRequest;
use App\Presentation\Http\Requests\User\UpdateUserRequest;
use App\Presentation\Http\Requests\User\UpdateUserRoleRequest;
use App\Presentation\Http\Resources\Auth\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

#[OA\Tag(name: 'Users', description: 'Gestion de usuarios. ADMIN gestiona lideres de proyecto y usuarios; SUPER_ADMIN controla todos los roles.')]
class UserController extends Controller
{
    public function __construct(
        private readonly GetUsersUseCase $getUsersUseCase,
        private readonly GetUserByIdUseCase $getUserByIdUseCase,
        private readonly CreateUserUseCase $createUserUseCase,
        private readonly UpdateUserUseCase $updateUserUseCase,
        private readonly UpdateUserRoleUseCase $updateUserRoleUseCase,
        private readonly DeleteUserUseCase $deleteUserUseCase,
        private readonly ToggleUserStatusUseCase $toggleUserStatusUseCase,
        private readonly RestoreUserUseCase $restoreUserUseCase,
    ) {}

    #[OA\Get(
        path: '/users',
        summary: 'Listar usuarios gestionables por el rol actual',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'per_page', in: 'query', required: false, schema: new OA\Schema(type: 'integer', default: 15)),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista de usuarios'),
            new OA\Response(response: 403, description: 'No autorizado'),
        ]
    )]
    public function index(Request $request): JsonResponse
    {
        $perPage = max(1, min((int) $request->input('per_page', 15), 100));
        $users = $this->getUsersUseCase->execute($request->user()->id, $perPage, $request->boolean('deleted'));

        return response()->json([
            'data' => UserResource::collection($users->items()),
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
            ],
        ]);
    }

    #[OA\Patch(
        path: '/users/{id}/role',
        summary: 'Cambiar rol de un usuario',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['rol'],
                properties: [
                    new OA\Property(property: 'rol', type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'PROJECT', 'RECOLECTOR'], example: 'RECOLECTOR'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Rol actualizado'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado'),
        ]
    )]
    public function updateRole(UpdateUserRoleRequest $request, int $id): JsonResponse
    {
        $targetBefore = \App\Models\User::find($id);
        $oldRole = $targetBefore?->rol ?? 'RECOLECTOR';

        $dto = UpdateUserRoleDTO::fromArray(
            array_merge($request->validated(), ['user_id' => $id]),
            $request->user()->id
        );

        $user = $this->updateUserRoleUseCase->execute($dto);

        \App\Services\AuditLogService::logUserRoleChange($request->user(), $user, $oldRole, $user->rol);

        return response()->json([
            'message' => __('Rol actualizado exitosamente'),
            'user' => new UserResource($user),
        ]);
    }

    #[OA\Get(
        path: '/users/{id}',
        summary: 'Obtener detalle de un usuario (solo admin)',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Detalle del usuario'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado'),
        ]
    )]
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $this->getUserByIdUseCase->execute($id, $request->user()->id);

        return response()->json([
            'data' => new UserResource($user),
        ]);
    }

    #[OA\Post(
        path: '/users',
        summary: 'Crear un nuevo usuario (requiere Bearer token de ADMIN o SUPER_ADMIN)',
        security: [['sanctum' => []]],
        tags: ['Users'],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name', 'email', 'password'],
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'Juan Pérez'),
                    new OA\Property(property: 'email', type: 'string', format: 'email', example: 'juan@example.com'),
                    new OA\Property(property: 'password', type: 'string', example: 'password123'),
                    new OA\Property(property: 'rol', type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'PROJECT', 'RECOLECTOR'], example: 'RECOLECTOR'),
                    new OA\Property(property: 'is_active', type: 'boolean', example: true),
                    new OA\Property(property: 'telefono', type: 'string', example: '+593999999999'),
                    new OA\Property(property: 'cargo', type: 'string', example: 'Analista'),
                    new OA\Property(property: 'bio', type: 'string', example: 'Breve descripción'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Usuario creado'),
            new OA\Response(response: 401, description: 'No autenticado. Ejecuta /login y autoriza Swagger con el token Bearer.'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 409, description: 'Email ya registrado'),
            new OA\Response(response: 422, description: 'Error de validación'),
        ]
    )]
    public function store(CreateUserRequest $request): JsonResponse
    {
        $dto = CreateUserDTO::fromArray($request->validated(), $request->user()->id);

        $user = $this->createUserUseCase->execute($dto);

        \App\Services\AuditLogService::logUserCreation($request->user(), $user);

        return response()->json([
            'message' => __('Usuario creado exitosamente'),
            'data' => new UserResource($user),
        ], 201);
    }

    #[OA\Put(
        path: '/users/{id}',
        summary: 'Actualizar un usuario',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'Juan Pérez'),
                    new OA\Property(property: 'email', type: 'string', format: 'email', example: 'juan@example.com'),
                    new OA\Property(property: 'password', type: 'string', example: 'newpassword123'),
                    new OA\Property(property: 'rol', type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'PROJECT', 'RECOLECTOR'], example: 'RECOLECTOR'),
                    new OA\Property(property: 'is_active', type: 'boolean', example: true),
                    new OA\Property(property: 'telefono', type: 'string', example: '+593999999999'),
                    new OA\Property(property: 'cargo', type: 'string', example: 'Analista'),
                    new OA\Property(property: 'bio', type: 'string', example: 'Breve descripción'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Usuario actualizado'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado'),
            new OA\Response(response: 409, description: 'Email ya en uso'),
            new OA\Response(response: 422, description: 'Error de validación'),
        ]
    )]
    public function update(UpdateUserRequest $request, int $id): JsonResponse
    {
        $dto = UpdateUserDTO::fromArray($request->validated(), $id, $request->user()->id);

        $user = $this->updateUserUseCase->execute($dto);

        return response()->json([
            'message' => __('Usuario actualizado exitosamente'),
            'data' => new UserResource($user),
        ]);
    }

    #[OA\Delete(
        path: '/users/{id}',
        summary: 'Eliminar un usuario (solo admin)',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Usuario eliminado'),
            new OA\Response(response: 400, description: 'No puedes eliminarte a ti mismo'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado'),
        ]
    )]
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->deleteUserUseCase->execute($id, $request->user()->id);

        return response()->json([
            'message' => __('Usuario eliminado exitosamente'),
        ]);
    }

    /**
     * Quita el vínculo de la cuenta con su identidad de Microsoft 365. Sirve cuando el inicio con Microsoft
     * responde «account_mismatch» (la cuenta quedó atada a otra identidad): el siguiente inicio con
     * Microsoft con ese correo vuelve a vincularla. Se cierran las sesiones abiertas.
     */
    public function unlinkMicrosoft(Request $request, int $id): JsonResponse
    {
        $admin = $request->user();
        abort_unless($admin->canManageUsers(), 403, __('Solo los administradores restablecen la vinculación con Microsoft.'));
        $user = \App\Models\User::findOrFail($id);
        abort_unless($admin->canManageRole($user->rol), 403, __('No tienes permisos sobre una cuenta con ese rol.'));
        abort_if($user->microsoft_oid === null, 422, __('La cuenta no está vinculada a Microsoft.'));

        $user->forceFill(['microsoft_oid' => null])->save();
        $user->tokens()->delete();
        \App\Services\AuditLogService::log($admin, 'UNLINK_MICROSOFT', 'usuarios',
            'Restableció la vinculación con Microsoft de :email.', ['target_user_id' => $user->id], params: ['email' => $user->email]);

        return response()->json([
            'message' => __('Vinculación restablecida. :email queda vinculado a la cuenta de Microsoft con la que entre la próxima vez.', ['email' => $user->email]),
            'data' => new UserResource($user->load('perfil')),
        ]);
    }

    /** Deshace la eliminación de una cuenta (vuelve activa, con su rol y asignaciones). */
    public function restore(Request $request, int $id): JsonResponse
    {
        $user = $this->restoreUserUseCase->execute($id, $request->user()->id);

        return response()->json([
            'message' => __('Cuenta de :email restaurada. Ya puede volver a entrar.', ['email' => $user->email]),
            'data' => new UserResource($user),
        ]);
    }

    #[OA\Patch(
        path: '/users/{id}/status',
        summary: 'Activar/Desactivar un usuario (solo admin)',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: false,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'is_active', type: 'boolean', example: false, description: 'Si no se envía, se invierte el estado actual'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Estado actualizado'),
            new OA\Response(response: 400, description: 'No puedes desactivarte a ti mismo'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado'),
        ]
    )]
    public function toggleStatus(Request $request, int $id): JsonResponse
    {
        $isActive = $request->has('is_active') ? (bool) $request->input('is_active') : null;

        $user = $this->toggleUserStatusUseCase->execute($id, $request->user()->id, $isActive);

        \App\Services\AuditLogService::logUserStatusChange($request->user(), $user, $user->is_active);

        $status = $user->is_active ? 'activado' : 'desactivado';

        return response()->json([
            'message' => "Usuario {$status} exitosamente",
            'data' => new UserResource($user),
        ]);
    }
}
