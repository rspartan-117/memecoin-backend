import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GenerationConfigValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

@Injectable()
export class GenerationConfigService implements OnModuleInit {
    private readonly logger = new Logger(GenerationConfigService.name);

    constructor(private readonly configService: ConfigService) {}

    onModuleInit() {
        const validation = this.validateConfiguration();

        if (validation.warnings.length > 0) {
            this.logger.warn('Generation module configuration warnings:');
            validation.warnings.forEach((warning) =>
                this.logger.warn(`  - ${warning}`),
            );
        }

        if (!validation.valid) {
            this.logger.error('Generation module configuration errors:');
            validation.errors.forEach((error) =>
                this.logger.error(`  - ${error}`),
            );
            this.logger.warn(
                'Some generation features may not work until configuration is fixed.',
            );
        } else {
            this.logger.log('Generation module configured successfully');
        }
    }

    validateConfiguration(): GenerationConfigValidation {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Critical: S3/Spaces configuration (required for image storage)
        const requiredS3Vars = [
            'DO_SPACES_ENDPOINT',
            'DO_SPACES_REGION',
            'DO_SPACES_KEY',
            'DO_SPACES_SECRET',
            'DO_SPACES_BUCKET',
        ];

        const missingS3Vars = requiredS3Vars.filter(
            (varName) => !this.configService.get(varName),
        );

        if (missingS3Vars.length > 0) {
            errors.push(
                `Missing required DigitalOcean Spaces configuration: ${missingS3Vars.join(', ')}`,
            );
        }

        // Check Fal AI key (required for generation)
        const falKey = this.configService.get<string>('FAL_KEY');

        if (!falKey) {
            errors.push(
                'FAL_KEY not set - Fal AI image generation will not work',
            );
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    isFalAIConfigured(): boolean {
        return !!this.configService.get<string>('FAL_KEY');
    }

    isS3Configured(): boolean {
        const requiredVars = [
            'DO_SPACES_ENDPOINT',
            'DO_SPACES_REGION',
            'DO_SPACES_KEY',
            'DO_SPACES_SECRET',
            'DO_SPACES_BUCKET',
        ];
        return requiredVars.every((varName) => this.configService.get(varName));
    }

    getConfiguredProviders(): string[] {
        const providers: string[] = [];
        if (this.isFalAIConfigured()) providers.push('Fal AI');
        return providers;
    }
}
