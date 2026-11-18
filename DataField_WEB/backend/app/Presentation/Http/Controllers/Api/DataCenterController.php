<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Application\DataCenter\ResponseCorrections;
use App\Application\DataCenter\Trash;
use App\Http\Controllers\Controller;
use App\Models\FormResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Centro de datos (solo SUPER_ADMIN): papelera y correcciones de respuestas desde la aplicación, para
 * no tener que entrar a la base de datos. Todo queda en la auditoría con su motivo.
 */
class DataCenterController extends Controller
{
    public function __construct(
        private readonly Trash $trash,
        private readonly ResponseCorrections $corrections,
    ) {}

    public function trash(Request $request, string $type): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        abort_unless(in_array($type, Trash::TYPES, true), 404);

        return response()->json(['data' => $this->trash->list($type)]);
    }

    public function restore(Request $request, string $type, string $id): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        abort_unless(in_array($type, Trash::TYPES, true), 404);

        return response()->json(['message' => $this->trash->restore($type, $id, $request->user())]);
    }

    public function purge(Request $request, string $type, string $id): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        abort_unless(in_array($type, Trash::TYPES, true), 404);

        return response()->json(['message' => $this->trash->purge($type, $id, $request->user())]);
    }

    public function correctAnswer(Request $request, string $responseId): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        $data = $request->validate([
            'question_id' => 'required|uuid',
            'value' => 'present',
            'reason' => 'required|string|min:5|max:500',
        ]);
        $response = $this->corrections->correctAnswer($responseId, $data['question_id'], $data['value'], trim($data['reason']), $request->user());

        return response()->json(['message' => 'Respuesta corregida.', 'data' => $this->present($response)]);
    }

    public function void(Request $request, string $responseId): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        $data = $request->validate(['reason' => 'required|string|min:5|max:500']);
        $this->corrections->void($responseId, trim($data['reason']), $request->user());

        return response()->json(['message' => 'Respuesta anulada. Ya no cuenta en exportes ni estadísticas; puedes restaurarla desde el Centro de datos.']);
    }

    public function collectors(Request $request, string $responseId): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        return response()->json(['data' => $this->corrections->collectorCandidates(FormResponse::findOrFail($responseId))]);
    }

    public function reassign(Request $request, string $responseId): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        $data = $request->validate([
            'user_id' => 'required|integer',
            'reason' => 'required|string|min:5|max:500',
        ]);
        $response = $this->corrections->reassignCollector($responseId, (int) $data['user_id'], trim($data['reason']), $request->user());

        return response()->json(['message' => 'Encuestador actualizado.', 'data' => $this->present($response)]);
    }

    /** @return array<string, mixed> */
    private function present(FormResponse $response): array
    {
        return $response->only(['id', 'form_id', 'user_id', 'data', 'corrections', 'created_at', 'updated_at']);
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        abort_unless($request->user()?->isSuperAdmin(), 403, 'Solo el superadministrador usa el Centro de datos.');
    }
}
