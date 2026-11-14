<?php

declare(strict_types=1);

namespace App\Application\Forms\Services;

use App\Models\FormUserShare;
use Illuminate\Support\Facades\DB;

/**
 * Da y retira el acceso de recolector a un formulario conservando su meta personal.
 * Al retirarlo, la meta queda como borrador inactivo en form_user_share_archives (no da permisos);
 * al volver a darlo, se restaura sola.
 */
class FormShareAccess
{
    private const ARCHIVE = 'form_user_share_archives';

    /** Devuelve el acceso existente o lo crea restaurando la meta archivada, si la hay. */
    public function grant(string $formId, int $userId): FormUserShare
    {
        $share = FormUserShare::where('form_id', $formId)->where('user_id', $userId)->first();
        if ($share) {
            return $share;
        }
        $archived = DB::table(self::ARCHIVE)->where('form_id', $formId)->where('user_id', $userId)->first();
        $share = FormUserShare::create([
            'form_id' => $formId, 'user_id' => $userId, 'role' => 'RECOLECTOR',
            'target_responses' => $archived?->target_responses,
        ]);
        if ($archived) {
            DB::table(self::ARCHIVE)->where('id', $archived->id)->delete();
        }

        return $share;
    }

    /**
     * Retira el acceso de recolector y archiva su meta.
     *
     * @param  array<int, int|string>  $userIds
     */
    public function revoke(string $formId, array $userIds): void
    {
        $userIds = array_values(array_unique(array_map('intval', $userIds)));
        if ($userIds === []) {
            return;
        }
        $shares = FormUserShare::where('form_id', $formId)->whereIn('user_id', $userIds)
            ->where('role', 'RECOLECTOR')->get();
        foreach ($shares as $share) {
            DB::table(self::ARCHIVE)->updateOrInsert(
                ['form_id' => $formId, 'user_id' => $share->user_id],
                ['role' => $share->role, 'target_responses' => $share->target_responses,
                    'archived_at' => now(), 'created_at' => now(), 'updated_at' => now()],
            );
            $share->delete();
        }
    }

    /** Una asignación manual con meta explícita reemplaza a la meta archivada. */
    public function forgetArchived(string $formId, int $userId): void
    {
        DB::table(self::ARCHIVE)->where('form_id', $formId)->where('user_id', $userId)->delete();
    }
}
