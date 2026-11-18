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
                    'context' => trim(($f->project ? "Proyecto «{$f->project->name}»" : '').' · '.$f->responses_count.' respuesta(s)', ' ·'),
                    'deleted_at' => $f->deleted_at, 'deleted_by' => $f->deleted_by,
                ]),
            'zones' => ProjectZone::onlyTrashed()->with(['project' => fn ($q) => $q->withTrashed(), 'form' => fn ($q) => $q->withTrashed()])
                ->latest('deleted_at')->limit(self::LIMIT)->get()
                ->map(fn (ProjectZone $z) => [
                    'id' => $z->id, 'name' => $z->name,
                    'context' => implode(' · ', array_filter([
                        $z->project ? "Proyecto «{$z->project->name}»" : null,
                        $z->form ? "Formulario «{$z->form->title}»" : null,
                    ])),
                    'deleted_at' => $z->deleted_at, 'deleted_by' => $z->deleted_by,
                ]),
            'responses' => FormResponse::onlyTrashed()->with(['form' => fn ($q) => $q->withTrashed(), 'user' => fn ($q) => $q->withTrashed()])
                ->latest('deleted_at')->limit(self::LIMIT)->get()
                ->map(fn (FormResponse $r) => [
                    'id' => $r->id,
                    'name' => 'Respuesta del '.$r->created_at?->timezone('America/Guayaquil')->format('d/m/Y H:i'),
                    'context' => implode(' · ', array_filter([
                        $r->form ? "Formulario «{$r->form->title}»" : null,
                        $r->user ? "Encuestador {$r->user->name}" : 'Enlace público',
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
                    'Su proyecto está en la papelera: restaura primero el proyecto.');
            }
            if ($model instanceof ProjectZone) {
                abort_if(Project::onlyTrashed()->whereKey($model->project_id)->exists(), 422,
                    'Su proyecto está en la papelera: restaura primero el proyecto.');
                abort_if($model->form_id && Form::onlyTrashed()->whereKey($model->form_id)->exists(), 422,
                    'Su formulario está en la papelera: restaura primero el formulario.');
            }
            if ($model instanceof FormResponse) {
                abort_if(Form::onlyTrashed()->whereKey($model->form_id)->exists(), 422,
                    'Su formulario está en la papelera: restaura primero el formulario.');
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
                "Restauró {$label} desde el Centro de datos.", ['type' => $type, 'id' => $id]);

            return $type === 'zones'
                ? "Zona «{$model->name}» restaurada. Vuelve a asignarle encuestadores."
                : ucfirst($label).' restaurado'.($type === 'responses' ? 'a' : '').'.';
        });
    }

    public function purge(string $type, string $id, User $admin): string
    {
        abort_if($type === 'responses', 422, 'Las respuestas anuladas se conservan como registro; puedes restaurarlas.');

        return DB::transaction(function () use ($type, $id, $admin) {
            $model = $this->find($type, $id);
            $label = $this->label($type, $model);
            if ($model instanceof Project) {
                abort_if(Form::withTrashed()->where('project_id', $model->id)->exists(), 422,
                    'El proyecto tiene formularios en la papelera: elimínalos definitivamente primero.');
            }

            AuditLogService::log($admin, 'PURGE_'.strtoupper(rtrim($type, 's')), 'centro-de-datos',
                "Eliminó definitivamente {$label} desde el Centro de datos.", ['type' => $type, 'id' => $id]);
            $model->forceDelete();

            return ucfirst($label).' eliminado definitivamente.';
        });
    }

    private function find(string $type, string $id): Model
    {
        $class = match ($type) {
            'projects' => Project::class, 'forms' => Form::class, 'zones' => ProjectZone::class, 'responses' => FormResponse::class,
        };

        return $class::onlyTrashed()->lockForUpdate()->findOrFail($id);
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
