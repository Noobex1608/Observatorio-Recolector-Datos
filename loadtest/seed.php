<?php

// Datos para la prueba de carga: un proyecto, 3 formularios desplegados de 20 preguntas,
// N encuestadores asignados a los 3 y respuestas previas para que las consultas tengan volumen.
// Además: un formulario con foto (k6-fotos.js), uno de 1.000 respuestas para exportar en XLSX y el
// token del líder del proyecto para las exportaciones (k6-exportaciones.js).
// Uso (dentro del contenedor api):  php loadtest-seed.php 400 20000 [zonas] > tokens.json
// zonas (por defecto 0): zonas por formulario, con todos los encuestadores asignados y meta alta,
// para que cada envío pase por el conteo de la meta de zona (lo usa k6-escritura.js).
// Imprime en stdout un JSON con los tokens y los ids que usa el script de k6.

use App\Models\Form;
use App\Models\FormUserShare;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$collectors = (int) ($argv[1] ?? 400);
$previous = (int) ($argv[2] ?? 20000);
$zonesPerForm = (int) ($argv[3] ?? 0);

$owner = User::create([
    'name' => 'LIDER CARGA', 'email' => 'lider@carga.test', 'cedula' => '0000000001',
    'password' => Hash::make(Str::random(24)), 'rol' => 'PROJECT', 'is_active' => true,
]);
$project = Project::create(['name' => 'Proyecto prueba de carga']);

