<?php

namespace App\Presentation\Http\Controllers\Api;

use App\Application\Forms\Services\EnqueueFormSchemaSync;
use App\Application\Responses\Services\ProcessResponseMedia;
use App\Application\Responses\Services\ResponseExportMatrixBuilder;
use App\Application\Responses\Services\SpreadsheetExportSanitizer;
use App\Application\Responses\Services\StoreFormResponse;
use App\Domain\Forms\Services\FormFlowEngine;
use App\Domain\Forms\Services\FormLifecycleService;
use App\Domain\Forms\Services\FormResponseValidator;
use App\Domain\Forms\Services\FormSchemaValidator;
use App\Domain\Projects\Services\ProjectSurveyPeriod;
use App\Http\Controllers\Controller;
use App\Models\Form;
use App\Models\FormQuestion;
use App\Models\FormResponse;
use App\Models\FormUserShare;
use App\Models\User;
use App\Presentation\Http\Requests\Mobile\SubmitMobileResponseRequest;
use App\Presentation\Http\Resources\FormResponseResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Concerns\FromGenerator;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Facades\Excel;
use OpenApi\Attributes as OA;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

#[OA\Tag(name: 'Forms', description: 'Formularios dinamicos, publicacion, respuestas y comparticion')]
class FormController extends Controller
{
    public function __construct(
        private readonly StoreFormResponse $storeFormResponse,
        private readonly EnqueueFormSchemaSync $enqueueFormSchemaSync,
        private readonly FormFlowEngine $formFlowEngine,
        private readonly FormResponseValidator $formResponseValidator,
        private readonly FormSchemaValidator $formSchemaValidator,
        private readonly FormLifecycleService $formLifecycleService,
        private readonly ProjectSurveyPeriod $projectPeriod,
    ) {}

    #[OA\Get(path: '/forms', summary: 'Listar formularios propios y compartidos', security: [['sanctum' => []]], tags: ['Forms'])]
    public function index(Request $request): JsonResponse
    {
        $this->formLifecycleService->syncStatesIfDue();
        $user = $request->user();

        if ($user->isSuperAdmin() || $user->isAdmin()) {
            return response()->json([
                'my_forms' => Form::with(['owner:id,name,email,rol', 'project:id,name'])->withCount('responses')->latest()->get(),
                'shared_forms' => [],
            ]);
        }

        $myForms = Form::query()
            ->when($user->isProjectLeader(), function ($query) use ($user) {
                $projectIds = $user->ledProjects()->pluck('projects.id');

                $query->where(function ($inner) use ($user, $projectIds) {
                    $inner->where('user_id', $user->id);
                    if ($projectIds->isNotEmpty()) {
                        $inner->orWhereIn('project_id', $projectIds);
                    }
                });
            }, fn ($query) => $query->where('user_id', $user->id))
            ->with(['owner:id,name,email,rol', 'project:id,name'])
            ->withCount('responses')
            ->latest()
            ->get();

        $sharedForms = Form::whereHas('shares', fn ($q) => $q->where('user_id', $user->id))
            ->with([
                'owner:id,name,email,rol',
                'project:id,name',
                'shares' => fn ($q) => $q->where('user_id', $user->id)->select(['id', 'form_id', 'user_id', 'role']),
            ])
            ->withCount('responses')
            ->latest()
            ->get()
            ->map(function (Form $form) {
                // Rol leído de la relación precargada (antes: una consulta por formulario).
                $form->setAttribute('access_role', $form->shares->first()?->role);
                $form->unsetRelation('shares');

                return $form;
            });

        return response()->json([
            'my_forms' => $myForms,
            'shared_forms' => $sharedForms,
        ]);
    }

    #[OA\Get(path: '/mobile/forms', summary: 'Listar formularios para app móvil (formato plano con preguntas)', security: [['sanctum' => []]], tags: ['Mobile'])]
    public function mobileIndex(Request $request): JsonResponse
    {
        $this->formLifecycleService->syncStatesIfDue();
        $user = $request->user();

        $forms = Form::where('state', 'DEPLOYED')
            ->where(function ($query) use ($user) {
                if ($user->isSuperAdmin() || $user->isAdmin()) {
                    return;
                }
                $query->where('user_id', $user->id)
                    ->orWhereHas('shares', fn ($q) => $q->where('user_id', $user->id));
            })
            ->with([
                'questions' => fn ($q) => $q->orderBy('order'),
                'project.zones.assignedUsers:id,name,email',
            ])
            ->latest()
            ->get();

        $userStats = $this->userFormStats($forms->pluck('id')->all(), $user);
        $zoneCounts = $this->zoneResponseCounts($forms->pluck('id')->all());

        $result = $forms->map(function (Form $form) use ($user, $userStats, $zoneCounts) {
            return $this->formatMobileForm($form, $user, $userStats, $zoneCounts);
        });

        return response()->json($result);
    }

    #[OA\Get(path: '/mobile/forms/metadata', summary: 'Obtener metadatos actualizados de formularios (sin preguntas)', security: [['sanctum' => []]], tags: ['Mobile'])]
    public function mobileMetadata(Request $request): JsonResponse
    {
        $this->formLifecycleService->syncStatesIfDue();
        $user = $request->user();

        $forms = Form::where('state', 'DEPLOYED')
            ->where(function ($query) use ($user) {
                if ($user->isSuperAdmin() || $user->isAdmin()) {
                    return;
                }
                $query->where('user_id', $user->id)
                    ->orWhereHas('shares', fn ($q) => $q->where('user_id', $user->id));
            })
            ->select('id', 'title', 'state', 'link_uuid', 'step_by_step')
            ->with('zones:id,form_id,target_responses')
            ->latest()
            ->get();

        $userStats = $this->userFormStats($forms->pluck('id')->all(), $user);
        $zoneCounts = $this->zoneResponseCounts($forms->pluck('id')->all());

        $result = $forms->map(function (Form $form) use ($userStats, $zoneCounts) {
            $stats = $userStats[$form->id] ?? null;

            return [
                'id' => $form->id,
                'title' => $form->title,
                'state' => $form->state,
                'link_uuid' => $form->link_uuid,
                'step_by_step' => (bool) $form->step_by_step,
                'target_responses' => $stats['target_responses'] ?? null,
                'responses_count' => $stats['responses_count'] ?? null,
                // Avance por zona para que la app actualice cuántas encuestas faltan sin volver a descargar.
                'zones_progress' => $form->zones->map(fn ($zone) => [
                    'id' => $zone->id,
                    'target_responses' => $zone->target_responses,
                    'responses_count' => (int) ($zoneCounts[$zone->id] ?? 0),
                ])->values()->all(),
            ];
        });

        return response()->json($result);
    }

    #[OA\Post(path: '/mobile/submit', summary: 'Enviar respuesta desde app móvil', security: [['sanctum' => []]], tags: ['Mobile'])]
    public function submitMobileResponse(SubmitMobileResponseRequest $request): JsonResponse
    {
        $form = $request->getForm();
        $currentUser = $request->user();
        $data = $request->input('data', []);
        $response = $this->storeFormResponse->submit($form, $currentUser, is_array($data) ? $data : [], $request->string('client_submission_id')->toString());

        return response()->json(['message' => 'Respuesta guardada', 'id' => $response->id], 201);
    }

