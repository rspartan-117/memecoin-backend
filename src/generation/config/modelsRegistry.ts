// config/modelsRegistry.ts
import { text2imageModels } from './text2imageModels';
import { image2imageModels } from './image2imageModels';

export const modelsRegistry = {
    text2image: text2imageModels,
    image2image: image2imageModels,
};

/**
 * Model configuration interface
 */
export interface ModelConfig {
    modelNumber: number;
    modelName: string;
    endpoint: string;
    icon: string;
    credits: number;
    type: string;
    inputs: string[];
    required: string[];
    defaultValues: Record<string, any>;
    output: Record<string, any>;
    thumbnail: string;
    description: string;
    bestFor: string[];
    category?: 'text-to-image' | 'image-to-image';
}

/**
 * Get all models (text2image + image2image)
 */
export function getAllModels(): ModelConfig[] {
    const allModels: ModelConfig[] = [];
    
    text2imageModels.forEach(model => {
        allModels.push({
            ...model,
            category: 'text-to-image',
        } as ModelConfig);
    });
    
    image2imageModels.forEach(model => {
        allModels.push({
            ...model,
            category: 'image-to-image',
        } as ModelConfig);
    });
    
    return allModels;
}

/**
 * Get model configuration by model name
 * @param modelName - The model name (e.g., 'fal-ai/flux-2/dev')
 * @returns ModelConfig or null if not found
 */
export function getModelByName(modelName: string): ModelConfig | null {
    const allModels = getAllModels();
    const model = allModels.find(m => m.modelName === modelName);
    return model || null;
}

/**
 * Get model by endpoint
 * @param endpoint - The Fal AI endpoint (e.g., 'fal-ai/flux-2')
 * @returns ModelConfig or null if not found
 */
export function getModelByEndpoint(endpoint: string): ModelConfig | null {
    const allModels = getAllModels();
    const model = allModels.find(m => m.endpoint === endpoint);
    return model || null;
}
