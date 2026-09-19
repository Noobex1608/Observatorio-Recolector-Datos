<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use OpenApi\Attributes as OA;
use App\Application\Profile\DTOs\UpdateProfileDTO;
use App\Application\Profile\UseCases\UpdateProfileUseCase;
use App\Application\Profile\UseCases\UploadAvatarUseCase;
use App\Http\Controllers\Controller;
use App\Presentation\Http\Resources\Auth\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

#[OA\Tag(name: 'Profile', description: 'Endpoints de perfil de usuario')]
class ProfileController extends Controller
{
    public function __construct(
        private readonly UpdateProfileUseCase $updateProfileUseCase,
        private readonly UploadAvatarUseCase $uploadAvatarUseCase,
    ) {}

    #[OA\Get(
        path: '/profile',
        summary: 'Obtener perfil del usuario autenticado',
        security: [['sanctum' => []]],
        tags: ['Profile'],
        responses: [
            new OA\Response(response: 200, description: 'Datos del perfil'),
            new OA\Response(response: 401, description: 'No autenticado')
        ]
    )]
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->load('perfil');

        return response()->json([
            'success' => true,
            'data' => new UserResource($user),
        ]);
    }

    #[OA\Put(
        path: '/profile',
        summary: 'Actualizar perfil del usuario',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'Juan Pérez'),
                    new OA\Property(property: 'telefono', type: 'string', example: '+593 999 999 999'),
                    new OA\Property(property: 'cargo', type: 'string', example: 'Desarrollador'),
                    new OA\Property(property: 'bio', type: 'string', example: 'Descripción del usuario')
                ]
            )
        ),
        tags: ['Profile'],
        responses: [
            new OA\Response(response: 200, description: 'Perfil actualizado'),
            new OA\Response(response: 401, description: 'No autenticado'),
            new OA\Response(response: 422, description: 'Datos inválidos')
        ]
    )]
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'telefono' => 'sometimes|nullable|string|max:20',
            'cargo' => 'sometimes|nullable|string|max:100',
            'bio' => 'sometimes|nullable|string|max:500',
        ]);

        $dto = UpdateProfileDTO::fromArray($validated);
        $user = $this->updateProfileUseCase->execute($request->user(), $dto);

        return response()->json([
            'success' => true,
            'message' => 'Perfil actualizado exitosamente',
            'data' => new UserResource($user),
        ]);
    }

    #[OA\Post(
        path: '/profile/avatar',
        summary: 'Subir avatar del usuario',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\MediaType(
                mediaType: 'multipart/form-data',
                schema: new OA\Schema(
                    required: ['avatar'],
                    properties: [
                        new OA\Property(
                            property: 'avatar',
                            type: 'string',
                            format: 'binary',
                            description: 'Imagen de avatar (jpg, png, webp, max 2MB)'
                        )
                    ]
                )
            )
        ),
        tags: ['Profile'],
        responses: [
            new OA\Response(response: 200, description: 'Avatar actualizado'),
            new OA\Response(response: 401, description: 'No autenticado'),
            new OA\Response(response: 422, description: 'Archivo inválido')
        ]
    )]
    public function uploadAvatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpg,jpeg,png,webp|max:2048',
        ]);

        $user = $this->uploadAvatarUseCase->execute(
            $request->user(),
            $request->file('avatar')
        );

        return response()->json([
            'success' => true,
            'message' => 'Avatar actualizado exitosamente',
            'data' => new UserResource($user),
        ]);
    }

    #[OA\Delete(
        path: '/profile/avatar',
        summary: 'Eliminar avatar del usuario',
        security: [['sanctum' => []]],
        tags: ['Profile'],
        responses: [
            new OA\Response(response: 200, description: 'Avatar eliminado'),
            new OA\Response(response: 401, description: 'No autenticado')
        ]
    )]
    public function deleteAvatar(Request $request): JsonResponse
    {
        $user = $request->user();
        
        if ($user->perfil && $user->perfil->avatar) {
            // Eliminar archivo
            $oldPath = str_replace('/storage/', 'public/', $user->perfil->avatar);
            \Illuminate\Support\Facades\Storage::delete($oldPath);
            
            // Actualizar perfil
            $user->perfil->update(['avatar' => null]);
        }

        $user->load('perfil');

        return response()->json([
            'success' => true,
            'message' => 'Avatar eliminado exitosamente',
            'data' => new UserResource($user),
        ]);
    }
}
