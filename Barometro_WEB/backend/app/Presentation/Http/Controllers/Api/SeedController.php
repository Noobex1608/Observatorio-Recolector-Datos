<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Database\Seeders\AdminUserSeeder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

#[OA\Tag(name: 'Seed', description: 'Endpoints para inicializar credenciales del sistema')]
class SeedController extends Controller
{
    #[OA\Post(
        path: '/seed/admin',
        summary: 'Crear usuario super admin inicial',
        tags: ['Seed'],
        parameters: [
            new OA\Parameter(
                name: 'X-Seed-Token',
                in: 'header',
                required: true,
                description: 'Token de seguridad para ejecutar seeders',
                schema: new OA\Schema(type: 'string')
            )
        ],
        responses: [
            new OA\Response(response: 200, description: 'Usuario super admin creado'),
            new OA\Response(response: 403, description: 'Token invalido')
        ]
    )]
    public function seedAdmin(Request $request): JsonResponse
    {
        if (!$this->validateSeedToken($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Token de seguridad invalido',
            ], 403);
        }

        if (empty(env('ADMIN_EMAIL')) || empty(env('ADMIN_PASSWORD'))) {
            return response()->json([
                'success' => false,
                'message' => 'Configura ADMIN_EMAIL y ADMIN_PASSWORD en .env',
            ], 400);
        }

        try {
            $seeder = new AdminUserSeeder();
            $seeder->setCommand($this->createFakeCommand());
            $seeder->run();

            return response()->json([
                'success' => true,
                'message' => 'Usuario super admin creado exitosamente',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al crear usuario super admin: ' . $e->getMessage(),
            ], 500);
        }
    }

    private function validateSeedToken(Request $request): bool
    {
        $token = $request->header('X-Seed-Token');
        $expectedToken = env('SEED_TOKEN');

        return !empty($expectedToken) && $token === $expectedToken;
    }

    private function createFakeCommand(): \Illuminate\Console\Command
    {
        return new class extends \Illuminate\Console\Command {
            public function info($string, $verbosity = null) {}
            public function error($string, $verbosity = null) {}
        };
    }
}
