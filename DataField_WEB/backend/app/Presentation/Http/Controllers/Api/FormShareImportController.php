<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Application\Forms\Services\FormShareAccess;
use App\Application\Projects\Services\CollectorImport;
use App\Http\Controllers\Controller;
use App\Models\Form;
use App\Models\FormUserShare;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * «Compartir formulario» en bloque desde Excel (.xlsx o .xls). Cada fila asigna el formulario a una persona;
 * si no tiene cuenta se crea como encuestador, recibe el correo de confirmación y entra al equipo del proyecto.
 */
class FormShareImportController extends Controller
{
    private const HEADER = ['Correo electrónico', 'Nombres y apellidos', 'Cédula', 'Rol', 'Respuestas objetivo (opcional)'];

    private const ROLE_LABELS = ['RECOLECTOR' => 'Recolector', 'PROJECT' => 'Project Manager'];

    public function __construct(
        private readonly CollectorImport $importer,
        private readonly FormShareAccess $access,
    ) {}

    public function template(Request $request, string $id): StreamedResponse
    {
        $this->manageableForm($request, $id);

        return $this->importer->template('plantilla-compartir-formulario.xls', self::HEADER,
            ['A' => 38, 'B' => 34, 'C' => 16, 'D' => 20, 'E' => 30], ['C'],
            function (Worksheet $sheet) {
                $roles = new DataValidation;
                $roles->setType(DataValidation::TYPE_LIST)->setAllowBlank(true)->setShowDropDown(true)
                    ->setShowErrorMessage(true)->setFormula1('"'.implode(',', self::ROLE_LABELS).'"');
                $sheet->setDataValidation('D2:D'.(CollectorImport::MAX_ROWS + 1), $roles);
                $targets = new DataValidation;
                $targets->setType(DataValidation::TYPE_WHOLE)->setOperator(DataValidation::OPERATOR_GREATERTHANOREQUAL)
                    ->setAllowBlank(true)->setShowErrorMessage(true)->setFormula1('1');
                $sheet->setDataValidation('E2:E'.(CollectorImport::MAX_ROWS + 1), $targets);
            });
    }

    /** Con `preview` solo valida y devuelve el estado y los errores de cada fila; sin él, asigna todo o nada. */
    public function import(Request $request, string $id): JsonResponse
    {
        $form = $this->manageableForm($request, $id);
        $data = $request->validate([
            'file' => CollectorImport::FILE_RULES,
            'preview' => ['sometimes', 'boolean'],
        ]);
        $rows = $this->previewRows($form, $this->importer->readRows($data['file'], self::HEADER));
        $hasErrors = collect($rows)->contains(fn ($row) => $row['errors'] !== []);
        if ($request->boolean('preview')) {
            return response()->json(['rows' => $rows, 'valid' => ! $hasErrors]);
        }
        abort_if($hasErrors, 422, __('Corrige las filas señaladas antes de importar.'));

        $project = $form->project;
        $credentials = [];
        $invited = [];
        DB::transaction(function () use ($form, $project, $rows, $request, &$credentials, &$invited) {
            foreach ($rows as $row) {
                $user = User::whereRaw('LOWER(email) = ?', [$row['email']])->first();
                if (! $user) {
                    $user = $this->importer->createCollector($row['name'], $row['email'], $row['cedula'], $credentials, $invited);
                } elseif (! $user->cedula && $row['cedula'] !== '') {
                    $user->update(['cedula' => $row['cedula']]);
                }
                $this->importer->ensureMember($project, $user);
                FormUserShare::updateOrCreate(
                    ['form_id' => $form->id, 'user_id' => $user->id],
                    ['role' => $row['role'], 'target_responses' => $row['role'] === 'RECOLECTOR' ? $row['target_responses'] : null],
                );
                $this->access->forgetArchived($form->id, $user->id);
            }
            AuditLogService::log($request->user(), 'IMPORT_FORM_SHARES', 'permisos', 'Compartió el formulario en bloque desde Excel.', [
                'form_id' => $form->id, 'project_id' => $project->id, 'count' => count($rows),
                'created' => count($credentials) + count($invited),
            ]);
        });

        return response()->json([
            'imported' => count($rows),
            'created' => count($credentials) + count($invited),
            'credentials' => $credentials,
            'invited' => $this->importer->sendInvitations($invited),
        ], 201)->header('Cache-Control', 'no-store');
    }

