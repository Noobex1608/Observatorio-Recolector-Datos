<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Application\Profile\Services\AvatarStorage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Las fotos de perfil se guardan optimizadas para la web: cuadradas, 256×256, WebP y sin metadatos. */
class AvatarOptimizationTest extends TestCase
{
    use RefreshDatabase;

    private function photo(int $width, int $height, string $name = 'foto.jpg'): UploadedFile
    {
        $image = imagecreatetruecolor($width, $height);
        // Ruido para que el original pese como una foto real.
        for ($i = 0; $i < 4000; $i++) {
            imagesetpixel($image, random_int(0, $width - 1), random_int(0, $height - 1), random_int(0, 0xFFFFFF));
        }
        $path = tempnam(sys_get_temp_dir(), 'av').'.jpg';
        imagejpeg($image, $path, 95);
        imagedestroy($image);

        return new UploadedFile($path, $name, 'image/jpeg', null, true);
    }

    public function test_uploaded_photo_is_saved_as_a_small_square_webp(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $original = $this->photo(1600, 1000);
        $response = $this->post('/api/profile/avatar', ['avatar' => $original])->assertOk();

        $url = $response->json('data.perfil.avatar');
        $this->assertMatchesRegularExpression('~/api/avatars/[0-9a-f-]{36}\.webp$~', $url);
        $stored = 'avatars/'.basename($url);
        Storage::disk('public')->assertExists($stored);

        $bytes = Storage::disk('public')->get($stored);
        $info = getimagesizefromstring($bytes);
        $this->assertSame([256, 256, 'image/webp'], [$info[0], $info[1], $info['mime']]);
        $this->assertLessThan($original->getSize() / 4, strlen($bytes));
        $this->assertStringNotContainsString('Exif', $bytes);

        // Una nueva foto reemplaza a la anterior y la borra.
        $second = $this->post('/api/profile/avatar', ['avatar' => $this->photo(300, 900)])->assertOk()->json('data.perfil.avatar');
        Storage::disk('public')->assertMissing($stored);
        Storage::disk('public')->assertExists('avatars/'.basename($second));
        $this->assertSame([256, 256], array_slice(getimagesizefromstring(Storage::disk('public')->get('avatars/'.basename($second))), 0, 2));
    }

    public function test_command_converts_existing_avatars_once(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        $base = rtrim((string) config('app.url'), '/').'/api/avatars/';
        $jpg = (string) file_get_contents($this->photo(900, 600)->getRealPath());
        Storage::disk('public')->put('avatars/vieja.jpg', $jpg);
        Storage::disk('local')->put('public/avatars/antigua.jpg', $jpg); // ubicación de versiones anteriores
        $old = User::factory()->create();
        $old->perfil()->create(['avatar' => $base.'vieja.jpg']);
        $legacy = User::factory()->create();
        $legacy->perfil()->create(['avatar' => $base.'antigua.jpg']);
        $lost = User::factory()->create();
        $lost->perfil()->create(['avatar' => $base.'perdida.png']);

        $this->artisan('avatars:optimize --dry-run')->expectsOutputToContain('Se convertirían: 2.')->assertSuccessful();
        Storage::disk('public')->assertExists('avatars/vieja.jpg');

        $this->artisan('avatars:optimize')->expectsOutputToContain('Convertidas: 2. Ya optimizadas: 0. Sin archivo: 1.')->assertSuccessful();
        foreach ([$old, $legacy] as $user) {
            $url = $user->perfil()->first()->avatar;
            $this->assertStringEndsWith('.webp', $url);
            $info = getimagesizefromstring(Storage::disk('public')->get('avatars/'.basename($url)));
            $this->assertSame([256, 256, 'image/webp'], [$info[0], $info[1], $info['mime']]);
        }
        Storage::disk('public')->assertMissing('avatars/vieja.jpg');
        Storage::disk('local')->assertMissing('public/avatars/antigua.jpg');
        $this->assertSame($base.'perdida.png', $lost->perfil()->first()->avatar);

        $this->artisan('avatars:optimize')->expectsOutputToContain('Convertidas: 0. Ya optimizadas: 2.')->assertSuccessful();
    }

    public function test_small_images_are_not_enlarged_and_bad_files_are_rejected(): void
    {
        $small = app(AvatarStorage::class)->optimize((string) file_get_contents($this->photo(120, 90)->getRealPath()));
        $this->assertSame([90, 90], array_slice(getimagesizefromstring($small), 0, 2));

        Storage::fake('public');
        Sanctum::actingAs(User::factory()->create());
        $fake = UploadedFile::fake()->createWithContent('foto.png', 'esto no es una imagen');
        $this->post('/api/profile/avatar', ['avatar' => $fake], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('avatar');
        $this->assertSame([], Storage::disk('public')->allFiles('avatars'));
    }
}
