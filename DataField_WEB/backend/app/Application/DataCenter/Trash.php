<?php

declare(strict_types=1);

namespace App\Application\DataCenter;

use App\Application\Forms\Services\EnqueueFormSchemaSync;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Papelera del Centro de datos: proyectos, formularios y zonas eliminados (borrado suave) y respuestas
 * anuladas. El superadministrador los restaura o, salvo las respuestas, los elimina definitivamente.
 */
final class Trash
{
    public const TYPES = ['projects', 'forms', 'zones', 'responses'];

    private const LIMIT = 200;

    public function __construct(private readonly EnqueueFormSchemaSync $formSync) {}

    /** @return list<array<string, mixed>> */
    public function list(string $type): array
    {
        $items = match ($type) {
            'projects' => Project::onlyTrashed()->withCount(['forms' => fn ($q) => $q->withTrashed()])
                ->latest('deleted_at')->limit(self::LIMIT)->get()
                ->map(fn (Project $p) => [
                    'id' => $p->id, 'name' => $p->name, 'context' => $p->forms_count > 0 ? "{$p->forms_count} formulario(s) en la papelera" : null,
                    'deleted_at' => $p->deleted_at, 'deleted_by' => $p->deleted_by,
                ]),
            'forms' => Form::onlyTrashed()->with(['project' => fn ($q) => $q->withTrashed()])->withCount('responses')
                ->latest('deleted_at')->limit(self::LIMIT)->get()
                ->map(fn (Form $f) => [
                    'id' => $f->id, 'name' => $f->title,
                    'context' => trim(($f->project ? __('Proyecto «:name»', ['name' => $f->project->name]) : '').' · '.__(':count respuesta(s)', ['count' => $f->responses_count]), ' ·'),
                    'deleted_at' => $f->deleted_at, 'deleted_by' => $f->deleted_by,
                ]),
            'zones' => ProjectZone::onlyTrashed()->with(['project' => fn ($q) => $q->withTrashed(), 'form' => fn ($q) => $q->withTrashed()])
                ->latest('deleted_at')->limit(self::LIMIT)->get()
                ->map(fn (ProjectZone $z) => [
                    'id' => $z->id, 'name' => $z->name,
                    'context' => implode(' · ', array_filter([
                        $z->project ? __('Proyecto «:name»', ['name' => $z->project->name]) : null,
                        $z->form ? __('Formulario «:title»', ['title' => $z->form->title]) : null,
                    ])),
                    'deleted_at' => $z->deleted_at, 'deleted_by' => $z->deleted_by,
                ]),
            'responses' => FormResponse::onlyTrashed()->with(['form' => fn ($q) => $q->withTrashed(), 'user' => fn ($q) => $q->withTrashed()])
                ->latest('deleted_at')->limit(self::LIMIT)->get()
                ->map(fn (FormResponse $r) => [
                    'id' => $r->id,
                    'name' => __('Respuesta del :date', ['date' => $r->created_at?->timezone('America/Guayaquil')->format('d/m/Y H:i')]),
                    'context' => implode(' · ', array_filter([
                        $r->form ? __('Formulario «:title»', ['title' => $r->form->title]) : null,
                        $r->user ? __('Encuestador :name', ['name' => $r->user->name]) : __('Enlace público'),
                    ])),
                    'reason' => $r->void_reason,
                    'deleted_at' => $r->deleted_at, 'deleted_by' => $r->voided_by,
                ]),
        };

        $names = User::withTrashed()->whereIn('id', $items->pluck('deleted_by')->filter()->unique())->pluck('name', 'id');

        return $items->map(fn (array $item) => [
            ...$item,
            'deleted_at' => $item['deleted_at']?->toISOString(),
            'deleted_by' => $item['deleted_by'] ? ($names[$item['deleted_by']] ?? null) : null,
            'can_purge' => $type !== 'responses',
        ])->values()->all();
    }

