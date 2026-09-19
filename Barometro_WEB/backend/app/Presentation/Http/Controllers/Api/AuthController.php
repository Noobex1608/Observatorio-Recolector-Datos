<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Application\Auth\DTOs\LoginDTO;
use App\Application\Auth\UseCases\GetCurrentUserUseCase;
use App\Application\Auth\UseCases\LoginUseCase;
use App\Application\Auth\UseCases\LogoutUseCase;
use App\Http\Controllers\Controller;
use App\Presentation\Http\Requests\Auth\LoginRequest;
use App\Presentation\Http\Resources\Auth\AuthResource;
use App\Presentation\Http\Resources\Auth\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

#[OA\Tag(name: 'Auth', description: 'Endpoints de autenticacion')]
class AuthController extends Controller
{
    public function __construct(
        private readonly LoginUseCase $loginUseCase,
        private readonly LogoutUseCase $logoutUseCase,
        private readonly GetCurrentUserUseCase $getCurrentUserUseCase,
    ) {}

    #[OA\Post(
        path: '/login',
        summary: 'Iniciar sesion y obtener token Bearer',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['email', 'password'],
                properties: [
                    new OA\Property(property: 'email', type: 'string', format: 'email', example: 'admin@example.com'),
                    new OA\Property(property: 'password', type: 'string', format: 'password', example: 'password123'),
                ]
            )
        ),
        tags: ['Auth'],
        responses: [
            new OA\Response(response: 200, description: 'Login exitoso. Copia el campo token y usalo en Authorize.'),
            new OA\Response(response: 422, description: 'Credenciales invalidas'),
        ]
    )]
    public function login(LoginRequest $request): JsonResponse
    {
        $dto = LoginDTO::fromArray($request->validated());
        $result = $this->loginUseCase->execute($dto);

        return response()->json(new AuthResource($result));
    }

    #[OA\Post(
        path: '/logout',
        summary: 'Cerrar sesion',
        security: [['sanctum' => []]],
        tags: ['Auth'],
        responses: [
            new OA\Response(response: 200, description: 'Logout exitoso'),
        ]
    )]
    public function logout(Request $request): JsonResponse
    {
        $this->logoutUseCase->execute($request->user());

        return response()->json(['message' => 'Sesion cerrada exitosamente']);
    }

    #[OA\Get(
        path: '/user',
        summary: 'Obtener usuario actual',
        security: [['sanctum' => []]],
        tags: ['Auth'],
        responses: [
            new OA\Response(response: 200, description: 'Datos del usuario'),
        ]
    )]
    public function user(Request $request): JsonResponse
    {
        $user = $this->getCurrentUserUseCase->execute($request->user());

        return response()->json(new UserResource($user));
    }
}