    /**
     * @param  array<int, array<int, string>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function previewRows(Form $form, array $rows): array
    {
        $project = $form->project;
        $assigned = FormUserShare::where('form_id', $form->id)->pluck('user_id')->map(fn ($userId) => (int) $userId)->all();
        $preview = [];
        $seenEmails = [];
        $seenCedulas = [];
        foreach ($rows as $number => [$email, $name, $cedula, $roleText, $targetText]) {
            $email = Str::lower($email);
            $cedula = CollectorImport::cedula($cedula);
            $role = $this->role($roleText);
            $target = $this->target($targetText);
            $errors = [];

            [$existing, $conflict] = $this->importer->findCollector($email, $cedula);
            if (! $existing) {
                $errors = $this->importer->identityErrors($name, $cedula, $email);
            } elseif (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $errors[] = __('Correo electrónico inválido.');
            }
            if ($existing && $cedula !== '' && ! preg_match('/^[0-9]{10}$/', $cedula)) {
                $errors[] = __('Cédula: deben ser 10 dígitos.');
            }
            if ($role === null) {
                $errors[] = __('Rol: escribe Recolector o Project Manager.');
            }
            if ($target === false) {
                $errors[] = __('Respuestas objetivo: escribe un número entero mayor que 0 o déjalo vacío.');
            } elseif ($target !== null && $role === 'PROJECT') {
                $errors[] = __('Solo los recolectores pueden tener respuestas objetivo');
            }
            if (isset($seenEmails[$email])) {
                $errors[] = __('Correo duplicado en el archivo.');
            }
            if ($cedula !== '' && isset($seenCedulas[$cedula])) {
                $errors[] = __('Cédula duplicada en el archivo.');
            }
            $seenEmails[$email] = true;
            if ($cedula !== '') {
                $seenCedulas[$cedula] = true;
            }

            $status = 'nuevo';
            if ($conflict) {
                $errors[] = __('Correo o cédula ya pertenece a otra cuenta.');
            } elseif ($existing) {
                $status = in_array((int) $existing->id, $assigned, true) ? 'asignado' : 'existente';
                if ((int) $existing->id === (int) $form->user_id) {
                    $errors[] = __('No puedes compartir el formulario contigo mismo');
                } elseif ($this->importer->membership($project, $existing->id) === false) {
                    $errors[] = __('Está inactivo en el equipo del proyecto. Actívalo en «Formularios y miembros» antes de asignarle formularios.');
                }
            }
            $preview[] = [
                'row' => $number, 'email' => $email, 'name' => $existing && ! $conflict ? $existing->name : $name,
                'cedula' => $cedula, 'role' => $role ?? $roleText, 'target_responses' => $role === 'RECOLECTOR' && is_int($target) ? $target : null,
                'status' => $status, 'errors' => $errors,
            ];
        }

        return $preview;
    }

    /** Vacío = Recolector. Acepta la etiqueta de la plantilla o el código, sin distinguir mayúsculas ni tildes. */
    private function role(string $value): ?string
    {
        return match (CollectorImport::normalize($value)) {
            '', 'recolector', 'encuestador', 'collector' => 'RECOLECTOR',
            'project manager', 'project', 'editor' => 'PROJECT',
            default => null,
        };
    }

    /** null = sin meta; false = valor inválido. */
    private function target(string $value): int|false|null
    {
        if ($value === '') {
            return null;
        }
        if (! preg_match('/^[0-9]+(\.0+)?$/', $value) || (int) $value < 1 || (int) $value > 1000000) {
            return false;
        }

        return (int) $value;
    }

    private function manageableForm(Request $request, string $id): Form
    {
        $form = Form::with('project')->findOrFail($id);
        $user = $request->user();
        abort_unless($user->isSuperAdmin() || $user->isAdmin() || $user->leadsProject($form->project_id), 403,
            __('No tienes permisos para gestionar accesos de este formulario'));
        abort_unless($form->project !== null, 422, __('El formulario no pertenece a un proyecto activo.'));

        return $form;
    }
}
