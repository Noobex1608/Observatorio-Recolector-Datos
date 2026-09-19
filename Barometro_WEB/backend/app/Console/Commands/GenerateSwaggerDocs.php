<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use OpenApi\Generator;
use OpenApi\Analysers\ReflectionAnalyser;
use OpenApi\Analysers\DocBlockAnnotationFactory;
use OpenApi\Analysers\AttributeAnnotationFactory;

class GenerateSwaggerDocs extends Command
{
    protected $signature = 'swagger:generate';
    protected $description = 'Generate Swagger/OpenAPI documentation';

    public function handle(): int
    {
        $this->info('Generating Swagger documentation...');

        // Suppress warnings temporarily
        $oldErrorLevel = error_reporting(E_ALL & ~E_WARNING & ~E_USER_WARNING);

        try {
            $generator = new Generator();

            // Configure to use ReflectionAnalyser with both DocBlock and Attribute factories
            $analyser = new ReflectionAnalyser([
                new DocBlockAnnotationFactory(),
                new AttributeAnnotationFactory(),
            ]);
            $generator->setAnalyser($analyser);

            $openapi = $generator->generate([
                base_path('app/Http/Controllers/Controller.php'),
                base_path('app/Presentation/Http/Controllers/Api/AuthController.php'),
                base_path('app/Presentation/Http/Controllers/Api/FormController.php'),
                base_path('app/Presentation/Http/Controllers/Api/ProfileController.php'),
                base_path('app/Presentation/Http/Controllers/Api/ProjectController.php'),
                base_path('app/Presentation/Http/Controllers/Api/SeedController.php'),
                base_path('app/Presentation/Http/Controllers/Api/UserController.php'),
            ]);

            $outputPath = storage_path('api-docs/api-docs.json');

            // Ensure directory exists
            if (!is_dir(dirname($outputPath))) {
                mkdir(dirname($outputPath), 0755, true);
            }

            file_put_contents($outputPath, $openapi->toJson());

            $this->info('Documentation generated successfully at: ' . $outputPath);

            $pathCount = 0;
            if (isset($openapi->paths) && is_array($openapi->paths)) {
                $pathCount = count($openapi->paths);
            } elseif (isset($openapi->paths) && is_object($openapi->paths)) {
                $pathCount = count((array) $openapi->paths);
            }
            $this->info('Paths found: ' . $pathCount);

            return Command::SUCCESS;
        } catch (\Exception $e) {
            $this->error('Error generating documentation: ' . $e->getMessage());
            return Command::FAILURE;
        } finally {
            // Restore error reporting
            error_reporting($oldErrorLevel);
        }
    }
}
