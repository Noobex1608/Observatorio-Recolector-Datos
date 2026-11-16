<?php

namespace App\Presentation\Http\Controllers\Api;

use App\Application\Forms\Services\FormShareAccess;
use App\Http\Controllers\Controller;
use App\Models\FormUserShare;
use App\Models\Project;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProjectCollectorController extends Controller
{
    private function managedProject(Request $request, string $id): Project
    {
        $project = Project::findOrFail($id);
        abort_unless($request->user()->canManageProjects() || $request->user()->leadsProject($id), 403);

        return $project;
    }

    public function template(Request $request, string $id): StreamedResponse
    {
        $this->managedProject($request, $id);

        return response()->streamDownload(function () {
            $sheet = new Spreadsheet;
            $sheet->getActiveSheet()->fromArray(['Cédula', 'Nombres', 'Apellidos', 'Correo electrónico'], null, 'A1');
            $sheet->getActiveSheet()->getStyle('A1:D1')->getFont()->setBold(true);
            $sheet->getActiveSheet()->getStyle('A2:A501')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
            foreach (['A' => 18, 'B' => 28, 'C' => 28, 'D' => 38] as $column => $width) {
                $sheet->getActiveSheet()->getColumnDimension($column)->setWidth($width);
            }
            (new Xlsx($sheet))->save('php://output');
            $sheet->disconnectWorksheets();
        }, 'plantilla-encuestadores.xlsx', ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    }

    /**
     * Equipo de encuestadores del proyecto. Con `page` devuelve una página ({data, pagination});
     * sin `page`, la lista completa (la usa el selector de encuestadores de las zonas).
     * `q` busca por nombre, correo o cédula.
     */
    public function index(Request $request, string $id): JsonResponse
    {
        $project = $this->managedProject($request, $id);
        $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $query = $this->searchCollectors($project, (string) $request->query('q', ''))
            ->orderBy('users.name')->select(['users.id', 'users.name', 'users.email', 'users.cedula', 'users.rol']);

        if (! $request->has('page')) {
            return response()->json($this->collectorRows($project, $query->get()));
        }

        $page = $query->paginate((int) $request->query('per_page', 25));

        return response()->json([
            'data' => $this->collectorRows($project, collect($page->items())),
            'pagination' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /** IDs de los encuestadores activos que coinciden con la búsqueda: "Seleccionar todos" en todas las páginas. */
    public function ids(Request $request, string $id): JsonResponse
    {
        $project = $this->managedProject($request, $id);
        $request->validate(['q' => ['nullable', 'string', 'max:100']]);

        return response()->json($this->searchCollectors($project, (string) $request->query('q', ''))
            ->wherePivot('is_active', true)->pluck('users.id')->map(fn ($userId) => (int) $userId)->values());
    }

    /** Usuarios encuestadores activos del sistema que todavía no están en el equipo del proyecto. */
    public function candidates(Request $request, string $id): JsonResponse
    {
        $project = $this->managedProject($request, $id);
        $request->validate(['q' => ['nullable', 'string', 'max:100']]);
        $term = trim((string) $request->query('q', ''));

        $users = User::query()
            ->where('rol', User::ROLE_USER)->where('is_active', true)
            ->whereNotIn('id', $project->collectors()->select('users.id'))
            ->when($term !== '', fn ($q) => $this->whereMatches($q, $term, ''))
            ->orderBy('name')->limit(30)
            ->get(['id', 'name', 'email', 'cedula']);

        return response()->json($users);
    }

    /** Agrega usuarios encuestadores ya existentes al equipo del proyecto (activos). */
    public function attach(Request $request, string $id): JsonResponse
    {
        $project = $this->managedProject($request, $id);
        $data = $request->validate([
            'user_ids' => ['required', 'array', 'min:1', 'max:500'],
            'user_ids.*' => ['integer', 'distinct'],
        ]);
        $users = User::whereIn('id', $data['user_ids'])->where('rol', User::ROLE_USER)->where('is_active', true)->pluck('id');
        abort_unless($users->count() === count($data['user_ids']), 422, 'Solo se pueden agregar usuarios encuestadores activos.');
        $already = $project->collectors()->whereIn('users.id', $users)->pluck('users.id');
        abort_if($already->isNotEmpty(), 422, 'Algunos usuarios ya pertenecen a este proyecto.');

        DB::transaction(function () use ($project, $users, $request) {
            $project->collectors()->attach($users->mapWithKeys(fn ($userId) => [$userId => ['is_active' => true]])->all());
            AuditLogService::log($request->user(), 'ADD_COLLECTORS', 'proyectos', 'Agregó encuestadores existentes al proyecto.',
                ['project_id' => $project->id, 'user_ids' => $users->all()]);
        });

        return response()->json(['added' => $users->count()]);
    }

    private function searchCollectors(Project $project, string $term)
    {
        $term = trim($term);

        return $project->collectors()->when($term !== '', fn ($q) => $this->whereMatches($q, $term, 'users.'));
    }

    /** Búsqueda sin distinguir mayúsculas por nombre, correo o cédula. */
    private function whereMatches($query, string $term, string $prefix)
    {
        $like = '%'.mb_strtolower(str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term)).'%';

        return $query->where(fn ($q) => $q->whereRaw("LOWER({$prefix}name) LIKE ?", [$like])
            ->orWhereRaw("LOWER({$prefix}email) LIKE ?", [$like])
            ->orWhere("{$prefix}cedula", 'like', $like));
    }

    /** Filas de la tabla con los formularios de cada encuestador en una sola consulta (antes, una por persona). */
    private function collectorRows(Project $project, $users): array
    {
        $formIdsByUser = FormUserShare::whereIn('form_id', $project->forms()->select('id'))
            ->whereIn('user_id', $users->pluck('id'))
            ->get(['form_id', 'user_id'])
            ->groupBy('user_id');

        return $users->map(fn (User $user) => [
            'id' => $user->id, 'name' => $user->name, 'email' => $user->email,
            'cedula' => $user->cedula, 'is_active' => (bool) $user->pivot->is_active,
            'form_ids' => ($formIdsByUser[$user->id] ?? collect())->pluck('form_id')->values(),
        ])->values()->all();
    }

    public function import(Request $request, string $id): JsonResponse
    {
        $project = $this->managedProject($request, $id);
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx', 'max:2048'],
            'preview' => ['sometimes', 'boolean'],
        ]);
        try {
            $spreadsheet = IOFactory::load($data['file']->getRealPath());
            $rows = $spreadsheet->getActiveSheet()->toArray(null, false, true, false);
            $spreadsheet->disconnectWorksheets();
        } catch (\Throwable) {
            abort(422, 'El archivo Excel no se pudo leer. Descarga y completa la plantilla oficial.');
        }
        abort_if(count($rows) > 501, 422, 'Máximo 500 encuestadores por archivo.');
        $header = array_map(fn ($value) => Str::ascii(Str::lower(trim((string) $value))), array_slice($rows[0] ?? [], 0, 4));
        abort_unless($header === ['cedula', 'nombres', 'apellidos', 'correo electronico'], 422, 'Utiliza la plantilla oficial sin cambiar las columnas.');

        $preview = [];
        $seenEmails = [];
        $seenCedulas = [];
        foreach (array_slice($rows, 1, null, true) as $index => $row) {
            if (count(array_filter(array_slice($row, 0, 4), fn ($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }
            $cedula = trim((string) ($row[0] ?? ''));
            $nombres = trim((string) ($row[1] ?? ''));
            $apellidos = trim((string) ($row[2] ?? ''));
            $email = Str::lower(trim((string) ($row[3] ?? '')));
            $errors = [];
            if (! preg_match('/^[0-9]{10}$/', $cedula)) {
                $errors[] = 'Cédula: deben ser 10 dígitos.';
            }
            if ($nombres === '' || $apellidos === '' || mb_strlen($nombres.' '.$apellidos) > 255) {
                $errors[] = 'Nombres y apellidos obligatorios (máximo 255 caracteres).';
            }
            if (! filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 255) {
                $errors[] = 'Correo electrónico inválido.';
            }
            if (isset($seenEmails[$email])) {
                $errors[] = 'Correo duplicado en el archivo.';
            }
            if (isset($seenCedulas[$cedula])) {
                $errors[] = 'Cédula duplicada en el archivo.';
            }
            $seenEmails[$email] = true;
            $seenCedulas[$cedula] = true;
            $existingByEmail = User::withTrashed()->whereRaw('LOWER(email) = ?', [$email])->first();
            $existingByCedula = User::withTrashed()->where('cedula', $cedula)->first();
            $existing = $existingByEmail ?? $existingByCedula;
            $status = 'nuevo';
            if ($existing) {
                if (($existingByEmail && $existingByCedula && $existingByEmail->id !== $existingByCedula->id)
                    || $existing->trashed() || ! $existing->is_active || $existing->rol !== User::ROLE_USER
                    || strcasecmp($existing->email, $email) !== 0 || ($existing->cedula && $existing->cedula !== $cedula)) {
                    $errors[] = 'Correo o cédula ya pertenece a otra cuenta.';
                } elseif ($project->collectors()->whereKey($existing->id)->exists()) {
                    $errors[] = 'Ya pertenece a este proyecto.';
                } else {
                    $status = 'existente';
                }
            }
            $preview[] = ['row' => $index + 1, 'cedula' => $cedula, 'name' => trim($nombres.' '.$apellidos), 'email' => $email, 'status' => $status, 'errors' => $errors];
        }
        abort_if(count($preview) === 0, 422, 'La plantilla no contiene encuestadores.');
        $hasErrors = collect($preview)->contains(fn ($row) => count($row['errors']) > 0);
        if ($request->boolean('preview')) {
            return response()->json(['rows' => $preview, 'valid' => ! $hasErrors]);
        }
        abort_if($hasErrors, 422, 'Corrige las filas señaladas antes de importar.');

        $credentials = [];
        DB::transaction(function () use ($project, $preview, $request, &$credentials) {
            foreach ($preview as $row) {
                $user = User::whereRaw('LOWER(email) = ?', [$row['email']])->first();
                if (! $user) {
                    $password = Str::random(24);
                    $user = User::create([
                        'name' => $row['name'], 'email' => $row['email'], 'cedula' => $row['cedula'],
                        'password' => $password, 'rol' => User::ROLE_USER,
                        'is_active' => true, 'must_change_password' => true,
                    ]);
                    $credentials[] = ['name' => $row['name'], 'email' => $row['email'], 'password' => $password];
                } elseif (! $user->cedula) {
                    $user->update(['cedula' => $row['cedula']]);
                }
                $project->collectors()->attach($user->id, ['is_active' => true]);
            }
            AuditLogService::log($request->user(), 'IMPORT_COLLECTORS', 'proyectos',
                'Importó encuestadores al proyecto.', ['project_id' => $project->id, 'count' => count($preview)]);
        });

        return response()->json(['imported' => count($preview), 'credentials' => $credentials], 201)
            ->header('Cache-Control', 'no-store');
    }

    public function update(Request $request, string $id, int $userId): JsonResponse
    {
        $project = $this->managedProject($request, $id);
        $user = $project->collectors()->whereKey($userId)->firstOrFail();
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'cedula' => ['sometimes', 'regex:/^[0-9]{10}$/', Rule::unique('users', 'cedula')->ignore($user->id)],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        DB::transaction(function () use ($project, $user, $data, $request) {
            $user->fill(array_intersect_key($data, array_flip(['name', 'email', 'cedula'])))->save();
            if (array_key_exists('is_active', $data)) {
                $project->collectors()->updateExistingPivot($user->id, ['is_active' => $data['is_active']]);
                if (! $data['is_active']) {
                    $this->removeAssignments($project, $user->id);
                }
            }
            AuditLogService::log($request->user(), 'UPDATE_COLLECTOR', 'proyectos', 'Actualizó encuestador del proyecto.',
                ['project_id' => $project->id, 'user_id' => $user->id]);
        });

        return response()->json(['message' => 'Encuestador actualizado.']);
    }

    public function destroy(Request $request, string $id, int $userId): JsonResponse
    {
        $project = $this->managedProject($request, $id);
        $project->collectors()->whereKey($userId)->firstOrFail();
        DB::transaction(function () use ($project, $userId, $request) {
            $this->removeAssignments($project, $userId);
            $project->collectors()->detach($userId);
            AuditLogService::log($request->user(), 'REMOVE_COLLECTOR', 'proyectos', 'Quitó encuestador del proyecto.',
                ['project_id' => $project->id, 'user_id' => $userId]);
        });

        return response()->json(null, 204);
    }

    public function assignForms(Request $request, string $id): JsonResponse
    {
        $project = $this->managedProject($request, $id);
        $data = $request->validate([
            'user_ids' => ['required', 'array', 'min:1'], 'user_ids.*' => ['integer', 'distinct'],
            'form_ids' => ['required', 'array', 'min:1'], 'form_ids.*' => ['uuid', 'distinct'],
        ]);
        $members = $project->collectors()->wherePivot('is_active', true)->whereIn('users.id', $data['user_ids'])->pluck('users.id');
        $forms = $project->forms()->whereIn('id', $data['form_ids'])->pluck('id');
        abort_unless($members->count() === count($data['user_ids']) && $forms->count() === count($data['form_ids']), 422,
            'Selecciona solo encuestadores activos y formularios de este proyecto.');
        $created = 0;
        DB::transaction(function () use ($members, $forms, &$created, $request, $project) {
            foreach ($forms as $formId) {
                foreach ($members as $userId) {
                    $share = app(FormShareAccess::class)->grant($formId, (int) $userId);
                    if ($share->wasRecentlyCreated) {
                        $created++;
                    }
                }
            }
            AuditLogService::log($request->user(), 'ASSIGN_COLLECTORS', 'permisos', 'Asignó formularios a encuestadores.',
                ['project_id' => $project->id, 'created' => $created]);
        });

        return response()->json(['assigned' => $created]);
    }

    private function removeAssignments(Project $project, int $userId): void
    {
        // Las metas personales quedan archivadas como borrador inactivo por si vuelve al proyecto.
        foreach ($project->forms()->pluck('id') as $formId) {
            app(FormShareAccess::class)->revoke($formId, [$userId]);
        }
        FormUserShare::whereIn('form_id', $project->forms()->select('id'))->where('user_id', $userId)->delete();
        DB::table('project_zone_user_assignments')->where('user_id', $userId)
            ->whereIn('zone_id', $project->zones()->select('id'))->delete();
    }
}
