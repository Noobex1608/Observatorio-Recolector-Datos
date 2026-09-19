<?php

declare(strict_types=1);

namespace App\Presentation\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $userId = $this->route('id');

        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => [
                'sometimes', 
                'string', 
                'email', 
                'max:255', 
                Rule::unique('users', 'email')->ignore($userId)
            ],
            'password' => ['nullable', 'string', 'min:8'],
            'rol' => ['sometimes', 'string', 'in:SUPER_ADMIN,ADMIN,PROJECT,RECOLECTOR'],
            'is_active' => ['sometimes', 'boolean'],
            'telefono' => ['nullable', 'string', 'max:20'],
            'cargo' => ['nullable', 'string', 'max:100'],
            'bio' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.max' => 'El nombre no puede exceder 255 caracteres',
            'email.email' => 'El email debe tener un formato válido',
            'email.unique' => 'Este email ya está en uso por otro usuario',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres',
            'rol.in' => 'El rol debe ser SUPER_ADMIN, ADMIN, PROJECT o RECOLECTOR',
            'is_active.boolean' => 'El campo is_active debe ser verdadero o falso',
        ];
    }
}
