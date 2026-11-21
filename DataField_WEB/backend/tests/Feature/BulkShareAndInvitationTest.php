<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\FormUserShare;
use App\Models\Project;
use App\Models\User;
use App\Notifications\AccountInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xls;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/**
 * «Compartir formulario» en bloque desde Excel, metas opcionales, alta de cuentas nuevas
 * y correos de confirmación: institucionales (Microsoft 365) y externos (contraseña).
 */
class BulkShareAndInvitationTest extends TestCase
{
    use RefreshDatabase;

    private const SHARE_HEADER = ['Correo electrónico', 'Nombres y apellidos', 'Cédula', 'Rol', 'Respuestas objetivo (opcional)'];

    private User $leader;

    private Project $project;

    private Form $form;

    protected function setUp(): void
    {
        parent::setUp();
        $this->leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $this->project = Project::create(['name' => 'Censo', 'created_by' => $this->leader->id]);
        $this->project->leaders()->attach($this->leader->id);
        $this->form = Form::create(['project_id' => $this->project->id, 'user_id' => $this->leader->id,
            'title' => 'Encuesta', 'state' => 'DRAFT']);
        Sanctum::actingAs($this->leader);
    }

    private function enableMicrosoft(): void
    {
        config([
            'services.microsoft.client_id' => 'cliente',
            'services.microsoft.client_secret' => 'secreto-de-prueba',
            'services.microsoft.tenant_id' => 'tenant',
        ]);
    }

    /** @param  array<int, array<int, mixed>>  $rows */
    private function excel(array $header, array $rows, string $format = 'xlsx'): UploadedFile
    {
        $book = new Spreadsheet;
        $book->getActiveSheet()->fromArray([$header, ...$rows], null, 'A1', true);
        $path = tempnam(sys_get_temp_dir(), 'imp');
        ($format === 'xls' ? new Xls($book) : new Xlsx($book))->save($path);
        $book->disconnectWorksheets();

        return new UploadedFile($path, "archivo.{$format}", null, null, true);
    }

    private function sharesUrl(string $suffix = ''): string
    {
        return "/api/forms/{$this->form->id}/shares{$suffix}";
    }

    public function test_template_has_the_share_columns(): void
    {
        $response = $this->get($this->sharesUrl('/template'))->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.ms-excel');
        $this->assertStringContainsString('plantilla-compartir-formulario.xls', (string) $response->headers->get('Content-Disposition'));
        $path = tempnam(sys_get_temp_dir(), 'tpl');
        file_put_contents($path, $response->streamedContent());
        $this->assertSame('Xls', IOFactory::identify($path));
        $sheet = IOFactory::load($path)->getActiveSheet();

        $this->assertSame(self::SHARE_HEADER, $sheet->rangeToArray('A1:E1')[0]);
        $this->assertSame('list', $sheet->getCell('D2')->getDataValidation()->getType());

        // La misma plantilla, rellenada, se importa sin cambios.
        $sheet->fromArray(['plantilla@gmail.com', 'Desde Plantilla', '1312345678', 'Recolector', 5], null, 'A2');
        (new Xls($sheet->getParent()))->save($path);
        $this->post($this->sharesUrl('/import'), ['file' => new UploadedFile($path, 'plantilla.xls', null, null, true), 'preview' => '1'])
            ->assertOk()->assertJsonPath('valid', true)->assertJsonPath('rows.0.target_responses', 5);
    }

    public function test_preview_reports_errors_per_row_and_import_is_all_or_nothing(): void
    {
        User::factory()->create(['email' => 'admin@uleam.edu.ec', 'rol' => User::ROLE_ADMIN]);
        $file = $this->excel(self::SHARE_HEADER, [
            ['nueva@gmail.com', 'Ana Pérez', '1312345678', 'Recolector', ''],
            ['', 'Sin correo', '1312345679', '', ''],
            ['otra@gmail.com', 'Luis Mora', '123', 'Jefe', '0'],
            ['admin@uleam.edu.ec', '', '', 'Project Manager', '5'],
        ]);

        $rows = $this->post($this->sharesUrl('/import'), ['file' => $file, 'preview' => '1'])
            ->assertOk()->assertJsonPath('valid', false)->json('rows');

        $this->assertSame([2, 3, 4, 5], array_column($rows, 'row'));
        $this->assertSame([], $rows[0]['errors']);
        $this->assertSame('nuevo', $rows[0]['status']);
        $this->assertContains('Correo electrónico inválido.', $rows[1]['errors']);
        $this->assertContains('Cédula: deben ser 10 dígitos.', $rows[2]['errors']);
        $this->assertContains('Rol: escribe Recolector o Project Manager.', $rows[2]['errors']);
        $this->assertContains('Respuestas objetivo: escribe un número entero mayor que 0 o déjalo vacío.', $rows[2]['errors']);
        $this->assertContains('Solo los recolectores pueden tener respuestas objetivo', $rows[3]['errors']);
        $this->assertContains('Correo o cédula ya pertenece a otra cuenta.', $rows[3]['errors']);

        $this->post($this->sharesUrl('/import'), ['file' => $file])->assertStatus(422);
        $this->assertDatabaseMissing('users', ['email' => 'nueva@gmail.com']);
    }

