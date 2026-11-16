<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Domain\Responses\Services\CollectorRouteAnalyzer;
use App\Http\Controllers\Controller;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Supervisión de campo: lista de encuestadores y recorrido GPS de cada uno por día. */
class ProjectSupervisionController extends Controller
{
    private const TIMEZONE = 'America/Guayaquil';

    public function __construct(private readonly CollectorRouteAnalyzer $analyzer) {}

    public function collectors(Request $request, string $projectId): JsonResponse
    {
        $project = $this->supervisedProject($request, $projectId);
        $request->validate([
            'form_id' => ['nullable', 'uuid'],
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $formIds = $this->formIds($project, $request->query('form_id'));
        $term = trim((string) $request->query('q', ''));

        $page = $this->collectorQuery($project, $formIds)
            ->when($term !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w
                ->where('users.name', 'ilike', "%{$term}%")->orWhere('users.email', 'ilike', "%{$term}%")
                ->orWhere('users.cedula', 'ilike', "%{$term}%")))
            ->orderBy('users.name')
            ->paginate((int) $request->query('per_page', 25), ['users.id', 'users.name', 'users.email', 'users.cedula']);

        $ids = collect($page->items())->pluck('id');
        $today = CarbonImmutable::now(self::TIMEZONE)->startOfDay()->utc();
        $stats = FormResponse::query()->whereIn('form_id', $formIds)->whereIn('user_id', $ids)
            ->groupBy('user_id')
            ->addBinding($today->toDateTimeString(), 'select')
            ->get([
                'user_id',
                DB::raw('count(*) as responses'),
                DB::raw('count(location_trace) as traced'),
                DB::raw('max(coalesce(trace_started_at, created_at)) as last_activity'),
                DB::raw('sum(case when coalesce(trace_started_at, created_at) >= ? then 1 else 0 end) as today'),
                DB::raw("sum(case when data->'_project_geofence'->>'fuera_de_zona' = 'true' then 1 else 0 end) as outside"),
            ])->keyBy('user_id');
        $zones = DB::table('project_zone_user_assignments as a')->join('project_zones as z', 'z.id', '=', 'a.zone_id')
            ->whereIn('z.form_id', $formIds)->whereIn('a.user_id', $ids)
            ->get(['a.user_id', 'z.name'])->groupBy('user_id');

        return response()->json([
            'data' => collect($page->items())->map(function (User $user) use ($stats, $zones) {
                $row = $stats->get($user->id);

                return [
                    'id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'cedula' => $user->cedula,
                    'zones' => ($zones[$user->id] ?? collect())->pluck('name')->unique()->values(),
                    'responses' => (int) ($row->responses ?? 0),
                    'traced' => (int) ($row->traced ?? 0),
                    'today' => (int) ($row->today ?? 0),
                    'outside' => (int) ($row->outside ?? 0),
                    'last_activity' => $row?->last_activity ? CarbonImmutable::parse($row->last_activity, 'UTC')->toIso8601String() : null,
                ];
            })->values(),
            'pagination' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(), 'total' => $page->total(),
            ],
        ]);
    }

    public function route(Request $request, string $projectId, string $userId): JsonResponse
    {
        $project = $this->supervisedProject($request, $projectId);
        $request->validate(['form_id' => ['nullable', 'uuid'], 'date' => ['nullable', 'date_format:Y-m-d']]);
        $formIds = $this->formIds($project, $request->query('form_id'));
        $collector = $this->collectorQuery($project, $formIds)->whereKey($userId)
            ->first(['users.id', 'users.name', 'users.email', 'users.cedula']);
        abort_unless($collector, 404, 'El encuestador no pertenece a este proyecto.');

        // Días con encuestas, en hora de Ecuador.
        $moments = FormResponse::query()->whereIn('form_id', $formIds)->where('user_id', $collector->id)
            ->get(['id', DB::raw('coalesce(trace_started_at, created_at) as moment')]);
        $byDay = $moments->groupBy(fn ($r) => CarbonImmutable::parse($r->moment, 'UTC')->setTimezone(self::TIMEZONE)->toDateString());
        $days = $byDay->map(fn (Collection $rows, string $day) => ['date' => $day, 'surveys' => $rows->count()])
            ->sortByDesc('date')->values();
        $date = $request->query('date') ?: ($days[0]['date'] ?? CarbonImmutable::now(self::TIMEZONE)->toDateString());

        $responses = FormResponse::query()->whereIn('id', ($byDay[$date] ?? collect())->pluck('id'))->get()
            ->sortBy(fn (FormResponse $r) => ($r->trace_started_at ?? $r->created_at)->getTimestamp())->values();

        $zones = ProjectZone::query()->whereIn('form_id', $formIds)
            ->where(fn ($q) => $q->whereHas('assignedUsers', fn ($u) => $u->where('users.id', $collector->id))
                ->orWhereIn('id', $responses->map(fn ($r) => $r->data['_project_geofence']['zone_id'] ?? null)->filter()->all()))
            ->get()->keyBy('id');
        $titles = Form::whereIn('id', $formIds)->pluck('title', 'id');
        $surveys = $responses->map(fn (FormResponse $r) => $this->analyzer->survey($r, $zones, $titles))->all();

        return response()->json([
            'collector' => $collector->only(['id', 'name', 'email', 'cedula']),
            'date' => $date,
            'days' => $days,
            'forms' => Form::whereIn('id', $formIds)->orderBy('title')->get(['id', 'title']),
            'zones' => $zones->values()->map(fn (ProjectZone $zone) => [
                'id' => $zone->id, 'name' => $zone->name, 'form_id' => $zone->form_id,
                'geofence_type' => $zone->geofence_type, 'target_lat' => $zone->target_lat,
                'target_lng' => $zone->target_lng, 'radius_meters' => $zone->radius_meters,
                'geometry_json' => $zone->geometry_json,
            ]),
            'summary' => $this->analyzer->day($surveys),
            'surveys' => $surveys,
        ]);
    }

    private function supervisedProject(Request $request, string $projectId): Project
    {
        $project = Project::findOrFail($projectId);
        $user = $request->user();
        abort_unless($user->canManageProjects() || $user->leadsProject($project->id)
            || $user->supervisesProject($project->id), 403);

        return $project;
    }

    /** @return Collection<int, string> */
    private function formIds(Project $project, ?string $formId): Collection
    {
        $ids = $project->forms()->when($formId, fn ($q) => $q->whereKey($formId))->pluck('id');
        abort_if($formId && $ids->isEmpty(), 404, 'El formulario no pertenece a este proyecto.');

        return $ids;
    }

    /** Encuestadores del equipo, asignados a una zona o con encuestas en los formularios. */
    private function collectorQuery(Project $project, Collection $formIds): Builder
    {
        return User::query()->where(fn (Builder $q) => $q
            ->whereIn('users.id', DB::table('project_collectors')->where('project_id', $project->id)->select('user_id'))
            ->orWhereIn('users.id', DB::table('project_zone_user_assignments as a')
                ->join('project_zones as z', 'z.id', '=', 'a.zone_id')->whereIn('z.form_id', $formIds)->select('a.user_id'))
            ->orWhereIn('users.id', DB::table('form_responses')->whereIn('form_id', $formIds)
                ->whereNotNull('user_id')->select('user_id')));
    }
}
