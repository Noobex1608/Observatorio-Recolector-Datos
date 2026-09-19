<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use OpenApi\Attributes as OA;
use App\Application\User\DTOs\CreateUserDTO;
use App\Application\User\DTOs\UpdateUserDTO;
use App\Application\User\DTOs\UpdateUserRoleDTO;
use App\Application\User\UseCases\CreateUserUseCase;
use App\Application\User\UseCases\DeleteUserUseCase;
use App\Application\User\UseCases\GetUserByIdUseCase;
use App\Application\User\UseCases\GetUsersUseCase;
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
    ) {}

    #[OA\Get(
        path: '/users',
        summary: 'Listar usuarios gestionables por el rol actual',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'per_page', in: 'query', required: false, schema: new OA\Schema(type: 'integer', default: 15))
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista de usuarios'),
            new OA\Response(response: 403, description: 'No autorizado')
        ]
    )]
    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->input('per_page', 15);
        $users = $this->getUsersUseCase->execute($request->user()->id, $perPage);

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
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['rol'],
                properties: [
                    new OA\Property(property: 'rol', type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'PROJECT', 'RECOLECTOR'], example: 'RECOLECTOR')
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Rol actualizado'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado')
        ]
    )]
    public function updateRole(UpdateUserRoleRequest $request, int $id): JsonResponse
    {
        $dto = UpdateUserRoleDTO::fromArray(
            array_merge($request->validated(), ['user_id' => $id]),
            $request->user()->id
        );

        $user = $this->updateUserRoleUseCase->execute($dto);

        return response()->json([
            'message' => 'Rol actualizado exitosamente',
            'user' => new UserResource($user),
        ]);
    }

    #[OA\Get(
        path: '/users/{id}',
        summary: 'Obtener detalle de un usuario (solo admin)',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))
        ],
        responses: [
            new OA\Response(response: 200, description: 'Detalle del usuario'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado')
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
                    new OA\Property(property: 'bio', type: 'string', example: 'Breve descripción')
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Usuario creado'),
            new OA\Response(response: 401, description: 'No autenticado. Ejecuta /login y autoriza Swagger con el token Bearer.'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 409, description: 'Email ya registrado'),
            new OA\Response(response: 422, description: 'Error de validación')
        ]
    )]
    public function store(CreateUserRequest $request): JsonResponse
    {
        $dto = CreateUserDTO::fromArray($request->validated(), $request->user()->id);

        $user = $this->createUserUseCase->execute($dto);

        return response()->json([
            'message' => 'Usuario creado exitosamente',
            'data' => new UserResource($user),
        ], 201);
    }

    #[OA\Put(
        path: '/users/{id}',
        summary: 'Actualizar un usuario',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))
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
                    new OA\Property(property: 'bio', type: 'string', example: 'Breve descripción')
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Usuario actualizado'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado'),
            new OA\Response(response: 409, description: 'Email ya en uso'),
            new OA\Response(response: 422, description: 'Error de validación')
        ]
    )]
    public function update(UpdateUserRequest $request, int $id): JsonResponse
    {
        $dto = UpdateUserDTO::fromArray($request->validated(), $id, $request->user()->id);

        $user = $this->updateUserUseCase->execute($dto);

        return response()->json([
            'message' => 'Usuario actualizado exitosamente',
            'data' => new UserResource($user),
        ]);
    }

    #[OA\Delete(
        path: '/users/{id}',
        summary: 'Eliminar un usuario (solo admin)',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))
        ],
        responses: [
            new OA\Response(response: 200, description: 'Usuario eliminado'),
            new OA\Response(response: 400, description: 'No puedes eliminarte a ti mismo'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado')
        ]
    )]
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->deleteUserUseCase->execute($id, $request->user()->id);

        return response()->json([
            'message' => 'Usuario eliminado exitosamente',
        ]);
    }

    #[OA\Patch(
        path: '/users/{id}/status',
        summary: 'Activar/Desactivar un usuario (solo admin)',
        security: [['sanctum' => []]],
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))
        ],
        requestBody: new OA\RequestBody(
            required: false,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'is_active', type: 'boolean', example: false, description: 'Si no se envía, se invierte el estado actual')
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Estado actualizado'),
            new OA\Response(response: 400, description: 'No puedes desactivarte a ti mismo'),
            new OA\Response(response: 403, description: 'No autorizado'),
            new OA\Response(response: 404, description: 'Usuario no encontrado')
        ]
    )]
    public function toggleStatus(Request $request, int $id): JsonResponse
    {
        $isActive = $request->has('is_active') ? (bool) $request->input('is_active') : null;
        
        $user = $this->toggleUserStatusUseCase->execute($id, $request->user()->id, $isActive);

        $status = $user->is_active ? 'activado' : 'desactivado';

        return response()->json([
            'message' => "Usuario {$status} exitosamente",
            'data' => new UserResource($user),
        ]);
    }
}
