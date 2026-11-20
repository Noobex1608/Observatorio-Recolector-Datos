<?php

declare(strict_types=1);

namespace App\Presentation\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            // Las cuentas eliminadas no bloquean el correo: el caso de uso las reutiliza.
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->whereNull('deleted_at')],
            'password' => ['nullable', 'string', 'min:8'],
            'rol' => ['sometimes', 'string', 'in:SUPER_ADMIN,ADMIN,PROJECT,RECOLECTOR,SUPERVISOR'],
            'is_active' => ['sometimes', 'boolean'],
            'telefono' => ['nullable', 'string', 'max:20'],
            'cargo' => ['nullable', 'string', 'max:100'],
            'bio' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => __('El nombre es obligatorio'),
            'name.max' => __('El nombre no puede exceder 255 caracteres'),
            'email.required' => __('El email es obligatorio'),
            'email.email' => __('El email debe tener un formato válido'),
            'email.unique' => __('Este email ya está registrado'),
            'password.min' => __('La contraseña debe tener al menos 8 caracteres'),
            'rol.in' => __('El rol debe ser SUPER_ADMIN, ADMIN, PROJECT, RECOLECTOR o SUPERVISOR'),
            'is_active.boolean' => __('El campo is_active debe ser verdadero o falso'),
        ];
    }
}
