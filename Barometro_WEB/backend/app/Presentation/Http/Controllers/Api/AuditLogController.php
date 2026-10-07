<?php

namespace App\Presentation\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Form;
use App\Models\FormUserShare;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;

#[OA\Tag(name: 'Audit', description: 'Logs de auditoria y control de datos para SuperAdministrador en lenguaje natural')]
class AuditLogController extends Controller
{
    /**
     * List audit logs with pagination and filters.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->isSuperAdmin()) {
            return response()->json(['message' => 'Acceso restringido unicamente a SuperAdministradores'], 403);
        }

        $query = AuditLog::with('user:id,name,email,rol')->latest();

        if ($request->filled('module')) {
            $query->where('module', strtolower($request->query('module')));
        }

        if ($request->filled('action')) {
            $query->where('action', strtoupper($request->query('action')));
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->query('user_id'));
        }

        if ($request->filled('search')) {
            $search = '%' . trim($request->query('search')) . '%';
            $query->where(function ($q) use ($search) {
                $q->where('description_es', 'like', $search)
                  ->orWhere('user_name', 'like', $search)
                  ->orWhere('user_email', 'like', $search)
                  ->orWhere('action', 'like', $search);
            });
        }

        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->query('date_from'));
        }

        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->query('date_to'));
        }

        $perPage = max(1, min((int) $request->query('per_page', 20), 100));
        $logs = $query->paginate($perPage);

        return response()->json([
            'data' => $logs->items(),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
        ]);
    }

    /**
     * Get statistics and charts data for audit logs.
     */
    public function getStats(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->isSuperAdmin()) {
            return response()->json(['message' => 'Acceso restringido unicamente a SuperAdministradores'], 403);
        }

        $totalLogs = AuditLog::count();
        $totalDownloads = AuditLog::where('module', 'descargas')->count();
        $totalPermissionChanges = AuditLog::where('module', 'permisos')->count();
        $totalDataModifications = AuditLog::whereIn('module', ['formularios', 'proyectos', 'usuarios'])->count();

        // Total exported responses count from metadata
        $totalResponsesExported = (int) AuditLog::where('action', 'EXPORT_DATA')
            ->selectRaw("SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.responses_count')) AS UNSIGNED)) as total")
            ->value('total') ?? 0;

        // Breakdown by module
        $byModule = AuditLog::select('module', DB::raw('count(*) as count'))
            ->groupBy('module')
            ->get()
            ->pluck('count', 'module');

        // Formats downloaded
        $byFormat = AuditLog::where('action', 'EXPORT_DATA')
            ->select(DB::raw("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.format')) as format"), DB::raw('count(*) as count'))
            ->groupBy('format')
            ->get()
            ->pluck('count', 'format');

        // Top active users
        $topUsers = AuditLog::select('user_name', 'user_email', 'user_role', DB::raw('count(*) as actions_count'))
            ->groupBy('user_name', 'user_email', 'user_role')
            ->orderByDesc('actions_count')
            ->limit(5)
            ->get();

        // Recent 7 days activity
        $recentActivity = AuditLog::select(
                DB::raw("DATE(created_at) as date"),
                DB::raw("count(*) as total"),
                DB::raw("SUM(CASE WHEN module = 'descargas' THEN 1 ELSE 0 END) as descargas"),
                DB::raw("SUM(CASE WHEN module = 'permisos' THEN 1 ELSE 0 END) as permisos"),
                DB::raw("SUM(CASE WHEN module IN ('formularios', 'proyectos', 'usuarios') THEN 1 ELSE 0 END) as modificaciones")
            )
            ->where('created_at', '>=', now()->subDays(7))
            ->groupBy(DB::raw("DATE(created_at)"))
            ->orderBy('date', 'asc')
            ->get();

        return response()->json([
            'summary' => [
                'total_logs' => $totalLogs,
                'total_downloads' => $totalDownloads,
                'total_responses_exported' => $totalResponsesExported,
                'total_permission_changes' => $totalPermissionChanges,
                'total_data_modifications' => $totalDataModifications,
            ],
            'by_module' => $byModule,
            'by_format' => $byFormat,
            'top_users' => $topUsers,
            'recent_activity' => $recentActivity,
        ]);
    }

    /**
     * Get summary matrix of permissions (who has access to what).
     */
    public function getPermissionsSummary(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->isSuperAdmin()) {
            return response()->json(['message' => 'Acceso restringido unicamente a SuperAdministradores'], 403);
        }

        // List all users with their roles
        $users = User::select('id', 'name', 'email', 'rol', 'is_active', 'created_at')
            ->orderBy('name')
            ->get()
            ->map(function ($u) {
                return [
                    'id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                    'rol' => $u->rol,
                    'rol_label' => \App\Services\AuditLogService::getRoleLabel($u->rol),
                    'is_active' => (bool) $u->is_active,
                ];
            });

        // Form shares (Explicit permissions given per form)
        $formShares = FormUserShare::with(['form:id,title,state,project_id', 'user:id,name,email,rol'])
            ->get()
            ->map(function ($share) {
                return [
                    'id' => $share->id,
                    'form_id' => $share->form_id,
                    'form_title' => $share->form->title ?? 'N/A',
                    'user_id' => $share->user_id,
                    'user_name' => $share->user->name ?? 'N/A',
                    'user_email' => $share->user->email ?? 'N/A',
                    'granted_role' => $share->role,
                    'granted_role_label' => \App\Services\AuditLogService::getRoleLabel($share->role),
                    'target_responses' => $share->target_responses,
                ];
            });

        // Projects & project leaders
        $projects = Project::with(['leaders:id,name,email', 'forms:id,title,state,project_id'])
            ->get()
            ->map(function ($proj) {
                return [
                    'id' => $proj->id,
                    'name' => $proj->name,
                    'description' => $proj->description,
                    'leaders' => $proj->leaders->map(fn($l) => ['id' => $l->id, 'name' => $l->name, 'email' => $l->email]),
                    'forms_count' => $proj->forms->count(),
                ];
            });

        return response()->json([
            'users' => $users,
            'shares' => $formShares,
            'projects' => $projects,
        ]);
    }
}
