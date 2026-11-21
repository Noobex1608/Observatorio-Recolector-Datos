<?php

declare(strict_types=1);

namespace App\Application\Projects\Services;

use App\Application\Auth\Services\AccountInvitation;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Writer\Xls;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Piezas comunes de las importaciones masivas de encuestadores (equipo del proyecto y «Compartir formulario»):
 * lectura del Excel (.xlsx o .xls), búsqueda de la cuenta existente, alta de cuentas nuevas e invitaciones.
 */
class CollectorImport
{
    public const MAX_ROWS = 500;

    /** Reglas de validación del archivo subido. */
    public const FILE_RULES = ['required', 'file', 'extensions:xlsx,xls', 'max:2048'];

    public function __construct(private readonly AccountInvitation $invitations) {}

    /**
     * Plantilla de Excel (.xls o .xlsx según la extensión de $filename) con el encabezado en negrita y las columnas de texto indicadas (cédula) en formato texto.
     *
     * @param  array<int, string>  $header
     * @param  array<string, int>  $widths  columna => ancho
     * @param  array<int, string>  $textColumns
     * @param  callable(\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet): void|null  $extra
     */
    public function template(string $filename, array $header, array $widths, array $textColumns, ?callable $extra = null): StreamedResponse
    {
        $xls = str_ends_with(strtolower($filename), '.xls');

        return response()->streamDownload(function () use ($header, $widths, $textColumns, $extra, $xls) {
            $book = new Spreadsheet;
            $sheet = $book->getActiveSheet();
            $sheet->fromArray($header, null, 'A1');
            $last = chr(ord('A') + count($header) - 1);
            $sheet->getStyle("A1:{$last}1")->getFont()->setBold(true);
            foreach ($textColumns as $column) {
                $sheet->getStyle("{$column}2:{$column}".(self::MAX_ROWS + 1))->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
            }
            foreach ($widths as $column => $width) {
                $sheet->getColumnDimension($column)->setWidth($width);
            }
            $sheet->freezePane('A2');
            if ($extra) {
                $extra($sheet);
            }
            // El formato .xls (Excel 97-2003) se arma en un archivo temporal antes de enviarlo.
            $path = tempnam(sys_get_temp_dir(), 'tpl');
            ($xls ? new Xls($book) : new Xlsx($book))->save($path);
            $book->disconnectWorksheets();
            readfile($path);
            @unlink($path);
        }, $filename, ['Content-Type' => $xls ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    }

    /**
     * Lee la hoja activa, exige el encabezado de la plantilla y devuelve las filas con datos
     * indexadas por su número de fila en Excel.
     *
     * @param  array<int, string>  $header
     * @return array<int, array<int, string>>
     */
    public function readRows(UploadedFile $file, array $header): array
    {
        try {
            $book = IOFactory::load($file->getRealPath(), 0, [IOFactory::READER_XLSX, IOFactory::READER_XLS]);
            $rows = $book->getActiveSheet()->toArray(null, false, true, false);
            $book->disconnectWorksheets();
        } catch (\Throwable) {
            abort(422, __('El archivo Excel no se pudo leer. Descarga y completa la plantilla oficial.'));
        }
        $width = count($header);
        $found = array_map(fn ($value) => self::normalize((string) $value), array_slice($rows[0] ?? [], 0, $width));
        abort_unless($found === array_map(fn ($value) => self::normalize($value), $header), 422,
            __('Utiliza la plantilla oficial sin cambiar las columnas.'));

        $result = [];
        foreach (array_slice($rows, 1, null, true) as $index => $row) {
            $cells = array_map(fn ($value) => trim((string) $value), array_pad(array_slice($row, 0, $width), $width, ''));
            if (implode('', $cells) !== '') {
                $result[$index + 1] = $cells;
            }
        }
        abort_if(count($result) > self::MAX_ROWS, 422, __('Máximo 500 encuestadores por archivo.'));
        abort_if($result === [], 422, __('La plantilla no contiene encuestadores.'));

        return $result;
    }

    /** Minúsculas sin tildes ni espacios sobrantes: compara encabezados y valores de listas. */
    public static function normalize(string $value): string
    {
        return preg_replace('/\s+/', ' ', Str::ascii(Str::lower(trim($value)))) ?? '';
    }

    /** Excel (sobre todo .xls) guarda la cédula como número y pierde el 0 inicial de las provincias 01 a 09. */
    public static function cedula(string $value): string
    {
        $value = preg_replace('/\s+/', '', $value) ?? '';

        return preg_match('/^[0-9]{9}$/', $value) ? '0'.$value : $value;
    }

    /** @return array<int, string> errores de nombre, cédula y correo de una cuenta nueva */
    public function identityErrors(string $name, string $cedula, string $email): array
    {
        $errors = [];
        if (! preg_match('/^[0-9]{10}$/', $cedula)) {
            $errors[] = __('Cédula: deben ser 10 dígitos.');
        }
        if ($name === '' || mb_strlen($name) > 255) {
            $errors[] = __('Nombres y apellidos obligatorios (máximo 255 caracteres).');
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 255) {
            $errors[] = __('Correo electrónico inválido.');
        }

        return $errors;
    }

    /**
     * Cuenta existente con ese correo o cédula. Devuelve [usuario|null, conflicto]: hay conflicto si el correo
     * y la cédula son de cuentas distintas, o si la cuenta no es un encuestador activo.
     *
     * @return array{0: User|null, 1: bool}
     */
    public function findCollector(string $email, string $cedula): array
    {
        $byEmail = User::withTrashed()->whereRaw('LOWER(email) = ?', [$email])->first();
        $byCedula = $cedula !== '' ? User::withTrashed()->where('cedula', $cedula)->first() : null;
        $existing = $byEmail ?? $byCedula;
        if (! $existing) {
            return [null, false];
        }
        $conflict = ($byEmail && $byCedula && $byEmail->id !== $byCedula->id)
            || $existing->trashed() || ! $existing->is_active || $existing->rol !== User::ROLE_USER
            || strcasecmp($existing->email, $email) !== 0
            || ($cedula !== '' && $existing->cedula && $existing->cedula !== $cedula);

        return [$existing, $conflict];
    }

    /** null = no está en el equipo; true/false = activo o inactivo en el equipo del proyecto. */
    public function membership(Project $project, int $userId): ?bool
    {
        $member = $project->collectors()->whereKey($userId)->first();

        return $member ? (bool) $member->pivot->is_active : null;
    }

    /**
     * Crea la cuenta de un encuestador nuevo. Externos e institucionales con Microsoft 365 quedan en $invited
     * (reciben el correo de confirmación al terminar la transacción); solo si Microsoft no está configurado,
     * los institucionales reciben una contraseña temporal que se devuelve en $credentials.
     *
     * @param  array<int, array{name: string, email: string, password: string}>  $credentials
     * @param  array<int, User>  $invited
     */
    public function createCollector(string $name, string $email, string $cedula, array &$credentials, array &$invited): User
    {
        $temporary = ! $this->invitations->needsInvitation($email) && ! $this->invitations->usesMicrosoft($email);
        $password = $temporary ? Str::random(24) : $this->invitations->placeholderPassword();
        $user = User::create([
            'name' => $name, 'email' => $email, 'cedula' => $cedula,
            'password' => $password, 'rol' => User::ROLE_USER,
            'is_active' => true, 'must_change_password' => $temporary,
        ]);
        if ($temporary) {
            $credentials[] = ['name' => $name, 'email' => $email, 'password' => $password];
        } else {
            $invited[] = $user;
        }

        return $user;
    }

    /** Agrega al equipo del proyecto (activo) si todavía no está. */
    public function ensureMember(Project $project, User $user): void
    {
        if (! $project->collectors()->whereKey($user->id)->exists()) {
            $project->collectors()->attach($user->id, ['is_active' => true]);
        }
    }

    /**
     * Correos de confirmación, fuera de la transacción: un fallo del correo no deshace la importación.
     *
     * @param  array<int, User>  $users
     * @return array<int, string> correos a los que se envió
     */
    public function sendInvitations(array $users): array
    {
        $sent = [];
        foreach ($users as $user) {
            try {
                $this->invitations->send($user);
                $sent[] = $user->email;
            } catch (\Throwable $e) {
                Log::error('No se pudo enviar la invitación', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            }
        }

        return $sent;
    }
}
