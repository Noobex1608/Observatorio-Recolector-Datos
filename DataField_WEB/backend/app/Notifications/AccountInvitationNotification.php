<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Correo de confirmación para usuarios externos: confirma el correo y crea la contraseña. */
class AccountInvitationNotification extends Notification
{
    public function __construct(private readonly string $token) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function activationUrl(object $notifiable): string
    {
        return config('services.frontend_url').'/auth/activar?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $hours = (int) round(config('auth.passwords.invitations.expire', 4320) / 60);

        return (new MailMessage)
            ->subject('Confirma tu cuenta de ULEAM DataField')
            ->greeting("Hola, {$notifiable->name}")
            ->line('Se creó una cuenta para ti en ULEAM DataField, la plataforma de recolección de datos de la Universidad Laica Eloy Alfaro de Manabí.')
            ->line('Confirma tu correo y crea tu contraseña con el siguiente botón:')
            ->action('Confirmar cuenta y crear contraseña', $this->activationUrl($notifiable))
            ->line("El enlace vence en {$hours} horas. Si expira, pide al administrador que te lo reenvíe.")
            ->line('Si no esperabas este correo, puedes ignorarlo.');
    }
}
