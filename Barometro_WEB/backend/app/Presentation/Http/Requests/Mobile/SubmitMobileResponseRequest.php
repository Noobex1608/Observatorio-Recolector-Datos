<?php

namespace App\Presentation\Http\Requests\Mobile;

use App\Domain\Forms\Services\FormFlowEngine;
use App\Domain\Forms\Services\FormResponseCalculator;
use App\Domain\Forms\Services\FormResponseValidator;
use App\Domain\Forms\Services\TextFormat;
use App\Domain\Projects\Services\ProjectGeofenceVerifier;
use App\Models\Form;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SubmitMobileResponseRequest extends FormRequest
{
    private ?Form $resolvedForm = null;

    public function authorize(): bool
    {
        $form = $this->getForm();
        if (! $form) {
            return true; // Validation reports unknown/malformed identifiers.
        }
        if ($this->user()) {
            return app(\App\Policies\FormPolicy::class)->submit($this->user(), $form);
        }

        return $this->route('link_uuid') !== null;
    }

    public function validationData(): array
    {
        $data = parent::validationData();

        $linkUuid = $this->route('link_uuid') ?? $this->input('link_uuid');
        if ($linkUuid) {
            $data['link_uuid'] = $linkUuid;
        }

        $formId = $this->route('id') ?? $this->input('form_id');
        if ($formId) {
            $data['form_id'] = $formId;
        }

        return $data;
    }

    public function rules(): array
    {
        return [
            'form_id' => 'sometimes|nullable|uuid|exists:forms,id',
            'link_uuid' => 'sometimes|nullable|string|exists:forms,link_uuid',
            'data' => 'required|array',
            'client_submission_id' => 'required|uuid',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            if ($v->errors()->isNotEmpty()) {
                return;
            }
            $form = $this->getForm();

            if (! $form) {
                $v->errors()->add('form_id', 'Formulario no encontrado o inaccesible.');

                return;
            }

            if ($form->state !== 'DEPLOYED'
                || ($form->start_date && $form->start_date->format('Y-m-d') > now('America/Guayaquil')->toDateString())
                || ($form->end_date && $form->end_date->format('Y-m-d') < now('America/Guayaquil')->toDateString())) {
                $v->errors()->add('form_id', 'El formulario no se encuentra en estado implementado (DEPLOYED).');

                return;
            }

            $data = $this->input('data', []);
            if (! is_array($data)) {
                return;
            }

            if (($form->require_consent ?? true) && ($data['_consentimiento_aceptado'] ?? null) !== true) {
                $v->errors()->add('data._consentimiento_aceptado', 'Debe aceptarse el consentimiento informado antes de enviar la encuesta.');

                return;
            }

            $collector = $this->user()?->isUser();
            if ($collector && $form->zones()->exists() && ! array_key_exists('_project_geofence', $data)) {
                $v->errors()->add('data._project_geofence', 'Indique la zona asignada antes de enviar la encuesta.');

                return;
            }

            if (array_key_exists('_project_geofence', $data)) {
                $geofence = $data['_project_geofence'];
                $zoneId = is_array($geofence) ? ($geofence['zone_id'] ?? null) : null;
                $zone = is_string($zoneId) ? $form->zones()->whereKey($zoneId)->first() : null;
                if ($collector && ! $zone) {
                    $v->errors()->add('data._project_geofence.zone_id', 'El encuestador debe indicar una zona asignada del formulario.');

                    return;
                }
                $documentedException = is_array($geofence)
                    && ($geofence['fuera_de_zona'] ?? false) === true
                    && is_string($geofence['justificacion'] ?? null)
                    && trim($geofence['justificacion']) !== '';
                if (! $zone && ! $documentedException) {
                    $v->errors()->add('data._project_geofence.zone_id', 'La zona indicada no pertenece al formulario.');

                    return;
                }
                if (! $zone && $zoneId !== null) {
                    $v->errors()->add('data._project_geofence.zone_id', 'La zona indicada no pertenece al formulario.');

                    return;
                }
                if ($zone && ! ($geofence['fuera_de_zona'] ?? false)) {
                    $latitude = $geofence['latitud'] ?? null;
                    $longitude = $geofence['longitud'] ?? null;
                    if (! is_numeric($latitude) || ! is_numeric($longitude)
                        || ! is_finite((float) $latitude) || ! is_finite((float) $longitude)
                        || abs((float) $latitude) > 90 || abs((float) $longitude) > 180
                        || ! app(ProjectGeofenceVerifier::class)->contains($zone, (float) $latitude, (float) $longitude)) {
                        $v->errors()->add('data._project_geofence', 'La ubicación no coincide con la zona; registre una excepción justificada para continuar.');

                        return;
                    }
                }
                if ($this->user()
                    && ! $this->user()->canManageProjects() && ! $this->user()->leadsProject($form->project_id)
                    && ! ($zone
                        ? $zone->assignedUsers()->where('users.id', $this->user()->id)->exists()
                        : $form->zones()->whereHas('assignedUsers', fn ($query) => $query->where('users.id', $this->user()->id))->exists())) {
                    $v->errors()->add('data._project_geofence.zone_id', 'El encuestador no está asignado a esta zona.');

                    return;
                }
            }

            $questions = $form->questions()->orderBy('order')->get();
            // Correo, cédula y teléfono se guardan normalizados (minúsculas / solo dígitos).
            foreach ($questions as $question) {
                $format = $question->type === 'TEXT' ? TextFormat::of($question->properties) : null;
                if ($format !== null && is_string($data[$question->id] ?? null)) {
                    $data[$question->id] = TextFormat::normalize($format, $data[$question->id]);
                }
            }
            $data = app(FormResponseCalculator::class)->calculate($questions, $data);
            $active = app(FormFlowEngine::class)->calculateActiveQuestions($questions, $data, (bool) $form->step_by_step);
            app(FormResponseValidator::class)->validate($active, $data, $v, $questions);
            $inactiveIds = array_diff($questions->pluck('id')->all(), $active->pluck('id')->all());
            foreach ($inactiveIds as $inactiveId) {
                unset($data[$inactiveId]);
            }
            $this->merge(['data' => $data]);
        });
    }

    public function getForm(): ?Form
    {
        if ($this->resolvedForm) {
            return $this->resolvedForm;
        }

        $linkUuid = $this->route('link_uuid') ?? $this->input('link_uuid');
        if (is_string($linkUuid) && \Illuminate\Support\Str::isUuid($linkUuid)) {
            $this->resolvedForm = Form::where('link_uuid', $linkUuid)->first();

            return $this->resolvedForm;
        }

        $formId = $this->input('form_id');
        if (is_string($formId) && \Illuminate\Support\Str::isUuid($formId)) {
            $this->resolvedForm = Form::find($formId);

            return $this->resolvedForm;
        }

        return null;
    }
}
