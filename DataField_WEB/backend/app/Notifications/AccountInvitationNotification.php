<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Correo de confirmación de una cuenta nueva.
 * - Externos: confirman el correo y crean su contraseña.
 * - Institucionales ULEAM (Microsoft 365): solo confirman su usuario; después entran con Microsoft.
 */
class AccountInvitationNotification extends Notification
{
    public function __construct(private readonly string $token, public readonly bool $microsoft = false) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function activationUrl(object $notifiable): string
    {
        $query = ['token' => $this->token, 'email' => $notifiable->getEmailForPasswordReset()];
        if ($this->microsoft) {
            $query['tipo'] = 'microsoft';
        }

        return config('services.frontend_url').'/auth/activar?'.http_build_query($query);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $hours = (int) round(config('auth.passwords.invitations.expire', 4320) / 60);
        $mail = (new MailMessage)
            ->subject(__('Confirma tu cuenta de ULEAM DataField'))
            ->greeting(__('Hola, :name', ['name' => $notifiable->name]))
            ->line(__('Se creó una cuenta para ti en ULEAM DataField, la plataforma de recolección de datos de la Universidad Laica Eloy Alfaro de Manabí.'));

        if ($this->microsoft) {
            $mail->line(__('Confirma tu usuario con el siguiente botón. Después entra con tu cuenta institucional de Microsoft 365; no necesitas crear una contraseña.'))
                ->action(__('Confirmar mi usuario'), $this->activationUrl($notifiable));
        } else {
            $mail->line(__('Confirma tu correo y crea tu contraseña con el siguiente botón:'))
                ->action(__('Confirmar cuenta y crear contraseña'), $this->activationUrl($notifiable));
        }

        return $mail
            ->line(__('El enlace vence en :hours horas. Si expira, pide al administrador que te lo reenvíe.', ['hours' => $hours]))
            ->line(__('Si no esperabas este correo, puedes ignorarlo.'));
    }
}
