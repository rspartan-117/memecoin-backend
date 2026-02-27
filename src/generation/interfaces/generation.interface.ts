export interface ImageGenerationResult {
    imageUrl: string;
    imageKey: string;
    prompt: string;
    provider: string;
    size: string;
    quality: string;
    timestamp: string;
    metadata?: Record<string, any>;
}

export interface TextGenerationResult {
    content: string;
    prompt: string;
    provider: string;
    tokensUsed: number;
    timestamp: string;
    metadata?: Record<string, any>;
}

export interface ContentGenerationResult {
    text: TextGenerationResult;
    images: ImageGenerationResult[];
    metadata: {
        userId: string;
        timestamp: string;
        totalImages: number;
    };
}

export interface GenerationResult {
    jobId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result: any;
    error?: string;
    createdAt: string;
    completedAt?: string;
}
