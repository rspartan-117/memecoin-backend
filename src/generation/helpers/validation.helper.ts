import { BadRequestException } from '@nestjs/common';
import { image2imageModels } from '../config/image2imageModels';
import { text2imageModels } from '../config/text2imageModels';

export class DynamicValidationHelper {
    private static modelConfigs = {
        ...Object.fromEntries(text2imageModels.map((m) => [m.modelName, m])),
        ...Object.fromEntries(image2imageModels.map((m) => [m.modelName, m])),
    };

    static validate(modelName: string, params: Record<string, any>) {
        const config = this.modelConfigs[modelName];
        if (!config) {
            throw new BadRequestException(`Unknown model: ${modelName}`);
        }

        // ✅ Required fields check
        for (const field of config.required || []) {
            if (
                !(field in params) ||
                params[field] === undefined ||
                params[field] === ''
            ) {
                throw new BadRequestException(
                    `Missing required field: ${field}`,
                );
            }
        }

        // ✅ Range validation (min/max/step)
        for (const key of Object.keys(params)) {
            const minKey = `${key}_min`;
            const maxKey = `${key}_max`;
            const stepKey = `${key}_step`;

            if (config[minKey] !== undefined && config[maxKey] !== undefined) {
                const value = params[key];
                if (typeof value === 'number') {
                    // Min/max validation
                    if (value < config[minKey] || value > config[maxKey]) {
                        throw new BadRequestException(
                            `${key} must be between ${config[minKey]} and ${config[maxKey]}`,
                        );
                    }

                    // Step validation with floating-point precision handling
                    if (config[stepKey] !== undefined) {
                        // Use a tolerance for floating-point comparison
                        const stepsFromMin =
                            (value - config[minKey]) / config[stepKey];
                        const roundedSteps = Math.round(stepsFromMin);
                        const tolerance = 1e-10; // Small tolerance for floating-point errors

                        if (Math.abs(stepsFromMin - roundedSteps) > tolerance) {
                            throw new BadRequestException(
                                `${key} must increment by step of ${config[stepKey]}`,
                            );
                        }
                    }
                }
            }
        }

        // ✅ Enum / options validation
        for (const key of Object.keys(params)) {
            const value = params[key];
            const optionKey = `${key}_options`;

            // Skip undefined or null values (optional fields)
            if (value === undefined || value === null) continue;

            if (config[optionKey]) {
                // Convert both sides to string for safety
                const options = config[optionKey].map(String);
                if (!options.includes(String(value))) {
                    throw new BadRequestException(
                        `${key} must be one of: ${options.join(',')}`,
                    );
                }
            }
        }

        return true;
    }
}