    #[OA\Post(path: '/forms', summary: 'Crear formulario en borrador', security: [['sanctum' => []]], tags: ['Forms'])]
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'project_id' => 'required|uuid|exists:projects,id',
            'step_by_step' => 'sometimes|boolean',
            'require_consent' => 'sometimes|accepted',
            'consent_text' => 'required|string|min:10',
            'start_date' => 'nullable|date_format:Y-m-d',
            'end_date' => 'nullable|date_format:Y-m-d|after_or_equal:start_date',
        ]);

        $projectId = $request->input('project_id');
        $user = $request->user();

        if ($user->isUser()) {
            return response()->json(['message' => 'Los usuarios recolectores no pueden crear formularios'], 403);
        }

        if (! $user->isSuperAdmin() && ! $user->isAdmin() && ! $user->leadsProject($projectId)
            && ! $user->isProjectDelegate($projectId)) {
            return response()->json(['message' => 'No tienes permisos para crear formularios en este proyecto'], 403);
        }

        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');
        $this->projectPeriod->assertWithin($projectId, $startDate, $endDate);

        $form = Form::create([
            'title' => $request->title,
            'description' => $request->description,
            'user_id' => $user->id,
            'project_id' => $projectId,
            'state' => 'DRAFT',
            'link_uuid' => null,
            'step_by_step' => $request->boolean('step_by_step'),
            'require_consent' => true,
            'consent_text' => $request->input('consent_text'),
            'start_date' => $startDate,
            'end_date' => $endDate,
        ]);

        \App\Services\AuditLogService::logFormAction($user, $form, 'CREATE');

        $this->enqueueFormSchemaSync->enqueue($form);

        return response()->json($form, 201);
    }

    #[OA\Get(path: '/forms/{id}', summary: 'Ver detalle de formulario', security: [['sanctum' => []]], tags: ['Forms'])]
    public function show(Request $request, string $id): JsonResponse
    {
        $this->formLifecycleService->syncStatesIfDue();
        $user = $request->user();
        $form = $this->findViewableForm($id, $user);
        $form->load([
            'owner:id,name,email,rol',
            'project.zones.assignedUsers:id,name,email',
            'questions' => fn ($q) => $q->orderBy('order'),
            'shares.user:id,name,email,rol',
        ]);

        $data = $this->formatMobileForm($form, $user);

        return response()->json($data);
    }

    #[OA\Put(path: '/forms/{id}', summary: 'Actualizar formulario no implementado', security: [['sanctum' => []]], tags: ['Forms'])]
    public function update(Request $request, string $id): JsonResponse
    {
        $form = $this->findEditableForm($id, $request->user());

        if ($form->state === 'DEPLOYED') {
            return response()->json(['message' => 'No se puede editar un formulario implementado'], 403);
        }

        $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'step_by_step' => 'sometimes|boolean',
            'require_consent' => 'sometimes|accepted',
            'consent_text' => 'sometimes|required|string|min:10',
            'start_date' => 'nullable|date_format:Y-m-d',
            'end_date' => 'nullable|date_format:Y-m-d|after_or_equal:start_date',
        ]);

        if ($form->instrument_locked) {
            foreach (['title', 'description', 'step_by_step', 'consent_text'] as $field) {
                abort_if($request->has($field) && $request->input($field) != $form->$field, 409,
                    'El instrumento ya fue publicado. Duplique el formulario para cambiar sus preguntas o consentimiento y conservar el historial.');
            }
        }
        $this->projectPeriod->assertWithin(
            $form->project_id,
            $request->has('start_date') ? $request->input('start_date') : $form->start_date?->format('Y-m-d'),
            $request->has('end_date') ? $request->input('end_date') : $form->end_date?->format('Y-m-d'),
        );
        $form->update($request->only([
            'title', 'description', 'step_by_step', 'consent_text', 'start_date', 'end_date',
        ]));
        $form->update(['require_consent' => true]);

        $form = $this->formLifecycleService->resolveStateForForm($form);

        \App\Services\AuditLogService::logFormAction($request->user(), $form, 'UPDATE');

        $this->enqueueFormSchemaSync->enqueue($form->fresh(['questions' => fn ($q) => $q->orderBy('order')]));

        return response()->json($form);
    }

    #[OA\Delete(path: '/forms/{id}', summary: 'Eliminar formulario propio o cualquier formulario como super admin', security: [['sanctum' => []]], tags: ['Forms'])]
    public function destroy(Request $request, string $id): JsonResponse
    {
        $form = Form::findOrFail($id);
        $user = $request->user();

        if (! $this->canDeleteForm($form, $user)) {
            return response()->json(['message' => 'No tienes permisos para eliminar este formulario'], 403);
        }

        if ($form->state === 'DEPLOYED') {
            return response()->json(['message' => 'Archiva el formulario antes de eliminarlo permanentemente'], 422);
        }

        $formId = $form->id;
        \App\Services\AuditLogService::logFormAction($user, $form, 'DELETE');
        $form->delete();

        $this->enqueueFormSchemaSync->enqueueById($formId, 'delete');

        return response()->json(null, 204);
    }

    #[OA\Post(path: '/forms/{id}/clone', summary: 'Clonar formulario en borrador', security: [['sanctum' => []]], tags: ['Forms'])]
    public function cloneForm(Request $request, string $id): JsonResponse
    {
        $source = $this->findShareManageableForm($id, $request->user());
        $source->load(['questions' => fn ($q) => $q->orderBy('order')]);

        $copy = DB::transaction(function () use ($source, $request) {
            $copy = Form::create([
                'title' => $source->title.' (copia)',
                'description' => $source->description,
                'user_id' => $request->user()->id,
                'project_id' => $source->project_id,
                'state' => 'DRAFT',
                'link_uuid' => null,
                'step_by_step' => $source->step_by_step,
                'require_consent' => true,
                'consent_text' => $source->consent_text,
                'start_date' => $source->start_date?->format('Y-m-d'),
                'end_date' => $source->end_date?->format('Y-m-d'),
            ]);

            $questionIds = [];
            foreach ($source->questions as $question) {
                $clonedQuestion = $copy->questions()->create([
                    'type' => $question->type,
                    'label' => $question->label,
                    'options' => $question->options,
                    'branch_rules' => null,
                    'properties' => $question->properties,
                    'required' => $question->required,
                    'order' => $question->order,
                    'section_name' => $question->section_name,
                ]);
                $questionIds[$question->id] = $clonedQuestion;
            }

            foreach ($source->questions as $question) {
                $clonedQuestion = $questionIds[$question->id];
                $rules = $question->branch_rules;
                if (is_array($rules)) {
                    $rules = array_map(function ($rule) use ($questionIds) {
                        if (! is_array($rule)) {
                            return $rule;
                        }
                        foreach (['next_question_id', 'nextQuestionId'] as $key) {
                            if (isset($rule[$key])) {
                                $rule[$key] = isset($questionIds[$rule[$key]]) ? $questionIds[$rule[$key]]->id : null;
                            }
                        }

                        return $rule;
                    }, $rules);
                }
                $clonedQuestion->update([
                    'parent_question_id' => $question->parent_question_id
                        ? ($questionIds[$question->parent_question_id]->id ?? null) : null,
                    'branch_rules' => $rules,
                ]);
            }

            return $copy;
        });

        $copy->load(['owner:id,name,email,rol', 'project:id,name']);
        $copy->loadCount('responses');

        \App\Services\AuditLogService::logFormAction($request->user(), $copy, 'CLONE', "Clonado de '{$source->title}'");
        $this->enqueueFormSchemaSync->enqueue($copy->fresh(['questions' => fn ($q) => $q->orderBy('order')]));

        return response()->json($copy, 201);
    }

    #[OA\Post(path: '/forms/{id}/deploy', summary: 'Implementar formulario y generar enlace publico', security: [['sanctum' => []]], tags: ['Forms'])]
    public function deploy(Request $request, string $id): JsonResponse
    {
        $form = $this->findLifecycleManageableForm($id, $request->user());

        if (! in_array($form->state, ['DRAFT', 'ARCHIVED'], true)) {
            return response()->json(['message' => 'El formulario ya está implementado'], 422);
        }

        $sheet = $this->projectPeriod->sheet($form->project_id);
        if ($sheet?->status !== 'VALIDATED') {
            return response()->json(['message' => 'El líder debe validar la ficha técnica del proyecto'], 422);
        }
        // Sin fechas propias, el formulario toma el periodo del proyecto.
        $form->start_date ??= $sheet->start_date;
        $form->end_date ??= $sheet->end_date;
        $this->projectPeriod->assertWithin($form->project_id, $form->start_date?->format('Y-m-d'), $form->end_date?->format('Y-m-d'));
        $today = now('America/Guayaquil')->toDateString();
        if ($form->end_date && $form->end_date->format('Y-m-d') < $today) {
            return response()->json(['message' => 'La fecha de fin del formulario ya pasó. Actualice sus fechas (dentro del periodo del proyecto) antes de publicar.'], 422);
        }
        if (! $form->zones()->exists()) {
            return response()->json(['message' => 'Delimite al menos una zona antes de publicar'], 422);
        }
        if (! $form->questions()->exists()) {
            return response()->json(['message' => 'Agregue al menos una pregunta antes de publicar'], 422);
        }
        $this->formSchemaValidator->validateForPublication($form->questions()->orderBy('order')->get());
        if (! $form->consent_text || mb_strlen(trim($form->consent_text)) < 10) {
            return response()->json(['message' => 'Complete el consentimiento informado antes de publicar'], 422);
        }

        $form->update([
            'start_date' => $form->start_date,
            'end_date' => $form->end_date,
            'state' => 'DEPLOYED',
            'instrument_locked' => true,
            'link_uuid' => $form->link_uuid ?? Str::uuid(),
        ]);

        \App\Services\AuditLogService::logFormAction($request->user(), $form, 'DEPLOY');
        $this->enqueueFormSchemaSync->enqueue($form->fresh(['questions' => fn ($q) => $q->orderBy('order')]));

        return response()->json($form);
    }

    #[OA\Post(path: '/forms/{id}/archive', summary: 'Archivar formulario', security: [['sanctum' => []]], tags: ['Forms'])]
    public function archive(Request $request, string $id): JsonResponse
    {
        $form = $this->findLifecycleManageableForm($id, $request->user());

        if ($form->state !== 'DEPLOYED') {
            return response()->json(['message' => 'Solo se puede archivar un formulario implementado'], 422);
        }

        $form->update(['state' => 'ARCHIVED']);

        \App\Services\AuditLogService::logFormAction($request->user(), $form, 'ARCHIVE');
        $this->enqueueFormSchemaSync->enqueue($form->fresh(['questions' => fn ($q) => $q->orderBy('order')]));

        return response()->json($form);
    }

    #[OA\Get(path: '/forms/{id}/questions', summary: 'Listar preguntas', security: [['sanctum' => []]], tags: ['Forms'])]
    public function getQuestions(Request $request, string $id): JsonResponse
    {
        $form = $this->findViewableForm($id, $request->user());

        return response()->json($form->questions()->orderBy('order')->get());
    }

    #[OA\Post(path: '/forms/{id}/questions', summary: 'Agregar pregunta', security: [['sanctum' => []]], tags: ['Forms'])]
    public function storeQuestion(Request $request, string $id): JsonResponse
    {
        $form = $this->findEditableForm($id, $request->user());

        if ($form->state === 'DEPLOYED') {
            return response()->json(['message' => 'No se puede cambiar preguntas de un formulario implementado'], 403);
        }
        if (! $this->projectPeriod->isValidated($form->project_id)) {
            return response()->json(['message' => 'El líder debe validar la ficha técnica del proyecto antes de editar preguntas'], 422);
        }

        $request->validate([
            'type' => 'required|in:MULTIPLE_CHOICE,SINGLE_CHOICE,LIKERT,TEXT,NUMBER,NOTE,DATE,TIME,DATETIME,GPS,MULTIMEDIA,SIGNATURE,RANKING,RATING,BARCODE,CALCULATE',
            'label' => 'required|string',
            'order' => 'integer',
            'required' => 'boolean',
            'options' => 'nullable|array',
            'branch_rules' => 'nullable|array',
            'properties' => 'nullable|array',
            'properties.text_format' => 'nullable|in:email,cedula_ec,telefono_ec',
            'section_name' => 'nullable|string|max:255',
            'parent_question_id' => 'nullable|uuid|exists:form_questions,id',
            'branch_rules.*.option_index' => 'required_with:branch_rules|integer|min:0',
            'branch_rules.*.action' => 'nullable|in:CONTINUE,GO_TO,END_FORM',
            'branch_rules.*.next_question_id' => 'nullable|uuid',
        ]);

        $question = $form->questions()->create($request->only([
            'type',
            'label',
            'order',
            'required',
            'options',
            'branch_rules',
            'properties',
            'section_name',
            'parent_question_id',
        ]));

        $this->enqueueFormSchemaSync->enqueue($form->fresh(['questions' => fn ($q) => $q->orderBy('order')]));

        return response()->json($question, 201);
    }

    #[OA\Put(path: '/forms/questions/{question_id}', summary: 'Actualizar pregunta', security: [['sanctum' => []]], tags: ['Forms'])]
    public function updateQuestion(Request $request, string $question_id): JsonResponse
    {
        $question = FormQuestion::with('form')->findOrFail($question_id);
        $this->abortUnlessCanEdit($question->form, $request->user());

        if ($question->form->state === 'DEPLOYED') {
            return response()->json(['message' => 'No se puede cambiar preguntas de un formulario implementado'], 403);
        }
        abort_if($question->form->instrument_locked, 409, 'Duplique el formulario publicado para editar sus preguntas sin alterar respuestas históricas.');
        if (! $this->projectPeriod->isValidated($question->form->project_id)) {
            return response()->json(['message' => 'El líder debe validar la ficha técnica del proyecto antes de editar preguntas'], 422);
        }

        $request->validate([
            'type' => 'sometimes|required|in:MULTIPLE_CHOICE,SINGLE_CHOICE,LIKERT,TEXT,NUMBER,NOTE,DATE,TIME,DATETIME,GPS,MULTIMEDIA,SIGNATURE,RANKING,RATING,BARCODE,CALCULATE',
            'label' => 'sometimes|required|string',
            'order' => 'sometimes|integer',
            'required' => 'sometimes|boolean',
            'options' => 'sometimes|nullable|array',
            'branch_rules' => 'sometimes|nullable|array',
            'properties' => 'sometimes|nullable|array',
            'properties.text_format' => 'nullable|in:email,cedula_ec,telefono_ec',
            'section_name' => 'sometimes|nullable|string|max:255',
            'parent_question_id' => 'sometimes|nullable|uuid|exists:form_questions,id',
            'branch_rules.*.option_index' => 'required_with:branch_rules|integer|min:0',
            'branch_rules.*.action' => 'nullable|in:CONTINUE,GO_TO,END_FORM',
            'branch_rules.*.next_question_id' => 'nullable|uuid',
        ]);

        $question->update($request->only([
            'type',
            'label',
            'order',
            'required',
            'options',
            'branch_rules',
            'properties',
            'section_name',
            'parent_question_id',
        ]));

        $this->enqueueFormSchemaSync->enqueue($question->form->fresh(['questions' => fn ($q) => $q->orderBy('order')]));

        return response()->json($question);
    }

    #[OA\Delete(path: '/forms/questions/{question_id}', summary: 'Eliminar pregunta', security: [['sanctum' => []]], tags: ['Forms'])]
    public function destroyQuestion(Request $request, string $question_id): JsonResponse
    {
        $question = FormQuestion::with('form')->findOrFail($question_id);
        $this->abortUnlessCanEdit($question->form, $request->user());

        if ($question->form->state === 'DEPLOYED') {
            return response()->json(['message' => 'No se puede cambiar preguntas de un formulario implementado'], 403);
        }
        abort_if($question->form->instrument_locked, 409, 'Duplique el formulario publicado para editar sus preguntas sin alterar respuestas históricas.');
        if (! $this->projectPeriod->isValidated($question->form->project_id)) {
            return response()->json(['message' => 'El líder debe validar la ficha técnica del proyecto antes de editar preguntas'], 422);
        }

        $form = $question->form;
        $question->delete();

        $this->enqueueFormSchemaSync->enqueue($form->fresh(['questions' => fn ($q) => $q->orderBy('order')]));

        return response()->json(null, 204);
    }

    #[OA\Get(path: '/forms/{id}/shares', summary: 'Listar usuarios invitados', security: [['sanctum' => []]], tags: ['Forms'])]
    public function getShares(Request $request, string $id): JsonResponse
    {
        $form = $this->findViewableForm($id, $request->user());
        abort_if($request->user()->isUser(), 403);

        $shares = $form->shares()->with('user:id,name,email,rol')->get();
        // Un solo conteo agrupado por usuario (antes: un COUNT por cada asignación).
        $countsByUser = FormResponse::where('form_id', $form->id)
            ->whereIn('user_id', $shares->pluck('user_id')->all())
            ->groupBy('user_id')
            ->selectRaw('user_id, COUNT(*) AS total')
            ->pluck('total', 'user_id');

        $shares = $shares->map(function ($share) use ($countsByUser) {
            $responsesCount = (int) ($countsByUser[$share->user_id] ?? 0);

            return [
                'id' => $share->id,
                'user_id' => $share->user_id,
                'user_name' => $share->user->name ?? '',
                'user_email' => $share->user->email ?? '',
                'user_rol' => $share->user->rol ?? '',
                'role' => $share->role,
                'target_responses' => $share->role === 'RECOLECTOR' ? $share->target_responses : null,
                'responses_count' => $responsesCount,
            ];
        });

        return response()->json($shares);
    }

    #[OA\Post(path: '/forms/{id}/shares', summary: 'Asignar usuario como editor o recolector', security: [['sanctum' => []]], tags: ['Forms'])]
    public function storeShare(Request $request, string $id): JsonResponse
    {
        $form = $this->findShareManageableForm($id, $request->user());

        $request->validate([
            'email' => 'required|email',
            'role' => 'required|in:PROJECT,RECOLECTOR',
            'target_responses' => 'nullable|integer|min:1',
        ]);

        $user = User::where('email', $request->email)->first();
        if (! $user) {
            return response()->json(['message' => 'No existe un usuario con ese correo'], 404);
        }

        if ((int) $user->id === (int) $form->user_id) {
            return response()->json(['message' => 'No puedes compartir el formulario contigo mismo'], 422);
        }

        if (! $user->isUser()) {
            return response()->json(['message' => 'Solo usuarios recolectores pueden recibir permisos por formulario'], 422);
        }

        $share = FormUserShare::updateOrCreate(
            ['form_id' => $form->id, 'user_id' => $user->id],
            [
                'role' => $request->role,
                'target_responses' => $request->role === 'RECOLECTOR' ? $request->target_responses : null,
            ]
        );

        app(\App\Application\Forms\Services\FormShareAccess::class)->forgetArchived($form->id, $user->id);

        \App\Services\AuditLogService::logPermissionShare(
            $request->user(),
            $user,
            $form,
            $request->role,
            $request->role === 'RECOLECTOR' ? $request->target_responses : null
        );

        return response()->json($share->load('user:id,name,email,rol'), 201);
    }

    #[OA\Delete(path: '/forms/{id}/shares/{share_id}', summary: 'Retirar invitacion', security: [['sanctum' => []]], tags: ['Forms'])]
    public function destroyShare(Request $request, string $id, string $share_id): JsonResponse
    {
        $form = $this->findShareManageableForm($id, $request->user());
        $share = FormUserShare::where('form_id', $form->id)->with('user')->findOrFail($share_id);
        $targetUser = $share->user;
        $share->delete();

        if ($targetUser) {
            \App\Services\AuditLogService::logPermissionRevoke($request->user(), $targetUser, $form);
        }

        return response()->json(null, 204);
    }

    #[OA\Patch(path: '/forms/{id}/shares/{share_id}', summary: 'Actualizar target_responses de una asignacion', security: [['sanctum' => []]], tags: ['Forms'])]
    public function updateShare(Request $request, string $id, string $share_id): JsonResponse
    {
        $form = $this->findShareManageableForm($id, $request->user());

        $request->validate([
            'target_responses' => 'nullable|integer|min:1',
        ]);

        $share = FormUserShare::where('form_id', $form->id)->findOrFail($share_id);
        if ($share->role !== 'RECOLECTOR') {
            return response()->json(['message' => 'Solo los recolectores pueden tener respuestas objetivo'], 422);
        }

        DB::transaction(function () use ($share, $request, $form) {
            $before = $share->target_responses;
            $share->update(['target_responses' => $request->target_responses]);
            \App\Services\AuditLogService::log($request->user(), 'UPDATE_SHARE_TARGET', 'permisos',
                'Cambió la meta de respuestas del encuestador.', [
                    'form_id' => $form->id, 'share_id' => $share->id,
                    'before' => $before, 'after' => $share->target_responses,
                ]);
        });

        return response()->json($share->load('user:id,name,email,rol'));
    }

    #[OA\Get(path: '/forms/fetch/{link_uuid}', summary: 'Obtener formulario publico implementado', tags: ['Forms'])]
    public function fetchForm(string $link_uuid): JsonResponse
    {
        $this->formLifecycleService->syncStatesIfDue();

        $form = Form::where('link_uuid', $link_uuid)
            ->where('state', 'DEPLOYED')
            ->with(['questions' => fn ($q) => $q->orderBy('order')])
            ->firstOrFail();
        abort_if($form->start_date && $form->start_date->isFuture(), 404);

        $data = $form->toArray();
        $data['questions'] = $form->questions->map(fn ($q) => $this->formatMobileQuestion($q))->toArray();
        $data['project_zones'] = $form->zones()->get(['id', 'name', 'geofence_type', 'target_lat', 'target_lng', 'radius_meters', 'geometry_json'])->toArray();

        return response()->json($data);
    }

    #[OA\Post(path: '/forms/submit/{link_uuid}', summary: 'Enviar respuesta publica', tags: ['Forms'])]
    public function submitResponse(SubmitMobileResponseRequest $request, string $link_uuid): JsonResponse
    {
        $this->formLifecycleService->syncStatesIfDue();

        $form = Form::where('link_uuid', $link_uuid)
            ->where('state', 'DEPLOYED')
            ->with(['questions' => fn ($q) => $q->orderBy('order')])
            ->firstOrFail();
        abort_if($form->start_date && $form->start_date->isFuture(), 404);

        $data = $request->data ?? [];
        $dataArray = is_array($data) ? $data : [];
        $response = $this->storeFormResponse->submit($form, $request->user(), $dataArray, $request->string('client_submission_id')->toString());

        return response()->json([
            'message' => 'Respuesta guardada',
            'id' => $response->id,
            'response' => new FormResponseResource($response),
        ], 201);
    }

    #[OA\Get(path: '/forms/{id}/responses', summary: 'Listar respuestas', security: [['sanctum' => []]], tags: ['Forms'])]
    public function getResponses(Request $request, string $id): JsonResponse
    {
        $form = $this->findResponsesReadableForm($id, $request->user());
        $form->load('questions');
        $pageSize = max(1, min(100, (int) $request->query('per_page', 50)));
        $page = $form->responses()->orderByDesc('created_at')->orderByDesc('id')->paginate($pageSize);

        return response()->json([
            'questions' => $form->questions,
            'responses' => $page->items(),
            'pagination' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function getResponseMedia(Request $request, string $id, string $responseId, string $questionId): JsonResponse
    {
        $form = Form::findOrFail($id);
        $user = $request->user();
        abort_unless($user->canManageProjects() || $user->leadsProject($form->project_id)
            || $user->isProjectDelegate($form->project_id) || $user->supervisesProject($form->project_id)
            || ((int) $form->user_id === (int) $user->id && ! $user->isUser()), 403);

        $response = $form->responses()->findOrFail($responseId);
        $answer = $response->data[$questionId] ?? null;
        abort_unless(is_array($answer), 404);

        return response()->json([
            'url' => app(ProcessResponseMedia::class)->temporaryUrl($answer),
            'expires_in' => 300,
        ]);
    }

    #[OA\Get(path: '/forms/{id}/stats', summary: 'Obtener estadisticas basicas de respuestas', security: [['sanctum' => []]], tags: ['Forms'])]
    public function getStats(Request $request, string $id): JsonResponse
    {
        $form = $this->findResponsesReadableForm($id, $request->user());
        $form->load('questions');
        $stats = [];

        foreach ($form->questions as $q) {
            if (! in_array($q->type, ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'LIKERT'], true)) {
                continue;
            }

            $stats[$q->id] = array_fill_keys($this->chartOptionsForQuestion($q), 0);
        }

        if ($stats === []) {
            return response()->json($stats);
        }

        if (DB::connection()->getDriverName() === 'pgsql') {
            // PostgreSQL agrupa y cuenta dentro de la base: no se transfiere ni decodifica el JSON de cada respuesta.
            foreach ($this->aggregateChoiceAnswers($form->id, array_keys($stats)) as $row) {
                $value = json_decode($row->answer, true);
                $stats[$row->question_id][$value] = ($stats[$row->question_id][$value] ?? 0) + (int) $row->total;
            }

            return response()->json($stats);
        }

        // Respaldo para otros motores (SQLite en las pruebas): mismo resultado, recorriendo en PHP.
        foreach ($form->responses()->select(['id', 'form_id', 'data'])->cursor() as $r) {
            foreach ($form->questions as $q) {
                if (! isset($stats[$q->id])) {
                    continue;
                }
                $answer = $r->data[$q->id] ?? null;
                foreach ((array) $answer as $value) {
                    if (is_scalar($value) && $value !== '') {
                        $stats[$q->id][$value] = ($stats[$q->id][$value] ?? 0) + 1;
                    }
                }
            }
        }

        return response()->json($stats);
    }

    /**
     * Cuenta respuestas por pregunta y valor en PostgreSQL. Replica la regla del recorrido en PHP:
     * un valor suelto cuenta una vez, cada elemento de una lista (opción múltiple) y cada valor de un
     * objeto (fila de Likert) cuentan por separado, y se ignoran nulos, textos vacíos y valores anidados.
     *
     * @param  array<int, string>  $questionIds
     * @return array<int, object{question_id: string, answer: string, total: int}> answer = valor en JSON
     */
    private function aggregateChoiceAnswers(string $formId, array $questionIds): array
    {
        $placeholders = implode(', ', array_fill(0, count($questionIds), '?'));

        return DB::select(<<<SQL
            SELECT q.key AS question_id, x.value::text AS answer, COUNT(*) AS total
            FROM form_responses r
            CROSS JOIN LATERAL jsonb_each(r.data) AS q(key, value)
            CROSS JOIN LATERAL (
                SELECT e.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q.value) = 'array' THEN q.value ELSE '[]'::jsonb END) AS e(value)
                UNION ALL
                SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(q.value) = 'object' THEN q.value ELSE '{}'::jsonb END) AS o(key, value)
                UNION ALL
                SELECT q.value WHERE jsonb_typeof(q.value) NOT IN ('array', 'object')
            ) AS x(value)
            WHERE r.form_id = ?
              AND q.key IN ({$placeholders})
              AND jsonb_typeof(x.value) IN ('string', 'number', 'boolean')
              AND x.value <> '""'::jsonb
            GROUP BY q.key, x.value
            SQL, [$formId, ...$questionIds]);
    }

    #[OA\Get(path: '/forms/{id}/export', summary: 'Exportar respuestas CSV/XLSX', security: [['sanctum' => []]], tags: ['Forms'])]
    public function exportResponses(Request $request, string $id)
    {
        $form = $this->findResponsesReadableForm($id, $request->user());
        $form->load(['questions' => fn ($q) => $q->orderBy('order')]);

        $format = strtolower($request->query('format', 'csv'));
        abort_unless(in_array($format, ['csv', 'xlsx', 'excel'], true), 422, 'Formato de exportación no admitido.');
        $responseCount = $form->responses()->count();
        abort_if(($format === 'xlsx' || $format === 'excel') && $responseCount > 1000, 422,
            'Para más de 1.000 respuestas use CSV; XLSX excedería el límite de memoria.');
        $exportData = app(ResponseExportMatrixBuilder::class)->build($form);
        $filename = Str::slug($form->title).'_respuestas_'.now()->format('Y-m-d');

        if ($format === 'xlsx' || $format === 'excel') {
            $export = new class($exportData['rows'], $exportData['headers'], $form->title) extends DefaultValueBinder implements FromGenerator, ShouldAutoSize, WithCustomValueBinder, WithHeadings, WithStyles, WithTitle
            {
                public function __construct(private \Generator $rows, private array $headers, private string $formTitle) {}

                public function generator(): \Generator
                {
                    return $this->rows;
                }

                public function headings(): array
                {
                    return $this->headers;
                }

                public function bindValue(Cell $cell, $value): bool
                {
                    if (is_string($value)) {
                        $cell->setValueExplicit($value, DataType::TYPE_STRING);

                        return true;
                    }

                    return parent::bindValue($cell, $value);
                }

                public function title(): string
                {
                    $title = preg_replace('/[\\\\\/?*\[\]:]/', '', $this->formTitle) ?: 'Respuestas';

                    return mb_substr($title, 0, 31);
                }

                public function styles(Worksheet $sheet): array
                {
                    $sheet->freezePane('A2');
                    $sheet->setAutoFilter($sheet->calculateWorksheetDimension());

                    return [
                        1 => ['font' => ['bold' => true]],
                    ];
                }
            };

            $download = Excel::download($export, "{$filename}.xlsx");
            \App\Services\AuditLogService::logGeneratedExport($request->user(), $form, $responseCount, 'xlsx');

            return $download;
        }

        $actor = $request->user();

        return response()->streamDownload(function () use ($exportData, $actor, $form, $responseCount) {
            $handle = fopen('php://output', 'w');
            $sanitizer = app(SpreadsheetExportSanitizer::class);
            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));
            fputcsv($handle, array_map([$sanitizer, 'csvCell'], $exportData['headers']));
            foreach ($exportData['rows'] as $row) {
                fputcsv($handle, array_map([$sanitizer, 'csvCell'], $row));
            }
            fclose($handle);
            \App\Services\AuditLogService::logGeneratedExport($actor, $form, $responseCount, 'csv');
        }, "{$filename}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    #[OA\Post(path: '/forms/{id}/log-export', summary: 'Registrar auditoría de exportación', security: [['sanctum' => []]], tags: ['Forms'])]
    public function logExport(Request $request, string $id): JsonResponse
    {
        $form = $this->findResponsesReadableForm($id, $request->user());
        abort_unless(strtolower($request->input('format', 'pdf')) === 'pdf', 422, 'Formato no admitido.');
        \App\Services\AuditLogService::logClientReportedExport(
            $request->user(), $form, $form->responses()->count()
        );

        return response()->json(['success' => true]);
    }

    /** Save a complete draft in one transaction; no partially saved instrument. */
    public function saveDraft(Request $request, string $id): JsonResponse
    {
        $input = $request->validate([
            'title' => 'required|string|max:255', 'description' => 'nullable|string',
            'step_by_step' => 'required|boolean', 'consent_text' => 'required|string|min:10',
            'start_date' => 'nullable|date_format:Y-m-d', 'end_date' => 'nullable|date_format:Y-m-d|after_or_equal:start_date',
            'expected_revision' => 'required|integer|min:0',
            'questions' => 'required|array|min:1|max:500', 'questions.*.id' => 'required|uuid|distinct',
            'questions.*.type' => 'required|in:MULTIPLE_CHOICE,SINGLE_CHOICE,LIKERT,TEXT,NUMBER,NOTE,DATE,TIME,DATETIME,GPS,MULTIMEDIA,SIGNATURE,RANKING,RATING,BARCODE,CALCULATE',
            'questions.*.label' => 'required|string', 'questions.*.order' => 'required|integer|min:0',
            'questions.*.required' => 'required|boolean', 'questions.*.options' => 'nullable|array',
            'questions.*.properties' => 'nullable|array', 'questions.*.section_name' => 'nullable|string|max:255',
            'questions.*.parent_question_id' => 'nullable|uuid', 'questions.*.branch_rules' => 'nullable|array',
            'questions.*.branch_rules.*.option_index' => 'required|integer|min:0',
            'questions.*.branch_rules.*.action' => 'required|in:CONTINUE,GO_TO,END_FORM',
            'questions.*.branch_rules.*.next_question_id' => 'nullable|uuid',
        ]);
        $form = DB::transaction(function () use ($request, $id, $input) {
            $form = Form::whereKey($id)->lockForUpdate()->firstOrFail();
            $this->abortUnlessCanEdit($form, $request->user());
            abort_if($form->state === 'DEPLOYED' || $form->instrument_locked, 409,
                'Duplique el formulario publicado para modificar el instrumento.');
            abort_unless($this->projectPeriod->isValidated($form->project_id), 422, 'El líder debe validar la ficha técnica del proyecto.');
            $this->projectPeriod->assertWithin(
                $form->project_id,
                array_key_exists('start_date', $input) ? $input['start_date'] : $form->start_date?->format('Y-m-d'),
                array_key_exists('end_date', $input) ? $input['end_date'] : $form->end_date?->format('Y-m-d'),
            );
            if ($form->draft_revision !== $input['expected_revision']) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                    'message' => 'El formulario cambió desde que se abrió. Recargue antes de guardar.',
                    'expected_revision' => $input['expected_revision'],
                    'current_revision' => $form->draft_revision,
                ], 409));
            }
            $ids = array_column($input['questions'], 'id');
            abort_if(FormQuestion::whereIn('id', $ids)->where('form_id', '!=', $id)->exists(), 422, 'Las preguntas pertenecen a otro formulario.');
            $form->fill(collect($input)->except(['questions', 'expected_revision'])->all());
            $form->require_consent = true;
            $form->draft_revision++;
            $form->save();
            // First insert rows with no parent, then set references after all IDs exist.
            $form->questions()->update(['parent_question_id' => null]);
            $form->questions()->whereNotIn('id', $ids)->delete();
            foreach ($input['questions'] as $row) {
                $question = $form->questions()->find($row['id']) ?? new FormQuestion;
                $question->id = $row['id'];
                $question->form_id = $id;
                $question->fill(collect($row)->except(['id', 'parent_question_id'])->all());
                $question->save();
            }
            foreach ($input['questions'] as $row) {
                abort_if(! empty($row['parent_question_id']) && ! in_array($row['parent_question_id'], $ids, true), 422, 'La pregunta padre pertenece a otro formulario.');
                $form->questions()->whereKey($row['id'])->update(['parent_question_id' => $row['parent_question_id'] ?? null]);
            }
            $this->formSchemaValidator->validateForPublication($form->questions()->get());
            $this->enqueueFormSchemaSync->enqueue($form);
            return $form->fresh(['questions']);
        });
        return response()->json($form);
    }

    private function findResponsesReadableForm(string $id, User $user): Form
    {
        $form = Form::findOrFail($id);
        abort_unless(app(\App\Policies\FormPolicy::class)->viewResponses($user, $form), 403,
            'No tienes permisos para consultar o exportar las respuestas de este formulario.');
        return $form;
    }

    private function findViewableForm(string $id, User $user): Form
    {
        $form = Form::findOrFail($id);
        $this->abortUnlessCanView($form, $user);

        return $form;
    }

    private function findEditableForm(string $id, User $user): Form
    {
        $form = Form::findOrFail($id);
        $this->abortUnlessCanEdit($form, $user);

        return $form;
    }

    private function findShareManageableForm(string $id, User $user): Form
    {
        $form = Form::findOrFail($id);
        $this->abortUnlessCanManageShares($form, $user);

        return $form;
    }

    private function findLifecycleManageableForm(string $id, User $user): Form
    {
        $form = Form::findOrFail($id);
        $this->abortUnlessCanManageLifecycle($form, $user);

        return $form;
    }

    private function abortUnlessCanView(Form $form, User $user): void
    {
        if ($user->isSuperAdmin() || $user->isAdmin() || $user->leadsProject($form->project_id)
            || $user->isProjectDelegate($form->project_id) || (int) $form->user_id === (int) $user->id
            || $this->shareRole($form, $user) !== null) {
            return;
        }

        abort(response()->json(['message' => 'No tienes permisos para ver este formulario'], 403));
    }

    private function abortUnlessCanEdit(Form $form, User $user): void
    {
        $role = $this->shareRole($form, $user);
        if ($user->isSuperAdmin() || $user->isAdmin() || $user->leadsProject($form->project_id) || ((int) $form->user_id === (int) $user->id && ! $user->isUser()) || $role === 'PROJECT') {
            return;
        }

        abort(response()->json(['message' => 'No tienes permisos para editar este formulario'], 403));
    }

    private function abortUnlessCanManageShares(Form $form, User $user): void
    {
        if ($user->isSuperAdmin() || $user->isAdmin() || $user->leadsProject($form->project_id)) {
            return;
        }

        abort(response()->json(['message' => 'No tienes permisos para gestionar accesos de este formulario'], 403));
    }

    private function abortUnlessCanManageLifecycle(Form $form, User $user): void
    {
        if ($user->isSuperAdmin() || $user->isAdmin() || $user->leadsProject($form->project_id)) {
            return;
        }

        abort(response()->json(['message' => 'No tienes permisos para implementar o archivar este formulario'], 403));
    }

    private function canDeleteForm(Form $form, User $user): bool
    {
        return $user->isSuperAdmin() || $user->isAdmin() || $user->leadsProject($form->project_id) || ((int) $form->user_id === (int) $user->id && ! $user->isUser());
    }

    private function shareRole(Form $form, User $user): ?string
    {
        return FormUserShare::where('form_id', $form->id)
            ->where('user_id', $user->id)
            ->value('role');
    }

    private function missingRequiredQuestions(Form $form, array $data): array
    {
        $missing = [];

        $flowQuestions = $this->questionsInSubmissionFlow($form, $data);
        $questionById = collect($flowQuestions)->keyBy('id');

        foreach ($flowQuestions as $question) {
            if (! $question->required) {
                continue;
            }

            if (! $this->isRequiredQuestionActive($question, $data, $questionById->all())) {
                continue;
            }

            $answer = $data[$question->id] ?? null;
            if (! $this->hasRequiredAnswer($question, $answer)) {
                $missing[] = [
                    'id' => $question->id,
                    'label' => $question->label,
                ];
            }
        }

        return $missing;
    }

    /**
     * @param  array<string, FormQuestion>  $questionById
     */
    private function isRequiredQuestionActive(FormQuestion $question, array $data, array $questionById): bool
    {
        $parentId = $question->parent_question_id ?? null;
        if (! $parentId) {
            return true;
        }

        $parent = $questionById[$parentId] ?? null;
        if (! $parent instanceof FormQuestion) {
            return true;
        }

        $parentAnswer = $data[$parent->id] ?? null;

        return $this->hasRequiredAnswer($parent, $parentAnswer);
    }

    /**
     * @return array<int, FormQuestion>
     */
    private function questionsInSubmissionFlow(Form $form, array $data): array
    {
        $questions = $form->questions()->orderBy('order')->get()->values();

        if (! $form->step_by_step) {
            return $questions->all();
        }

        $questionIndexes = $questions->pluck('id')->flip()->all();
        $conditionalTargetIds = $this->conditionalTargetIds($questions->all());
        $flow = [];
        $currentIndex = 0;
        $visited = [];

        while ($currentIndex < $questions->count()) {
            /** @var FormQuestion $question */
            $question = $questions[$currentIndex];

            if (isset($visited[$question->id])) {
                break;
            }

            $visited[$question->id] = true;
            $flow[] = $question;

            $nextIndex = $this->nextSequentialIndex($questions->all(), $currentIndex, $conditionalTargetIds);

            if ($question->type === 'SINGLE_CHOICE') {
                $selectedIndex = $this->selectedOptionIndex($question, $data[$question->id] ?? null);
                $branchDecision = $this->branchDecisionForQuestion($question, $selectedIndex);

                if (($branchDecision['action'] ?? 'CONTINUE') === 'END_FORM') {
                    $nextIndex = $questions->count();
                } else {
                    $branchTarget = $branchDecision['target'] ?? null;
                    if ($branchTarget !== null && isset($questionIndexes[$branchTarget]) && $questionIndexes[$branchTarget] > $currentIndex) {
                        $nextIndex = $questionIndexes[$branchTarget];
                    }
                }
            }

            if ($nextIndex <= $currentIndex) {
                break;
            }

            $currentIndex = $nextIndex;
        }

        return $flow;
    }

    /**
     * @param  array<int, FormQuestion>  $questions
     * @return array<string, bool>
     */
    private function conditionalTargetIds(array $questions): array
    {
        $targets = [];

        foreach ($questions as $question) {
            if ($question->type !== 'SINGLE_CHOICE' || ! is_array($question->branch_rules)) {
                continue;
            }

            foreach ($question->branch_rules as $rule) {
                if (! is_array($rule)) {
                    continue;
                }

                $action = $rule['action'] ?? ((isset($rule['next_question_id']) && is_string($rule['next_question_id']) && $rule['next_question_id'] !== '') ? 'GO_TO' : 'CONTINUE');
                $target = $rule['next_question_id'] ?? null;

                if ($action === 'GO_TO' && is_string($target) && $target !== '') {
                    $targets[$target] = true;
                }
            }
        }

        return $targets;
    }

    /**
     * @param  array<int, FormQuestion>  $questions
     * @param  array<string, bool>  $conditionalTargetIds
     */
    private function nextSequentialIndex(array $questions, int $currentIndex, array $conditionalTargetIds): int
    {
        $nextIndex = $currentIndex + 1;

        while ($nextIndex < count($questions)) {
            $candidate = $questions[$nextIndex] ?? null;
            if (! $candidate || ! isset($conditionalTargetIds[$candidate->id])) {
                break;
            }

            $nextIndex++;
        }

        return $nextIndex;
    }

    private function selectedOptionIndex(FormQuestion $question, mixed $answer): ?int
    {
        if (! is_array($question->options)) {
            return null;
        }

        $options = array_values(array_filter($question->options, fn ($option) => is_scalar($option) && $option !== ''));
        $answerValue = is_scalar($answer) ? trim((string) $answer) : '';

        if ($answerValue === '') {
            return null;
        }

        foreach ($options as $index => $option) {
            if ((string) $option === $answerValue) {
                return $index;
            }
        }

        return null;
    }

    /**
     * @return array{action: string, target: ?string}
     */
    private function branchDecisionForQuestion(FormQuestion $question, ?int $selectedIndex): array
    {
        if ($selectedIndex === null || ! is_array($question->branch_rules)) {
            return ['action' => 'CONTINUE', 'target' => null];
        }

        foreach ($question->branch_rules as $rule) {
            if (! is_array($rule)) {
                continue;
            }

            $optionIndex = $rule['option_index'] ?? $rule['optionIndex'] ?? null;
            if ((int) $optionIndex !== $selectedIndex) {
                continue;
            }

            $action = $rule['action'] ?? 'CONTINUE';
            if (! in_array($action, ['CONTINUE', 'GO_TO', 'END_FORM'], true)) {
                $action = 'CONTINUE';
            }

            $target = $rule['next_question_id'] ?? $rule['nextQuestionId'] ?? null;
            $resolvedTarget = is_string($target) && $target !== '' ? $target : null;

            if ($action !== 'GO_TO') {
                $resolvedTarget = null;
            }

            return ['action' => $action, 'target' => $resolvedTarget];
        }

        return ['action' => 'CONTINUE', 'target' => null];
    }

    private function hasRequiredAnswer(FormQuestion $question, mixed $answer): bool
    {
        if ($answer === null || $answer === '') {
            return false;
        }

        if ($question->type === 'MULTIPLE_CHOICE') {
            return is_array($answer) && count(array_filter($answer, fn ($value) => $value !== null && $value !== '')) > 0;
        }

        if ($question->type === 'LIKERT') {
            $rows = is_array($question->options) && isset($question->options['rows']) && is_array($question->options['rows'])
                ? $question->options['rows']
                : [$question->label];

            if (! is_array($answer)) {
                return false;
            }

            foreach ($rows as $row) {
                if (! isset($answer[$row]) || $answer[$row] === null || $answer[$row] === '') {
                    return false;
                }
            }

            return true;
        }

        if (is_array($answer)) {
            return ! empty(array_filter($answer, fn ($v) => $v !== null && $v !== ''));
        }

        if (is_scalar($answer)) {
            return trim((string) $answer) !== '';
        }

        return true;
    }

    private function formatMobileQuestion(FormQuestion $question): array
    {
        $data = $question->toArray();
        $data['calculation_expression'] = $question->type === 'CALCULATE'
            ? ($question->properties['expression'] ?? null) : null;
        $data['options'] = is_array($question->options) ? array_values(array_filter($question->options, fn ($v) => is_scalar($v))) : [];

        if ($question->type === 'LIKERT') {
            $opts = is_array($question->options) ? $question->options : [];
            $data['likert_rows'] = isset($opts['rows']) && is_array($opts['rows']) ? array_values($opts['rows']) : [];
            $data['likert_columns'] = isset($opts['columns']) && is_array($opts['columns']) ? array_values($opts['columns']) : [];
            $data['options'] = $data['likert_columns'];
        }

        return $data;
    }

    /**
     * @param  array<string, array{target_responses: ?int, responses_count: int}>|null  $userStats  precalculado con userFormStats()
     */
    private function formatMobileForm(Form $form, ?User $user = null, ?array $userStats = null, ?array $zoneCounts = null): array
    {
        // Explicit projection: never expose loaded shares, users or project relations.
        $data = $form->only(['id', 'title', 'description', 'project_id', 'state', 'link_uuid', 'step_by_step', 'created_at', 'updated_at', 'instrument_locked', 'draft_revision']);
        $data['draft_revision'] = (int) ($form->draft_revision ?? 0);
        $data['require_consent'] = (bool) ($form->require_consent ?? true);
        $data['consent_text'] = $form->consent_text;
        $data['start_date'] = $form->start_date?->format('Y-m-d');
        $data['end_date'] = $form->end_date?->format('Y-m-d');
        $data['questions'] = $form->questions->map(fn ($q) => $this->formatMobileQuestion($q))->toArray();

        if ($form->project) {
            $data['project_name'] = $form->project->name;
            $data['project_description'] = $form->project->description;

            $zones = ($form->project->zones ?? collect())->where('form_id', $form->id);
            $userZones = ($user && $zones->isNotEmpty())
                ? $zones->filter(function ($z) use ($user) {
                    return $z->relationLoaded('assignedUsers')
                        ? $z->assignedUsers->contains('id', $user->id)
                        : $z->assignedUsers()->where('users.id', $user->id)->exists();
                })
                : collect();

            $applicableZones = (! $user || $user->canManageProjects() || $user->leadsProject($form->project_id))
                ? $zones : $userZones;

            $zoneCounts ??= $this->zoneResponseCounts([$form->id]);
            $data['project_zones'] = $applicableZones->values()->map(function ($zone) use ($zoneCounts) {
                return [
                    'target_responses' => $zone->target_responses,
                    'responses_count' => (int) ($zoneCounts[$zone->id] ?? 0),
                    'id' => $zone->id,
                    'name' => $zone->name,
                    'description' => $zone->description,
                    'geofence_type' => $zone->geofence_type ?? 'radius',
                    'target_lat' => $zone->target_lat !== null ? (float) $zone->target_lat : null,
                    'target_lng' => $zone->target_lng !== null ? (float) $zone->target_lng : null,
                    'radius_meters' => (int) ($zone->radius_meters ?? 500),
                    'hierarchy_json' => $zone->hierarchy_json,
                    'geometry_json' => $zone->geometry_json,
                ];
            })->toArray();
        } else {
            $data['project_zones'] = [];
        }

        if ($user) {
            $stats = ($userStats ?? $this->userFormStats([$form->id], $user))[$form->id] ?? null;

            $data['target_responses'] = $stats['target_responses'] ?? null;
            $data['responses_count'] = $stats['responses_count'] ?? null;
        }

        return $data;
    }

    /**
     * Encuestas recibidas por zona (la zona viaja en data._project_geofence.zone_id), en una consulta.
     *
     * @param  array<int, string>  $formIds
     * @return array<string, int>  zone_id => total
     */
    private function zoneResponseCounts(array $formIds): array
    {
        if ($formIds === []) {
            return [];
        }
        if (DB::connection()->getDriverName() === 'pgsql') {
            return FormResponse::whereIn('form_id', $formIds)
                ->whereRaw("data->'_project_geofence'->>'zone_id' IS NOT NULL")
                ->groupByRaw("data->'_project_geofence'->>'zone_id'")
                ->selectRaw("data->'_project_geofence'->>'zone_id' AS zone_id, COUNT(*) AS total")
                ->pluck('total', 'zone_id')->map(fn ($total) => (int) $total)->all();
        }
        $counts = [];
        foreach (\App\Models\ProjectZone::whereIn('form_id', $formIds)->pluck('id') as $zoneId) {
            $counts[$zoneId] = FormResponse::whereIn('form_id', $formIds)
                ->where('data->_project_geofence->zone_id', $zoneId)->count();
        }

        return $counts;
    }

    /**
     * Meta y avance del usuario por formulario en dos consultas, sin importar cuántos formularios haya.
     * Solo incluye formularios donde el usuario tiene una asignación (igual que el comportamiento anterior).
     *
     * @param  array<int, string>  $formIds
     * @return array<string, array{target_responses: ?int, responses_count: int}>
     */
    private function userFormStats(array $formIds, User $user): array
    {
        if ($formIds === []) {
            return [];
        }

        $shares = FormUserShare::whereIn('form_id', $formIds)
            ->where('user_id', $user->id)
            ->get(['form_id', 'target_responses'])
            ->keyBy('form_id');

        if ($shares->isEmpty()) {
            return [];
        }

        $counts = FormResponse::whereIn('form_id', $shares->keys()->all())
            ->where('user_id', $user->id)
            ->groupBy('form_id')
            ->selectRaw('form_id, COUNT(*) AS total')
            ->pluck('total', 'form_id');

        $stats = [];
        foreach ($shares as $formId => $share) {
            $stats[$formId] = [
                'target_responses' => $share->target_responses,
                'responses_count' => (int) ($counts[$formId] ?? 0),
            ];
        }

        return $stats;
    }

    private function chartOptionsForQuestion(FormQuestion $question): array
    {
        if (! is_array($question->options)) {
            return [];
        }

        if ($question->type === 'LIKERT' && isset($question->options['columns']) && is_array($question->options['columns'])) {
            return array_values(array_filter($question->options['columns'], fn ($option) => $option !== null && $option !== ''));
        }

        return array_values(array_filter($question->options, fn ($option) => is_scalar($option) && $option !== ''));
    }
}
