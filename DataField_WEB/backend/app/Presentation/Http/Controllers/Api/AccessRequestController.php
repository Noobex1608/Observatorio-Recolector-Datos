<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Application\Auth\Services\InstitutionalEmail;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Bandeja de solicitudes de acceso: personas de ULEAM que entraron con Microsoft 365 sin estar registradas.
 * Un SUPER_ADMIN o ADMIN las aprueba asignando un rol (dentro de los que puede gestionar) o las rechaza.
 */
class AccessRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->canManageUsers(), 403, 'Solo los administradores revisan solicitudes de acceso.');
        $status = $request->query('status') === User::ACCESS_REJECTED ? User::ACCESS_REJECTED : User::ACCESS_PENDING;

        $requests = User::query()
            ->where('access_request_status', $status)
            ->orderByDesc('access_requested_at')
            ->limit(200)
            ->get(['id', 'name', 'email', 'access_request_status', 'access_requested_at']);

        return response()->json([
            'data' => $requests->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'status' => $user->access_request_status,
                'requested_at' => $user->access_requested_at?->toISOString(),
            ]),
            'pending_count' => User::where('access_request_status', User::ACCESS_PENDING)->count(),
        ]);
    }

    public function approve(Request $request, string $id): JsonResponse
    {
        $admin = $request->user();
        abort_unless($admin->canManageUsers(), 403, 'Solo los administradores aprueban solicitudes de acceso.');
        $data = $request->validate(['rol' => ['required', 'string', Rule::in(User::ROLES)]]);
        $user = User::whereNotNull('access_request_status')->findOrFail($id);
        abort_unless($admin->canManageRole($data['rol']), 403, 'No tienes permisos para asignar ese rol.');
        InstitutionalEmail::assertRoleAllowed($user->email, $data['rol']);

        $user->forceFill([
            'rol' => $data['rol'],
            'is_active' => true,
            'access_request_status' => null,
        ])->save();
        AuditLogService::log($admin, 'ACCESS_APPROVED', 'usuarios',
            "{$admin->name} aprobó el acceso de {$user->name} ({$user->email}) con rol {$data['rol']}.", ['user_id' => $user->id]);

        return response()->json(['message' => "Acceso aprobado para {$user->email}. Ya puede entrar con Microsoft."]);
    }

    /**
     * Aprueba varias solicitudes a la vez, cada una con su rol. Todo o nada: si alguna no se puede
     * aprobar (rol no permitido, ya resuelta), no se aprueba ninguna y se dice cuál falló.
     */
    public function approveBatch(Request $request): JsonResponse
    {
        $admin = $request->user();
        abort_unless($admin->canManageUsers(), 403, 'Solo los administradores aprueban solicitudes de acceso.');
        $data = $request->validate([
            'items' => 'required|array|min:1|max:200',
            'items.*.id' => 'required|integer|distinct',
            'items.*.rol' => ['required', 'string', Rule::in(User::ROLES)],
        ]);

        $roles = collect($data['items'])->pluck('rol', 'id');
        $users = DB::transaction(function () use ($admin, $roles) {
            $users = User::whereNotNull('access_request_status')->whereIn('id', $roles->keys())->lockForUpdate()->get();
            $missing = $roles->keys()->diff($users->pluck('id'));
            abort_if($missing->isNotEmpty(), 422, 'Algunas solicitudes ya no están pendientes. Recarga la lista.');
            foreach ($users as $user) {
                $rol = $roles[$user->id];
                abort_unless($admin->canManageRole($rol), 403, "No tienes permisos para asignar el rol {$rol}.");
                InstitutionalEmail::assertRoleAllowed($user->email, $rol);
            }
            foreach ($users as $user) {
                $rol = $roles[$user->id];
                $user->forceFill(['rol' => $rol, 'is_active' => true, 'access_request_status' => null])->save();
                AuditLogService::log($admin, 'ACCESS_APPROVED', 'usuarios',
                    "{$admin->name} aprobó el acceso de {$user->name} ({$user->email}) con rol {$rol}.", ['user_id' => $user->id]);
            }

            return $users;
        });

        $count = $users->count();

        return response()->json([
            'message' => $count === 1
                ? "Acceso aprobado para {$users->first()->email}. Ya puede entrar con Microsoft."
                : "Se aprobaron {$count} solicitudes. Ya pueden entrar con Microsoft.",
            'approved' => $count,
        ]);
    }

    /** Rechaza varias solicitudes pendientes a la vez. */
    public function rejectBatch(Request $request): JsonResponse
    {
        $admin = $request->user();
        abort_unless($admin->canManageUsers(), 403, 'Solo los administradores rechazan solicitudes de acceso.');
        $data = $request->validate(['ids' => 'required|array|min:1|max:200', 'ids.*' => 'required|integer|distinct']);

        $count = DB::transaction(function () use ($admin, $data) {
            $users = User::where('access_request_status', User::ACCESS_PENDING)->whereIn('id', $data['ids'])->lockForUpdate()->get();
            abort_if($users->count() !== count($data['ids']), 422, 'Algunas solicitudes ya no están pendientes. Recarga la lista.');
            foreach ($users as $user) {
                $user->forceFill(['access_request_status' => User::ACCESS_REJECTED, 'is_active' => false])->save();
                $user->tokens()->delete();
                AuditLogService::log($admin, 'ACCESS_REJECTED', 'usuarios',
                    "{$admin->name} rechazó la solicitud de acceso de {$user->name} ({$user->email}).", ['user_id' => $user->id]);
            }

            return $users->count();
        });

        return response()->json(['message' => "Se rechazaron {$count} solicitudes.", 'rejected' => $count]);
    }

    public function reject(Request $request, string $id): JsonResponse
    {
        $admin = $request->user();
        abort_unless($admin->canManageUsers(), 403, 'Solo los administradores rechazan solicitudes de acceso.');
        $user = User::where('access_request_status', User::ACCESS_PENDING)->findOrFail($id);

        $user->forceFill(['access_request_status' => User::ACCESS_REJECTED, 'is_active' => false])->save();
        $user->tokens()->delete();
        AuditLogService::log($admin, 'ACCESS_REJECTED', 'usuarios',
            "{$admin->name} rechazó la solicitud de acceso de {$user->name} ({$user->email}).", ['user_id' => $user->id]);

        return response()->json(['message' => "Solicitud de {$user->email} rechazada."]);
    }
}