    public function restore(string $type, string $id, User $admin): string
    {
        return DB::transaction(function () use ($type, $id, $admin) {
            $model = $this->find($type, $id);
            $label = $this->label($type, $model);

            if ($model instanceof Form) {
                abort_if(Project::onlyTrashed()->whereKey($model->project_id)->exists(), 422,
                    __('Su proyecto está en la papelera: restaura primero el proyecto.'));
            }
            if ($model instanceof ProjectZone) {
                abort_if(Project::onlyTrashed()->whereKey($model->project_id)->exists(), 422,
                    __('Su proyecto está en la papelera: restaura primero el proyecto.'));
                abort_if($model->form_id && Form::onlyTrashed()->whereKey($model->form_id)->exists(), 422,
                    __('Su formulario está en la papelera: restaura primero el formulario.'));
            }
            if ($model instanceof FormResponse) {
                abort_if(Form::onlyTrashed()->whereKey($model->form_id)->exists(), 422,
                    __('Su formulario está en la papelera: restaura primero el formulario.'));
                $model->forceFill([
                    'void_reason' => null, 'voided_by' => null,
                    'corrections' => [...($model->corrections ?? []), [
                        'type' => 'restore', 'reason' => 'Anulación revertida', 'by_id' => $admin->id, 'by' => $admin->name, 'at' => now()->toIso8601String(),
                    ]],
                ]);
            } else {
                $model->forceFill(['deleted_by' => null]);
            }
            $model->restore();

            if ($model instanceof Form) {
                $this->formSync->enqueue($model);
            }
            AuditLogService::log($admin, 'RESTORE_'.strtoupper(rtrim($type, 's')), 'centro-de-datos',
                match ($type) {
                    'projects' => 'Restauró el proyecto «:name» desde el Centro de datos.',
                    'forms' => 'Restauró el formulario «:name» desde el Centro de datos.',
                    'zones' => 'Restauró la zona «:name» desde el Centro de datos.',
                    'responses' => 'Restauró la respuesta desde el Centro de datos.',
                }, ['type' => $type, 'id' => $id], params: ['name' => $this->itemName($type, $model)]);

            if (app()->getLocale() === 'en') {
                return $type === 'zones'
                    ? "Zone “{$model->name}” restored. Assign collectors to it again."
                    : $this->englishLabel($type, $model).' restored.';
            }

            return $type === 'zones'
                ? "Zona «{$model->name}» restaurada. Vuelve a asignarle encuestadores."
                : ucfirst($label).' restaurado'.($type === 'responses' ? 'a' : '').'.';
        });
    }