    public function test_import_creates_accounts_invites_them_and_assigns_project_and_form(): void
    {
        Notification::fake();
        $this->enableMicrosoft();
        $existing = User::factory()->create(['email' => 'Ya.Existe@gmail.com', 'rol' => User::ROLE_USER, 'cedula' => null]);
        $file = $this->excel(self::SHARE_HEADER, [
            ['externa@gmail.com', 'Externa Uno', '1312345678', 'Recolector', '15'],
            ['docente@uleam.edu.ec', 'Docente Dos', '0912345678', '', ''],
            ['ya.existe@gmail.com', '', '1712345678', 'project manager', ''],
        ]);

        $this->post($this->sharesUrl('/import'), ['file' => $file])->assertCreated()
            ->assertJsonPath('imported', 3)->assertJsonPath('created', 2)
            ->assertJsonPath('credentials', [])
            ->assertJsonPath('invited', ['externa@gmail.com', 'docente@uleam.edu.ec']);

        $external = User::where('email', 'externa@gmail.com')->firstOrFail();
        $internal = User::where('email', 'docente@uleam.edu.ec')->firstOrFail();
        $this->assertSame(User::ROLE_USER, $external->rol);
        $this->assertSame('1712345678', $existing->fresh()->cedula);
        foreach ([$external, $internal, $existing] as $user) {
            $this->assertTrue($this->project->collectors()->whereKey($user->id)->exists());
        }
        $this->assertSame(15, FormUserShare::where('user_id', $external->id)->value('target_responses'));
        $this->assertNull(FormUserShare::where('user_id', $internal->id)->value('target_responses'));
        $this->assertSame('PROJECT', FormUserShare::where('user_id', $existing->id)->value('role'));

        Notification::assertSentTo($external, AccountInvitationNotification::class,
            fn ($notification) => ! $notification->microsoft && ! str_contains($notification->activationUrl($external), 'tipo='));
        Notification::assertSentTo($internal, AccountInvitationNotification::class,
            fn ($notification) => $notification->microsoft && str_contains($notification->activationUrl($internal), 'tipo=microsoft'));
        Notification::assertNotSentTo($existing, AccountInvitationNotification::class);
    }

    public function test_xls_files_are_accepted(): void
    {
        Notification::fake();
        // En .xls la cédula llega como número y pierde el 0 inicial: se recupera.
        $file = $this->excel(self::SHARE_HEADER, [['viejo@gmail.com', 'Formato Viejo', 912345678, 'Recolector', 3]], 'xls');

        $this->post($this->sharesUrl('/import'), ['file' => $file, 'preview' => '1'])
            ->assertOk()->assertJsonPath('valid', true)->assertJsonPath('rows.0.cedula', '0912345678')
            ->assertJsonPath('rows.0.target_responses', 3);
        $this->post($this->sharesUrl('/import'), ['file' => $file])->assertCreated();
        $this->assertDatabaseHas('users', ['email' => 'viejo@gmail.com', 'cedula' => '0912345678']);

        $this->post($this->sharesUrl('/import'), ['file' => UploadedFile::fake()->create('datos.csv', 1)])
            ->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_collectors_cannot_import_shares(): void
    {
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));

