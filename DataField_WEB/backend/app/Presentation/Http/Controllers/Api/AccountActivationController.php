<?php

declare(strict_types=1);

namespace App\Presentation\Http\Controllers\Api;

use App\Application\Auth\Services\AccountInvitation;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;

/** Activación de cuentas externas (enlace del correo) y reenvío de la invitación por un administrador. */
class AccountActivationController extends Controller
{
    public function __construct(private readonly AccountInvitation $invitations) {}

    public function activate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)->mixedCase()->numbers()],
        ]);

        $status = Password::broker('invitations')->reset($data, function (User $user, string $password) {
            $user->forceFill([
                'password' => $password,
                'email_verified_at' => now(),
                'must_change_password' => false,
            ])->save();
            $user->tokens()->delete();
            AuditLogService::log($user, 'ACCOUNT_ACTIVATED', 'usuarios', "{$user->name} confirmó su correo y creó su contraseña.");
        });

        abort_unless($status === Password::PASSWORD_RESET, 422,
            'El enlace no es válido o ya venció. Pide al administrador que te reenvíe la invitación.');

        return response()->json(['message' => 'Cuenta confirmada. Ya puedes iniciar sesión.']);
    }

    public function resend(Request $request, string $id): JsonResponse
    {
        $admin = $request->user();
        $user = User::findOrFail($id);
        abort_unless($admin->canManageUsers() && $admin->canManageRole($user->rol), 403, 'No tienes permisos para administrar este usuario.');
        abort_unless($this->invitations->needsInvitation($user->email), 422,
            'Las cuentas institucionales de ULEAM entran con Microsoft 365 y no reciben invitación.');
        abort_if($user->email_verified_at !== null, 422, 'Este usuario ya confirmó su cuenta.');

        $this->invitations->send($user);

        return response()->json(['message' => "Invitación reenviada a {$user->email}."]);
    }
}
