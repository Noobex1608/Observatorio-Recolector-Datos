<?php

declare(strict_types=1);

namespace App\Infrastructure\Mail;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\MessageConverter;

/**
 * Envía correos con Microsoft Graph (POST /users/{buzón}/sendMail) usando el token de la aplicación
 * registrada en Entra ID (client credentials). TI debe darle el permiso Mail.Send y limitarlo al buzón
 * de la aplicación con una Application Access Policy.
 */
class MicrosoftGraphTransport extends AbstractTransport
{
    public function __construct(
        private readonly string $tenantId,
        private readonly string $clientId,
        private readonly string $clientSecret,
        private readonly string $sender,
    ) {
        parent::__construct();
    }

    protected function doSend(SentMessage $message): void
    {
        $email = MessageConverter::toEmail($message->getOriginalMessage());
        $recipients = fn (array $addresses) => array_map(
            fn (Address $address) => ['emailAddress' => array_filter(['address' => $address->getAddress(), 'name' => $address->getName()])],
            $addresses,
        );

        $payload = [
            'message' => array_filter([
                'subject' => (string) $email->getSubject(),
                'body' => $email->getHtmlBody() !== null
                    ? ['contentType' => 'HTML', 'content' => (string) $email->getHtmlBody()]
                    : ['contentType' => 'Text', 'content' => (string) $email->getTextBody()],
                'toRecipients' => $recipients($email->getTo()),
                'ccRecipients' => $recipients($email->getCc()),
                'bccRecipients' => $recipients($email->getBcc()),
                'replyTo' => $recipients($email->getReplyTo()),
                'attachments' => $this->attachments($email),
            ], fn ($value) => $value !== []),
            'saveToSentItems' => false,
        ];

        $response = Http::withToken($this->accessToken())->acceptJson()->timeout(20)
            ->post('https://graph.microsoft.com/v1.0/users/'.rawurlencode($this->sender).'/sendMail', $payload);

        if ($response->failed()) {
            throw new RuntimeException('Microsoft Graph no envió el correo (HTTP '.$response->status().'): '.$response->json('error.message', ''));
        }
    }

    public function __toString(): string
    {
        return 'microsoft-graph://'.$this->sender;
    }

    private function accessToken(): string
    {
        return Cache::remember('microsoft-graph-token:'.$this->clientId, now()->addMinutes(50), function () {
            $response = Http::asForm()->acceptJson()->timeout(15)
                ->post('https://login.microsoftonline.com/'.rawurlencode($this->tenantId).'/oauth2/v2.0/token', [
                    'client_id' => $this->clientId,
                    'client_secret' => $this->clientSecret,
                    'grant_type' => 'client_credentials',
                    'scope' => 'https://graph.microsoft.com/.default',
                ]);
            $token = $response->json('access_token');
            if ($response->failed() || ! is_string($token)) {
                throw new RuntimeException('No se obtuvo el token de Microsoft Graph para enviar correo.');
            }

            return $token;
        });
    }

    /** @return array<int, array<string, string>> */
    private function attachments(Email $email): array
    {
        $files = [];
        foreach ($email->getAttachments() as $part) {
            $files[] = [
                '@odata.type' => '#microsoft.graph.fileAttachment',
                'name' => (string) ($part->getFilename() ?? 'adjunto'),
                'contentType' => $part->getMediaType().'/'.$part->getMediaSubtype(),
                'contentBytes' => base64_encode($part->getBody()),
            ];
        }

        return $files;
    }
}