        $this->get($this->sharesUrl('/template'))->assertForbidden();
        $this->post($this->sharesUrl('/import'), ['file' => $this->excel(self::SHARE_HEADER, [['a@gmail.com', 'A', '1312345678', '', '']])])
            ->assertForbidden();
    }

    public function test_single_share_has_optional_target_and_can_create_the_account(): void
    {
        Notification::fake();
        $collector = User::factory()->create(['email' => 'recolector@gmail.com', 'rol' => User::ROLE_USER]);

        $this->postJson($this->sharesUrl(), ['email' => 'RECOLECTOR@gmail.com', 'role' => 'RECOLECTOR'])
            ->assertCreated()->assertJsonPath('target_responses', null)->assertJsonPath('account_created', false);
        $this->assertTrue($this->project->collectors()->whereKey($collector->id)->exists());

        $this->postJson($this->sharesUrl(), ['email' => 'nadie@gmail.com', 'role' => 'RECOLECTOR'])->assertNotFound();
        $this->postJson($this->sharesUrl(), ['email' => 'nadie@gmail.com', 'role' => 'RECOLECTOR', 'name' => 'Nadie', 'cedula' => '12'])
            ->assertStatus(422);
        $this->postJson($this->sharesUrl(), ['email' => 'nadie@gmail.com', 'role' => 'RECOLECTOR', 'name' => 'Nueva Persona', 'cedula' => '1312345678', 'target_responses' => 4])
            ->assertCreated()->assertJsonPath('account_created', true)->assertJsonPath('invited', true);

        $created = User::where('email', 'nadie@gmail.com')->firstOrFail();
        $this->assertTrue($this->project->collectors()->whereKey($created->id)->exists());
        Notification::assertSentTo($created, AccountInvitationNotification::class);
    }

    public function test_single_share_rejects_people_inactive_in_the_project_team(): void
    {
        $collector = User::factory()->create(['email' => 'inactivo@gmail.com', 'rol' => User::ROLE_USER]);
        $this->project->collectors()->attach($collector->id, ['is_active' => false]);

        $this->postJson($this->sharesUrl(), ['email' => 'inactivo@gmail.com', 'role' => 'RECOLECTOR'])->assertStatus(422);
    }

    public function test_project_collector_import_invites_institutional_and_external_people(): void
    {
        Notification::fake();
        $this->enableMicrosoft();
        $file = $this->excel(['Cédula', 'Nombres', 'Apellidos', 'Correo electrónico'], [
            ['1312345678', 'Ana', 'Pérez', 'ana@gmail.com'],
            ['1312345679', 'Luis', 'Mora', 'luis@uleam.edu.ec'],
        ], 'xls');

        $this->post("/api/projects/{$this->project->id}/collectors/import", ['file' => $file])->assertCreated()
            ->assertJsonPath('credentials', [])->assertJsonPath('invited', ['ana@gmail.com', 'luis@uleam.edu.ec']);

        Notification::assertSentTo(User::where('email', 'luis@uleam.edu.ec')->first(), AccountInvitationNotification::class,
            fn ($notification) => $notification->microsoft);
        Notification::assertSentTo(User::where('email', 'ana@gmail.com')->first(), AccountInvitationNotification::class,
            fn ($notification) => ! $notification->microsoft);
    }

    public function test_project_collector_import_gives_temporary_passwords_while_microsoft_is_not_configured(): void
    {
        Notification::fake();
        $file = $this->excel(['Cédula', 'Nombres', 'Apellidos', 'Correo electrónico'], [['1312345679', 'Luis', 'Mora', 'luis@uleam.edu.ec']]);

        $this->post("/api/projects/{$this->project->id}/collectors/import", ['file' => $file])->assertCreated()
            ->assertJsonCount(1, 'credentials')->assertJsonPath('invited', []);
        Notification::assertNothingSent();
    }

    public function test_institutional_people_only_confirm_their_user_and_external_people_create_a_password(): void
    {
        Notification::fake();
        $this->enableMicrosoft();
        $file = $this->excel(self::SHARE_HEADER, [
            ['docente@uleam.edu.ec', 'Docente Dos', '0912345678', '', ''],
            ['externa@gmail.com', 'Externa Uno', '1312345678', '', ''],
        ]);
        $this->post($this->sharesUrl('/import'), ['file' => $file])->assertCreated();
        $internal = User::where('email', 'docente@uleam.edu.ec')->firstOrFail();
        $external = User::where('email', 'externa@gmail.com')->firstOrFail();
        $links = [];
        foreach ([$internal, $external] as $user) {
            Notification::assertSentTo($user, AccountInvitationNotification::class, function ($notification) use ($user, &$links) {
                parse_str((string) parse_url($notification->activationUrl($user), PHP_URL_QUERY), $links[$user->email]);

                return true;
            });
        }
        $this->app['auth']->forgetGuards();

        $internalLink = $links['docente@uleam.edu.ec'];
        $this->postJson('/api/auth/activate', ['email' => $internalLink['email'], 'token' => $internalLink['token'],
            'password' => 'Nueva-Clave-2026', 'password_confirmation' => 'Nueva-Clave-2026'])->assertStatus(422);
        $this->postJson('/api/auth/activate', ['email' => $internalLink['email'], 'token' => $internalLink['token']])
            ->assertOk()->assertJsonPath('microsoft', true);
        $this->assertNotNull($internal->fresh()->email_verified_at);
        $this->postJson('/api/auth/activate', ['email' => $internalLink['email'], 'token' => $internalLink['token']])->assertStatus(422);

        $externalLink = $links['externa@gmail.com'];
        $this->postJson('/api/auth/activate', ['email' => $externalLink['email'], 'token' => $externalLink['token']])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/auth/activate', ['email' => $externalLink['email'], 'token' => $externalLink['token'],
            'password' => 'Nueva-Clave-2026', 'password_confirmation' => 'Nueva-Clave-2026'])
            ->assertOk()->assertJsonPath('microsoft', false);
    }
}
