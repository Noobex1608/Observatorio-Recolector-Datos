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

    /**
     * Externos: confirman el correo y crean su contraseña.
     * Institucionales con Microsoft 365: solo confirman su usuario (no tienen contraseña local).
     */
    public function activate(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email'], 'token' => ['required', 'string']]);
        $microsoft = $this->invitations->usesMicrosoft((string) $request->input('email'));
        $data = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
            'password' => $microsoft ? ['prohibited'] : ['required', 'confirmed', PasswordRule::min(12)->mixedCase()->numbers()],
        ]);
        $data['password'] = $data['password'] ?? null;

        $status = Password::broker('invitations')->reset($data, function (User $user, ?string $password) use ($microsoft) {
            if ($microsoft) {
                $user->forceFill(['email_verified_at' => now()])->save();
                AuditLogService::log($user, 'ACCOUNT_ACTIVATED', 'usuarios', ':name confirmó su usuario institucional.', [], params: ['name' => $user->name]);

                return;
            }
            $user->forceFill([
                'password' => $password,
                'email_verified_at' => now(),
                'must_change_password' => false,
            ])->save();
            $user->tokens()->delete();
            AuditLogService::log($user, 'ACCOUNT_ACTIVATED', 'usuarios', ':name confirmó su correo y creó su contraseña.', [], params: ['name' => $user->name]);
        });

        abort_unless($status === Password::PASSWORD_RESET, 422,
            __('El enlace no es válido o ya venció. Pide al administrador que te reenvíe la invitación.'));

        return response()->json([
            'message' => $microsoft
                ? __('Usuario confirmado. Entra con tu cuenta institucional de Microsoft 365.')
                : __('Cuenta confirmada. Ya puedes iniciar sesión.'),
            'microsoft' => $microsoft,
        ]);
    }

    public function resend(Request $request, string $id): JsonResponse
    {
        $admin = $request->user();
        $user = User::findOrFail($id);
        abort_unless($admin->canManageUsers() && $admin->canManageRole($user->rol), 403, __('No tienes permisos para administrar este usuario.'));
        abort_unless($this->invitations->needsInvitation($user->email), 422,
            __('Las cuentas institucionales de ULEAM entran con Microsoft 365 y no reciben invitación.'));
        abort_if($user->email_verified_at !== null, 422, __('Este usuario ya confirmó su cuenta.'));

        $this->invitations->send($user);

        return response()->json(['message' => __('Invitación reenviada a :email.', ['email' => $user->email])]);
    }
}
