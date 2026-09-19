<?php

namespace App\Presentation\Http\Requests\Mobile;

use App\Domain\Forms\Services\FormResponseValidator;
use App\Models\Form;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SubmitMobileResponseRequest extends FormRequest
{
    private ?Form $resolvedForm = null;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'form_id' => 'required_without:link_uuid|nullable|uuid|exists:forms,id',
            'link_uuid' => 'required_without:form_id|nullable|string|exists:forms,link_uuid',
            'data' => 'required|array',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $form = $this->getForm();

            if (!$form) {
                $v->errors()->add('form_id', 'Formulario no encontrado o inaccesible.');
                return;
            }

            if ($form->state !== 'DEPLOYED') {
                $v->errors()->add('form_id', 'El formulario no se encuentra en estado implementado (DEPLOYED).');
                return;
            }

            $data = $this->input('data', []);
            if (!is_array($data)) {
                return;
            }

            $responseValidator = app(FormResponseValidator::class);
            $responseValidator->validate($form, $data, $v);
        });
    }

    public function getForm(): ?Form
    {
        if ($this->resolvedForm) {
            return $this->resolvedForm;
        }

        $linkUuid = $this->route('link_uuid') ?? $this->input('link_uuid');
        if ($linkUuid) {
            $this->resolvedForm = Form::where('link_uuid', $linkUuid)->first();
            return $this->resolvedForm;
        }

        $formId = $this->input('form_id');
        if ($formId) {
            $this->resolvedForm = Form::find($formId);
            return $this->resolvedForm;
        }

        return null;
    }
}