    /**
     * Borrado definitivo. Un formulario se lleva sus preguntas, respuestas (también las anuladas),
     * trazas GPS y asignaciones; por eso exige escribir su nombre exacto (`$confirm`) y, tras confirmar
     * la transacción, borra sus fotos, audios y videos del almacenamiento para no dejarlos huérfanos.
     */
    public function purge(string $type, string $id, User $admin, ?string $confirm = null): string
    {
        abort_if($type === 'responses', 422, __('Las respuestas anuladas se conservan como registro; puedes restaurarlas.'));

        $media = [];
        $message = DB::transaction(function () use ($type, $id, $admin, $confirm, &$media) {
            $model = $this->find($type, $id);
            $label = $this->label($type, $model);
            $context = [];
            if ($model instanceof Project) {
                abort_if(Form::withTrashed()->where('project_id', $model->id)->exists(), 422,
                    __('El proyecto tiene formularios en la papelera: elimínalos definitivamente primero.'));
            }
            if ($model instanceof Form) {
                abort_unless(trim((string) $confirm) === trim((string) $model->title), 422,
                    __('Para eliminarlo definitivamente escribe el nombre exacto del formulario.'));
                $media = $this->mediaOf($model);
                $context = [
                    'responses' => FormResponse::withTrashed()->where('form_id', $model->id)->count(),
                    'media_files' => count($media),
                ];
            }

            AuditLogService::log($admin, 'PURGE_'.strtoupper(rtrim($type, 's')), 'centro-de-datos',
                match ($type) {
                    'projects' => 'Eliminó definitivamente el proyecto «:name» desde el Centro de datos.',
                    'forms' => $context
                        ? 'Eliminó definitivamente el formulario «:name» desde el Centro de datos. Incluía :responses respuesta(s) y :media_files archivo(s).'
                        : 'Eliminó definitivamente el formulario «:name» desde el Centro de datos.',
                    'zones' => 'Eliminó definitivamente la zona «:name» desde el Centro de datos.',
                },
                ['type' => $type, 'id' => $id, ...$context], params: ['name' => $this->itemName($type, $model), ...$context]);
            $model->forceDelete();

            return app()->getLocale() === 'en'
                ? $this->englishLabel($type, $model).' permanently deleted.'
                : ucfirst($label).' eliminado definitivamente.';
        });

        // Los archivos se borran después de confirmar la base: si algo falla aquí, los datos ya no existen
        // y solo queda un archivo sin uso (se registra para limpiarlo a mano).
        $failed = 0;
        foreach ($media as [$driver, $path]) {
            try {
                $storage = app('response-media.storage-for')($driver);
                $storage ? $storage->delete($path) : $failed++;
            } catch (\Throwable $e) {
                $failed++;
                \Illuminate\Support\Facades\Log::warning('No se pudo borrar un archivo de una respuesta eliminada.', ['driver' => $driver, 'path' => $path, 'exception' => $e]);
            }
        }
        if ($media !== []) {
            $message .= app()->getLocale() === 'en'
                ? ($failed === 0
                    ? ' Its '.count($media).' file(s) were deleted too.'
                    : ' '.$failed.' of its '.count($media).' file(s) could not be deleted; it was logged.')
                : ($failed === 0
                    ? ' Se borraron también sus '.count($media).' archivo(s).'
                    : ' No se pudieron borrar '.$failed.' de sus '.count($media).' archivo(s); quedó registrado.');
        }

        return $message;
    }

    /** @return list<array{0:string, 1:string}> [almacenamiento, ruta] de cada archivo de las respuestas del formulario */
    private function mediaOf(Form $form): array
    {
        $files = [];
        foreach (FormResponse::withTrashed()->where('form_id', $form->id)->cursor() as $response) {
            foreach ((array) $response->data as $answer) {
                if (is_array($answer) && is_string($answer['path'] ?? null) && $answer['path'] !== '') {
                    // Las respuestas anteriores a SharePoint no guardaban el almacenamiento: estaban en Supabase.
                    $files[] = [(string) ($answer['storage_driver'] ?? 'supabase'), $answer['path']];
                }
            }
        }

        return $files;
    }

    private function find(string $type, string $id): Model
    {
        $class = match ($type) {
            'projects' => Project::class, 'forms' => Form::class, 'zones' => ProjectZone::class, 'responses' => FormResponse::class,
        };

        return $class::onlyTrashed()->lockForUpdate()->findOrFail($id);
    }

    /** Nombre propio del elemento (proyecto, formulario o zona) para las plantillas de auditoría. */
    private function itemName(string $type, Model $model): string
    {
        return match ($type) {
            'forms' => (string) $model->title,
            'responses' => '',
            default => (string) $model->name,
        };
    }

    /** Nombre del elemento para los mensajes en inglés (los de español usan label()). */
    private function englishLabel(string $type, Model $model): string
    {
        return match ($type) {
            'projects' => "Project “{$model->name}”",
            'forms' => "Form “{$model->title}”",
            'zones' => "Zone “{$model->name}”",
            'responses' => 'Response',
        };
    }

    private function label(string $type, Model $model): string
    {
        return match ($type) {
            'projects' => "el proyecto «{$model->name}»",
            'forms' => "el formulario «{$model->title}»",
            'zones' => "la zona «{$model->name}»",
            'responses' => 'la respuesta',
        };
    }
}