$forms = [];
for ($f = 1; $f <= 3; $f++) {
    $form = Form::create([
        'title' => "Encuesta de carga {$f}", 'description' => 'Prueba k6',
        'user_id' => $owner->id, 'project_id' => $project->id,
        'state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid(),
    ]);
    $questions = [];
    for ($q = 1; $q <= 20; $q++) {
        $type = ['TEXT', 'NUMBER', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE'][$q % 4];
        $questions[] = $form->questions()->create([
            'type' => $type, 'label' => "Pregunta {$q}", 'required' => $q <= 10, 'order' => $q,
            'options' => str_ends_with($type, 'CHOICE') ? ['Opción A', 'Opción B', 'Opción C', 'Opción D'] : null,
        ]);
    }
    $zones = [];
    for ($z = 1; $z <= $zonesPerForm; $z++) {
        $zones[] = ProjectZone::create([
            'project_id' => $project->id, 'form_id' => $form->id, 'name' => "Zona {$f}-{$z}",
            'geofence_type' => 'radius', 'target_lat' => -0.95, 'target_lng' => -80.72, 'radius_meters' => 5000,
            'target_responses' => 1000000,
        ])->id;
    }
    $forms[] = ['id' => $form->id, 'zones' => $zones, 'questions' => array_map(fn ($q) => ['id' => $q->id, 'type' => $q->type], $questions)];
}

// Formulario con foto (k6-fotos.js): 3 preguntas de texto y una de foto de hasta 30 MB (el máximo permitido).
$mediaForm = Form::create([
    'title' => 'Encuesta con foto', 'description' => 'Prueba k6 de envíos con archivos',
    'user_id' => $owner->id, 'project_id' => $project->id, 'state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid(),
]);
$mediaQuestions = [];
for ($q = 1; $q <= 3; $q++) {
    $mediaQuestions[] = $mediaForm->questions()->create(['type' => 'TEXT', 'label' => "Dato {$q}", 'required' => true, 'order' => $q]);
}
$mediaQuestions[] = $mediaForm->questions()->create([
    'type' => 'MULTIMEDIA', 'label' => 'Foto del recinto', 'required' => true, 'order' => 4,
    'properties' => ['media_type' => 'image', 'max_file_size_mb' => 30],
]);

// Formulario para exportar en XLSX: el código limita XLSX a 1.000 respuestas, así que se llena justo hasta ahí.
$xlsxForm = Form::create([
    'title' => 'Encuesta exportacion XLSX', 'description' => 'Prueba k6 de exportaciones',
    'user_id' => $owner->id, 'project_id' => $project->id, 'state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid(),
]);
$xlsxQuestions = [];
for ($q = 1; $q <= 20; $q++) {
    $type = ['TEXT', 'NUMBER', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE'][$q % 4];
    $xlsxQuestions[] = $xlsxForm->questions()->create([
        'type' => $type, 'label' => "Pregunta {$q}", 'required' => false, 'order' => $q,
        'options' => str_ends_with($type, 'CHOICE') ? ['Opción A', 'Opción B', 'Opción C', 'Opción D'] : null,
    ]);
}

$users = [];
for ($i = 1; $i <= $collectors; $i++) {
    $user = User::create([
        'name' => "ENCUESTADOR {$i}", 'email' => "encuestador{$i}@carga.test", 'cedula' => sprintf('1%09d', $i),
        'password' => Hash::make(Str::random(24)), 'rol' => 'RECOLECTOR', 'is_active' => true,
    ]);
    // Sin meta personal: en la prueba los rechazos deben venir de la capacidad, no de «alcanzaste tu meta».
    FormUserShare::create(['form_id' => $mediaForm->id, 'user_id' => $user->id, 'role' => 'RECOLECTOR', 'target_responses' => null]);
    foreach ($forms as $form) {
        FormUserShare::create(['form_id' => $form['id'], 'user_id' => $user->id, 'role' => 'RECOLECTOR', 'target_responses' => null]);
        foreach ($form['zones'] as $zoneId) {
            DB::table('project_zone_user_assignments')->insert([
                'zone_id' => $zoneId, 'user_id' => $user->id, 'role' => 'RECOLECTOR', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }
    $users[] = ['id' => $user->id, 'token' => $user->createToken('k6')->plainTextToken];
}

// Respuestas previas repartidas entre formularios y encuestadores (inserción directa, en lotes).
$now = now();
$rows = [];
for ($r = 0; $r < $previous; $r++) {
    $form = $forms[$r % 3];
    $data = [];
    foreach ($form['questions'] as $q) {
        $data[$q['id']] = match ($q['type']) {
            'NUMBER' => random_int(1, 99),
            'SINGLE_CHOICE' => 'Opción B',
            'MULTIPLE_CHOICE' => ['Opción A', 'Opción C'],
            default => 'Respuesta de texto de prueba',
        };
    }
    if ($form['zones']) {
        $data['_project_geofence'] = [
            'zone_id' => $form['zones'][intdiv($r, 3) % count($form['zones'])],
            'latitud' => -0.95, 'longitud' => -80.72, 'fuera_de_zona' => false,
        ];
    }
    $rows[] = [
        'id' => (string) Str::uuid(), 'client_submission_id' => (string) Str::uuid(),
        'form_id' => $form['id'], 'user_id' => $users[$r % count($users)]['id'],
        'data' => json_encode($data), 'created_at' => $now, 'updated_at' => $now,
    ];
    if (count($rows) === 1000) {
        DB::table('form_responses')->insert($rows);
        $rows = [];
    }
}
if ($rows) {
    DB::table('form_responses')->insert($rows);
}

// 1.000 respuestas para el formulario de exportación XLSX.
$rows = [];
for ($r = 0; $r < 1000; $r++) {
    $data = [];
    foreach ($xlsxQuestions as $q) {
        $data[$q->id] = match ($q->type) {
            'NUMBER' => random_int(1, 99), 'SINGLE_CHOICE' => 'Opción B',
            'MULTIPLE_CHOICE' => ['Opción A', 'Opción C'], default => 'Respuesta de texto de prueba',
        };
    }
    $rows[] = [
        'id' => (string) Str::uuid(), 'client_submission_id' => (string) Str::uuid(),
        'form_id' => $xlsxForm->id, 'user_id' => $users[$r % count($users)]['id'],
        'data' => json_encode($data), 'created_at' => $now, 'updated_at' => $now,
    ];
}
foreach (array_chunk($rows, 500) as $chunk) {
    DB::table('form_responses')->insert($chunk);
}

fwrite(STDOUT, json_encode([
    'forms' => $forms,
    'users' => $users,
    // El líder del proyecto: puede exportar respuestas (k6-exportaciones.js).
    'leader' => $owner->createToken('k6')->plainTextToken,
    'media_form' => ['id' => $mediaForm->id, 'questions' => array_map(fn ($q) => ['id' => $q->id, 'type' => $q->type], $mediaQuestions)],
    'xlsx_form' => $xlsxForm->id,
]));
