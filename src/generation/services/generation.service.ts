import { fal } from '@fal-ai/client';
import { PrismaService } from '../../shared/services/prisma.service';
import {
    HttpException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import {
    GenerateRequestDto,
    MediaType,
    JobStatus,
} from '../dto/fal-image-generation.dto';
import { ConfigService } from '@nestjs/config';
import { S3UrlService } from '../../shared/services/s3-url.service';
import { instanceToPlain } from 'class-transformer';
import { DynamicValidationHelper } from '../helpers/validation.helper';
import { Asset } from '@prisma/client';
import { getModelByName, type ModelConfig } from '../config/modelsRegistry';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generation record interface (exported for controller use)
 */
export interface GenerationRecord {
    id: string;
    userId: string;
    type: MediaType;
    modelName: string;
    inputPrompt: string;
    params: any;
    falRequestId?: string;
    status: JobStatus;
    resultUrl?: string;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Result interface for synchronous generation (LLM tools)
 */
export interface GenerationResult {
    success: boolean;
    assetId: string;
    imageUrl?: string;
    creditsUsed: number;
    creditsRemaining: number;
    model: string;
    error?: string;
    metadata?: {
        width?: number;
        height?: number;
        format?: string;
        seed?: number;
    };
}

@Injectable()
export class GenerationService {
    private readonly logger = new Logger(GenerationService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly s3UrlService: S3UrlService,
    ) {
        const falKey = this.configService.get('FAL_KEY');
        if (falKey) {
            fal.config({ credentials: falKey });
            this.logger.log('Fal AI client configured');
        } else {
            this.logger.warn('FAL_KEY not configured');
        }
    }

    // ==================== NEW: SYNCHRONOUS GENERATION WITH CREDIT MANAGEMENT ====================

    /**
     * MAIN METHOD FOR LLM TOOLS AND PRODUCTION
     * Synchronous generation with automatic credit management and transaction safety
     *
     * This method:
     * - Validates user has enough credits
     * - Submits to Fal AI FIRST (before deducting credits)
     * - Deducts credits only after successful submission
     * - Waits for completion (optional, for LLM tools)
     * - Automatically refunds on failure
     */
    async generateWithCredits(
        userId: string,
        modelName: string,
        params: any,
        options: {
            waitForCompletion?: boolean;
            timeoutMs?: number;
        } = {},
    ): Promise<GenerationResult> {
        const { waitForCompletion = true, timeoutMs = 120000 } = options;

        // 1. Validate model
        const modelConfig = this.validateModel(modelName);

        // 2. Validate image2image models require image_urls
        if (modelConfig.category === 'image-to-image') {
            if (!params.image_urls || !Array.isArray(params.image_urls) || params.image_urls.length === 0) {
                throw new BadRequestException(
                    `Image-to-image models require 'image_urls' array with at least one image URL. Model: ${modelName}`
                );
            }
            if (params.image_urls.length > 10) {
                throw new BadRequestException(
                    `Maximum 10 input images allowed for image-to-image generation. Provided: ${params.image_urls.length}`
                );
            }
        }

        // 3. Check credits (but DON'T deduct yet)
        await this.checkUserCredits(userId, modelConfig.credits);

        // 4. Create asset with PENDING status (credits not deducted yet)
        const asset = await this.prisma.asset.create({
            data: {
                userId,
                mediaType: MediaType.IMAGE,
                modelName: modelConfig.modelName,
                inputPrompt: params.prompt || '',
                params,
                status: JobStatus.QUEUED,
                creditsUsed: modelConfig.credits,
                source: 'AI_GENERATED',
                type: 'IMAGE',
            },
        });

        try {
            // 5. Submit to Fal FIRST (before deducting credits)
            const { request_id } = await fal.queue.submit(
                modelConfig.endpoint,
                {
                    input: this.prepareParams(params, modelConfig),
                    webhookUrl: `${this.configService.get('SELF_DOMAIN')}/generation/webhook/result`,
                },
            );

            this.logger.log(`Fal submission successful: ${request_id}`);

            // 6. NOW deduct credits (Fal submission succeeded)
            await this.prisma.$transaction(async (tx) => {
                // Get current credits and lock the row
                const user = await tx.users.findUnique({
                    where: { id: userId },
                    include: { Credits: true },
                });

                if (!user?.Credits) {
                    throw new BadRequestException('User credits not found');
                }

                // Deduct credits
                await tx.credits.update({
                    where: { userId },
                    data: {
                        availableCredits: {
                            decrement: modelConfig.credits,
                        },
                        creditUsage: {
                            increment: modelConfig.credits,
                        },
                    },
                });

                // Update asset to PROCESSING
                await tx.asset.update({
                    where: { id: asset.id },
                    data: {
                        falRequestId: request_id,
                        status: JobStatus.PROCESSING,
                    },
                });
            });

            this.logger.log(
                `Credits deducted: ${modelConfig.credits} for user ${userId}`,
            );

            // 7. Wait for completion if requested
            if (waitForCompletion) {
                return await this.completeGeneration(
                    asset.id,
                    request_id,
                    modelConfig,
                    userId,
                    timeoutMs,
                );
            }

            // Async mode - return immediately
            const user = await this.prisma.users.findUnique({
                where: { id: userId },
                include: { Credits: true },
            });

            return {
                success: true,
                assetId: asset.id,
                creditsUsed: modelConfig.credits,
                creditsRemaining: user?.Credits?.availableCredits || 0,
                model: modelName,
            };
        } catch (error: any) {
            this.logger.error('Generation failed:', error);

            // Mark asset as failed
            await this.prisma.asset.update({
                where: { id: asset.id },
                data: {
                    status: JobStatus.FAILED,
                    error: this.extractErrorMessage(error),
                },
            });

            // If credits were already deducted, refund them
            const updatedAsset = await this.prisma.asset.findUnique({
                where: { id: asset.id },
                select: { falRequestId: true },
            });

            if (updatedAsset?.falRequestId) {
                // Credits were deducted, refund them
                await this.refundCredits(
                    userId,
                    modelConfig.credits,
                    asset.id,
                    this.extractErrorMessage(error),
                );
            }

            const user = await this.prisma.users.findUnique({
                where: { id: userId },
                include: { Credits: true },
            });

            return {
                success: false,
                assetId: asset.id,
                error: this.extractErrorMessage(error),
                creditsUsed: 0,
                creditsRemaining: user?.Credits?.availableCredits || 0,
                model: modelName,
            };
        }
    }

    /**
     * Complete generation with proper locking to prevent webhook conflicts
     */
    private async completeGeneration(
        assetId: string,
        requestId: string,
        modelConfig: ModelConfig,
        userId: string,
        timeoutMs: number,
    ): Promise<GenerationResult> {
        try {
            // Wait for Fal with exponential backoff
            const result = await this.waitForGenerationWithBackoff(
                requestId,
                modelConfig.endpoint,
                timeoutMs,
            );

            // Save FAL result to file for debugging
            // this.saveFalResultToFile(result, modelConfig.modelName, requestId);

            // Log the full FAL result structure for debugging (console)
            this.logger.log('=== FAL RESULT STRUCTURE ===');
            this.logger.log(JSON.stringify(result, null, 2));
            this.logger.log('=== END FAL RESULT ===');

            // Extract image URLs or base64 data
            const imageUrls = this.extractImageUrls(result);
            if (imageUrls.length === 0) {
                throw new Error('No images in result');
            }

            const imageData = imageUrls[0];
            let s3Url: string;

            // Check if it's base64 data or a URL
            if (imageData.startsWith('data:') || (!imageData.startsWith('http://') && !imageData.startsWith('https://'))) {
                // Handle base64 data
                this.logger.log('Detected base64 image data, uploading directly');
                
                // Extract base64 content
                let base64Data = imageData;
                let contentType = 'image/png';
                
                if (imageData.startsWith('data:')) {
                    const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches) {
                        contentType = matches[1];
                        base64Data = matches[2];
                    }
                }

                // Generate S3 key
                const extension = contentType.split('/')[1] || 'png';
                const timestamp = Date.now();
                const filename = `${assetId}_${timestamp}.${extension}`;
                const s3Key = `generated/images/${userId}/${filename}`;

                // Upload from base64
                await this.s3UrlService.uploadFromBase64(
                    s3Key,
                    base64Data,
                    contentType,
                    filename,
                );

                s3Url = this.s3UrlService.getPublicUrl(s3Key);
            } else {
                // Handle URL - download and upload
                s3Url = await this.uploadWithRetry(
                    imageData,
                    userId,
                    this.getContentType(result),
                    assetId,
                );
            }

            // Update asset (with lock to prevent webhook conflict)
            const updated = await this.prisma.asset.updateMany({
                where: {
                    id: assetId,
                    status: JobStatus.PROCESSING, // Only update if still processing
                },
                data: {
                    status: JobStatus.COMPLETED,
                    resultUrl: s3Url,
                    url: s3Url,
                    error: null,
                },
            });

            if (updated.count === 0) {
                this.logger.warn(
                    `Asset ${assetId} already completed (webhook won race)`,
                );
            }

            const user = await this.prisma.users.findUnique({
                where: { id: userId },
                include: { Credits: true },
            });

            return {
                success: true,
                assetId,
                imageUrl: s3Url,
                creditsUsed: modelConfig.credits,
                creditsRemaining: user?.Credits?.availableCredits || 0,
                model: modelConfig.modelName,
                metadata: this.extractMetadata(result),
            };
        } catch (error: any) {
            this.logger.error('Generation completion failed:', error);

            // Determine if we should refund
            const shouldRefund = this.shouldRefundCredits(error);

            if (shouldRefund) {
                await this.refundCredits(
                    userId,
                    modelConfig.credits,
                    assetId,
                    this.extractErrorMessage(error),
                );
            }

            await this.prisma.asset.update({
                where: { id: assetId },
                data: {
                    status: JobStatus.FAILED,
                    error: this.extractErrorMessage(error),
                },
            });

            const user = await this.prisma.users.findUnique({
                where: { id: userId },
                include: { Credits: true },
            });

            return {
                success: false,
                assetId,
                error: this.extractErrorMessage(error),
                creditsUsed: shouldRefund ? 0 : modelConfig.credits,
                creditsRemaining: user?.Credits?.availableCredits || 0,
                model: modelConfig.modelName,
            };
        }
    }

    /**
     * Check if user has enough credits
     */
    private async checkUserCredits(userId: string, requiredCredits: number) {
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            include: { Credits: true },
        });

        if (!user) {
            throw new BadRequestException('User not found');
        }

        if (!user.Credits) {
            throw new BadRequestException(
                'User credits record not found. Please contact support to initialize your account.'
            );
        }

        if (user.Credits.availableCredits < requiredCredits) {
            throw new BadRequestException(
                `Insufficient credits. Required: ${requiredCredits}, Available: ${user.Credits.availableCredits}`,
            );
        }

        return user;
    }

    /**
     * Refund credits on failure
     */
    private async refundCredits(
        userId: string,
        amount: number,
        assetId: string,
        reason: string,
    ) {
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.credits.update({
                    where: { userId },
                    data: {
                        availableCredits: {
                            increment: amount,
                        },
                        creditUsage: {
                            decrement: amount,
                        },
                    },
                });

                // TODO: Implement credit transaction logging
                // The Transaction model is for payment transactions (wallet/chain based)
                // Need separate CreditTransaction model for credit refunds/adjustments
                /*
                await tx.Transaction.create({
                    data: {
                        userId,
                        amount: amount,
                        type: 'REFUND',
                        description: `Refund for failed generation`,
                        metadata: {
                            assetId,
                            reason,
                        },
                    },
                });
                */
            });

            this.logger.log(`Refunded ${amount} credits to user ${userId}`);
        } catch (error) {
            this.logger.error('Failed to refund credits:', error);
        }
    }

    /**
     * Wait for generation with exponential backoff (more efficient than fixed polling)
     */
    private async waitForGenerationWithBackoff(
        requestId: string,
        endpoint: string,
        timeoutMs: number,
    ): Promise<any> {
        const startTime = Date.now();
        const delays = [1000, 2000, 4000, 8000, 10000]; // Exponential backoff
        let delayIndex = 0;

        while (Date.now() - startTime < timeoutMs) {
            try {
                const status = await fal.queue.status(endpoint, { requestId });

                // Type assertion needed because Fal SDK types are incomplete
                const statusValue = status.status as string;

                if (statusValue === 'COMPLETED') {
                    return await fal.queue.result(endpoint, { requestId });
                } else if (statusValue === 'FAILED') {
                    throw new Error('Generation failed on Fal AI');
                }

                // Use exponential backoff
                const delay = delays[Math.min(delayIndex, delays.length - 1)];
                await new Promise((resolve) => setTimeout(resolve, delay));
                delayIndex++;
            } catch (error: any) {
                // Handle 404 (still queued)
                if (
                    error.status === 404 ||
                    error.message?.includes('not found')
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    continue;
                }
                throw error;
            }
        }

        throw new Error(`Timeout after ${timeoutMs}ms`);
    }

    /**
     * Prepare parameters based on model requirements
     */
    private prepareParams(params: any, modelConfig: ModelConfig): any {
        const prepared = { ...params };

        // Apply model defaults for missing parameters
        Object.keys(modelConfig.defaultValues).forEach((key) => {
            if (prepared[key] === undefined) {
                prepared[key] = modelConfig.defaultValues[key];
            }
        });

        return prepared;
    }

    /**
     * Validate model exists
     */
    private validateModel(modelName: string): ModelConfig {
        const model = getModelByName(modelName);
        if (!model) {
            throw new BadRequestException(`Invalid model: ${modelName}`);
        }
        return model;
    }

    /**
     * Extract image URLs from result (supports multiple Fal AI response formats)
     */
    private extractImageUrls(result: any): string[] {
        const urls: string[] = [];

        // Priority 1: Check for file_data (base64/data URI) - used by rembg
        if (result.data?.image?.file_data) {
            urls.push(result.data.image.file_data);
            return urls;
        }

        // Priority 2: Check for direct image field with file_data
        if (result.image?.file_data) {
            urls.push(result.image.file_data);
            return urls;
        }

        // Priority 3: Standard URL patterns
        if (result.data?.images && Array.isArray(result.data.images)) {
            urls.push(
                ...result.data.images
                    .map((img: any) => img.url || img.file_data || img.image || img)
                    .filter(Boolean),
            );
        } else if (result.data?.image) {
            // Handle URL
            urls.push(result.data.image.url || result.data.image);
        } else if (result.images && Array.isArray(result.images)) {
            urls.push(
                ...result.images.map((img: any) => img.url || img.file_data || img.image || img).filter(Boolean),
            );
        } else if (result.image) {
            urls.push(result.image.url || result.image);
        }

        return urls;
    }

    /**
     * Get content type from result
     */
    private getContentType(result: any): string {
        return (
            result.data?.images?.[0]?.content_type ||
            result.data?.image?.content_type ||
            'image/png'
        );
    }

    /**
     * Extract metadata from result
     */
    private extractMetadata(result: any): any {
        return {
            width: result.data?.images?.[0]?.width,
            height: result.data?.images?.[0]?.height,
            format: result.data?.images?.[0]?.content_type?.split('/')[1],
            seed: result.data?.seed,
        };
    }

    /**
     * S3 upload with retry for reliability
     */
    private async uploadWithRetry(
        imageUrl: string,
        userId: string,
        contentType: string,
        assetId: string,
        maxRetries: number = 3,
    ): Promise<string> {
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.downloadAndUploadToS3(
                    imageUrl,
                    userId,
                    contentType,
                    assetId,
                );
            } catch (error) {
                lastError = error;
                this.logger.warn(`S3 upload attempt ${attempt} failed:`, error);

                if (attempt < maxRetries) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, 1000 * attempt),
                    );
                }
            }
        }

        throw new Error(
            `S3 upload failed after ${maxRetries} attempts: ${lastError.message}`,
        );
    }

    /**
     * Determine if credits should be refunded based on error type
     */
    private shouldRefundCredits(error: any): boolean {
        const errorMsg = this.extractErrorMessage(error).toLowerCase();

        // Don't refund for user errors
        if (
            errorMsg.includes('invalid') ||
            errorMsg.includes('bad request') ||
            errorMsg.includes('unsupported')
        ) {
            return false;
        }

        // Don't refund for timeouts (generation may still complete via webhook)
        if (errorMsg.includes('timeout')) {
            return false;
        }

        // Refund for system errors
        return true;
    }

    /**
     * Extract error message from various error formats
     */
    private extractErrorMessage(error: any): string {
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (error.body?.detail) return error.body.detail;
        if (error.response?.data?.detail) return error.response.data.detail;
        return 'Unknown error';
    }

    // /**
    //  * Save FAL result to file for debugging
    //  */
    // private saveFalResultToFile(result: any, modelName: string, requestId: string): void {
    //     try {
    //         const logsDir = path.join(process.cwd(), 'logs', 'fal-results');
    //         
    //         // Create logs directory if it doesn't exist
    //         if (!fs.existsSync(logsDir)) {
    //             fs.mkdirSync(logsDir, { recursive: true });
    //         }

    //         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    //         const filename = `${modelName.replace(/\//g, '_')}_${requestId}_${timestamp}.json`;
    //         const filePath = path.join(logsDir, filename);

    //         const logData = {
    //             timestamp: new Date().toISOString(),
    //             modelName,
    //             requestId,
    //             result,
    //         };

    //         fs.writeFileSync(filePath, JSON.stringify(logData, null, 2));
    //         this.logger.log(`FAL result saved to: ${filePath}`);
    //     } catch (error) {
    //         this.logger.error(`Failed to save FAL result to file: ${error.message}`);
    //     }
    // }

    /**
     * Get user's credit balance and usage stats
     */
    async getUserCredits(userId: string) {
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            include: { Credits: true },
        });

        const transactions = await this.prisma.transaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        const stats = await this.prisma.asset.groupBy({
            by: ['modelName'],
            where: {
                userId,
                status: JobStatus.COMPLETED,
            },
            _count: true,
            _sum: {
                creditsUsed: true,
            },
        });

        return {
            balance: user?.Credits?.availableCredits || 0,
            usage: user?.Credits?.creditUsage || 0,
            recentTransactions: transactions,
            usageByModel: stats,
        };
    }

    // ==================== EXISTING METHODS (BACKWARD COMPATIBLE) ====================

    /**
     * Generate image using Fal AI (supports text2image and image2image)
     */
    async generate(
        dto: GenerateRequestDto,
        userId: string,
        type: MediaType = MediaType.IMAGE,
    ) {
        // Validate model and parameters using DynamicValidationHelper
        DynamicValidationHelper.validate(dto.modelName, dto.params);

        const inputPrompt =
            dto.params.prompt ||
            dto.params.text ||
            dto.params.input_text ||
            dto.params.description ||
            '';

        // Create generation record in database
        const asset = await this.prisma.asset.create({
            data: {
                userId,
                mediaType: type,
                modelName: dto.modelName,
                inputPrompt: inputPrompt,
                params: instanceToPlain(dto.params),
                status: JobStatus.QUEUED,
                source: 'AI_GENERATED',
                type: 'IMAGE',
            },
        });

        const webhookUrl = `${this.configService.get('SELF_DOMAIN')}/generation/webhook/result`;
        this.logger.log(`Webhook URL: ${webhookUrl}`);

        try {
            const { request_id, status } = await fal.queue.submit(
                dto.modelName,
                {
                    input: dto.params,
                    webhookUrl: webhookUrl,
                },
            );

            this.logger.log(`Fal request_id: ${request_id}, status: ${status}`);

            // Update with Fal request ID
            await this.prisma.asset.update({
                where: { id: asset.id },
                data: {
                    falRequestId: request_id,
                    status: JobStatus.PROCESSING,
                },
            });

            return {
                id: asset.id,
                requestId: request_id,
                status: JobStatus.PROCESSING,
            };
        } catch (error: any) {
            const isFalError = !!error.response?.data;

            if (isFalError) {
                const falStatus =
                    error.response.data.status || JobStatus.FAILED;
                const falErrorData = error.response.data;

                await this.prisma.asset.update({
                    where: { id: asset.id },
                    data: {
                        status: falStatus,
                        error: JSON.stringify(falErrorData),
                    },
                });

                return {
                    id: asset.id,
                    status: falStatus,
                    error: falErrorData,
                };
            } else {
                this.logger.error('Internal error in generate():', error);

                await this.prisma.asset.update({
                    where: { id: asset.id },
                    data: {
                        status: JobStatus.FAILED,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                });

                throw new InternalServerErrorException(
                    error instanceof Error
                        ? error.message
                        : 'Unexpected error occurred',
                );
            }
        }
    }

    async getGeneration(falRequestId: string, modelName: string) {
        try {
            const result = await fal.queue.result(modelName, {
                requestId: falRequestId,
            });
            return result;
        } catch (error) {
            this.logger.error('Error getting generation result:', error);
            throw error;
        }
    }

    /**
     * Webhook handler for Fal AI callbacks (IMAGE ONLY)
     * Updated with race condition prevention
     */
    async webhookResult(dto: any) {
        this.logger.log(
            `Webhook received for request_id: ${dto.request_id}, status: ${dto.status}`,
        );

        try {
            const asset = await this.prisma.asset.findFirst({
                where: { falRequestId: dto.request_id },
            });

            if (!asset) {
                this.logger.error(
                    `Asset not found for request_id: ${dto.request_id}`,
                );
                return { success: false };
            }

            // Check if already completed (race with sync generation)
            if (asset.status === JobStatus.COMPLETED) {
                this.logger.log(
                    `Asset ${asset.id} already completed, skipping webhook`,
                );
                return { success: true };
            }

            if (dto.status === 'COMPLETED' || dto.status === 'OK') {
                const result = await fal.queue.result(asset.modelName, {
                    requestId: asset.falRequestId || '',
                });
                this.logger.log('Result received:', result);

                // Extract image URL from result (supports multiple formats)
                const imageUrl =
                    result.data?.image?.url || result.data?.images?.[0]?.url;

                const contentType =
                    result.data?.images?.[0]?.content_type ||
                    result.data?.image?.content_type ||
                    'image/png';

                let s3Url: string | null = null;

                if (imageUrl) {
                    try {
                        // Use retry logic for webhook uploads too
                        s3Url = await this.uploadWithRetry(
                            imageUrl,
                            asset.userId,
                            contentType,
                            asset.id,
                        );
                        this.logger.log(`Image uploaded to S3: ${s3Url}`);
                    } catch (uploadError) {
                        this.logger.error(
                            'S3 upload failed after retries:',
                            uploadError,
                        );
                        // Don't use Fal URL fallback (expires in 24h)
                        // Mark as failed and refund credits instead
                        // COMMENTED OUT - Credit logic disabled
                        /*
                        await this.refundCredits(
                            asset.userId,
                            asset.creditsUsed || 0,
                            asset.id,
                            'S3 upload failed',
                        );
                        */
                        await this.prisma.asset.update({
                            where: { id: asset.id },
                            data: {
                                status: JobStatus.FAILED,
                                error: 'Failed to upload image to permanent storage',
                            },
                        });
                        return { success: false, error: 'S3 upload failed' };
                    }
                }

                // Use updateMany with status check to prevent race conditions
                const updated = await this.prisma.asset.updateMany({
                    where: {
                        id: asset.id,
                        status: JobStatus.PROCESSING, // Only update if still processing
                    },
                    data: {
                        status: JobStatus.COMPLETED,
                        resultUrl: s3Url || undefined,
                        url: s3Url || undefined,
                        error: null,
                    },
                });

                if (updated.count === 0) {
                    this.logger.log(
                        `Asset ${asset.id} already completed by sync generation`,
                    );
                } else {
                    this.logger.log(
                        `Asset ${asset.id} completed successfully via webhook`,
                    );
                }

                return { success: true };
            } else {
                // Refund credits on failure
                if (asset.creditsUsed > 0) {
                    await this.refundCredits(
                        asset.userId,
                        asset.creditsUsed,
                        asset.id,
                        dto.error || 'Generation failed',
                    );
                }

                await this.prisma.asset.update({
                    where: { id: asset.id },
                    data: {
                        status: JobStatus.FAILED,
                        error: dto.error || 'Generation failed',
                    },
                });

                this.logger.error(`Asset ${asset.id} failed: ${dto.error}`);
                return { success: false };
            }
        } catch (error) {
            this.logger.error('Error processing webhook result:', error);
            return { success: false };
        }
    }

    /**
     * Download image from URL and upload to S3
     */
    private async downloadAndUploadToS3(
        imageUrl: string,
        userId: string,
        contentType: string,
        generationId: string,
    ): Promise<string> {
        try {
            const urlParts = new URL(imageUrl);
            const extension = urlParts.pathname.split('.').pop() || 'png';

            const timestamp = Date.now();
            const filename = `${generationId}_${timestamp}.${extension}`;
            const s3Key = `generated/images/${userId}/${filename}`;

            this.logger.log(`Uploading to S3: ${s3Key}`);

            await this.s3UrlService.uploadFromUrl(
                s3Key,
                imageUrl,
                contentType,
                filename,
            );

            return this.s3UrlService.getPublicUrl(s3Key);
        } catch (error) {
            this.logger.error('Error in downloadAndUploadToS3:', error);
            throw error;
        }
    }

    /**
     * Get user's generations with pagination
     */
    async getUserGenerations(
        userId: string,
        page: number = 1,
        limit: number = 10,
    ) {
        const skip = (page - 1) * limit;

        const [assets, total] = await Promise.all([
            this.prisma.asset.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.asset.count({
                where: { userId },
            }),
        ]);

        return {
            generations: assets,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Get generation by ID
     */
    async getGenerationById(
        id: string,
        userId: string,
    ): Promise<GenerationRecord> {
        const asset = await this.prisma.asset.findFirst({
            where: {
                id,
                userId,
            },
        });

        if (!asset) {
            throw new NotFoundException('Generation not found');
        }

        return {
            id: asset.id,
            userId: asset.userId,
            type: asset.mediaType as MediaType,
            modelName: asset.modelName,
            inputPrompt: asset.inputPrompt,
            params: asset.params,
            falRequestId: asset.falRequestId || undefined,
            status: asset.status as JobStatus,
            resultUrl: asset.resultUrl || undefined,
            error: asset.error || undefined,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
        };
    }

    /**
     * Get generation status (checks Fal AI if still processing)
     */
    async getGenerationStatus(falRequestId: string, userId: string) {
        const asset = await this.prisma.asset.findFirst({
            where: {
                falRequestId,
                userId,
            },
        });

        if (!asset) {
            throw new NotFoundException('Generation not found');
        }

        try {
            if (asset.status === JobStatus.PROCESSING) {
                const response = await fal.queue.status(asset.modelName, {
                    requestId: falRequestId,
                });
                this.logger.log(`Fal AI status: ${response.status}`);

                if (response.status === 'COMPLETED') {
                    let result;
                    try {
                        result = await fal.queue.result(asset.modelName, {
                            requestId: falRequestId,
                        });
                        this.logger.log('Generation result:', result);
                    } catch (error: any) {
                        await this.handleFalOrInternalError(
                            error,
                            asset.id,
                            falRequestId,
                        );
                    }

                    const imageUrl =
                        result.data?.images?.[0]?.url ||
                        result.data?.image?.url;

                    const contentType =
                        result.data?.images?.[0]?.content_type ||
                        result.data?.image?.content_type ||
                        'image/png';

                    let s3Url: string | null = null;

                    if (imageUrl) {
                        try {
                            // Use retry logic
                            s3Url = await this.uploadWithRetry(
                                imageUrl,
                                asset.userId,
                                contentType,
                                asset.id,
                            );
                            this.logger.log('Image uploaded to S3:', s3Url);
                        } catch (uploadError) {
                            this.logger.error(
                                'S3 upload failed after retries:',
                                uploadError,
                            );
                            // Don't use Fal URL fallback - mark as failed instead
                            await this.prisma.asset.update({
                                where: { id: asset.id },
                                data: {
                                    status: JobStatus.FAILED,
                                    error: 'Failed to upload image to permanent storage',
                                },
                            });
                            throw new InternalServerErrorException(
                                'S3 upload failed',
                            );
                        }
                    }

                    await this.prisma.asset.update({
                        where: { id: asset.id },
                        data: {
                            status: JobStatus.COMPLETED,
                            resultUrl: s3Url || undefined,
                            url: s3Url || undefined,
                            error: null,
                        },
                    });

                    return {
                        status: response.status,
                        requestId: falRequestId,
                        result: result.data,
                    };
                }
            }

            return {
                status: asset.status,
                requestId: falRequestId,
            };
        } catch (error: any) {
            await this.handleFalOrInternalError(error, asset.id, falRequestId);
        }
    }

    /**
     * Unified error handler for Fal AI & Internal errors
     */
    private async handleFalOrInternalError(
        error: any,
        assetId: string,
        falRequestId: string,
    ) {
        if (error instanceof HttpException) {
            throw error;
        }

        const isFalError = !!error.body || !!error.response?.data;

        if (isFalError) {
            const falError = error.body || error.response?.data;
            const falStatusCode = error.status || error.response?.status || 500;

            await this.prisma.asset.update({
                where: { id: assetId },
                data: {
                    status: JobStatus.FAILED,
                    error: JSON.stringify(falError),
                },
            });

            throw new HttpException(
                {
                    status: JobStatus.FAILED,
                    requestId: falRequestId,
                    error: falError,
                },
                falStatusCode,
            );
        } else {
            this.logger.error('Internal server error in Fal call:', error);

            await this.prisma.asset.update({
                where: { id: assetId },
                data: {
                    status: JobStatus.FAILED,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            });

            throw new InternalServerErrorException(
                error instanceof Error
                    ? error.message
                    : 'Unexpected server error',
            );
        }
    }

    /**
     * Fetch generation results with optional status filter
     */
    async fetchGenerationResults(
        userId: string,
        page: number = 1,
        limit: number = 10,
        status?: JobStatus,
    ) {
        const skip = (page - 1) * limit;

        const where = {
            userId,
            ...(status && { status }),
        };

        const [assets, total] = await Promise.all([
            this.prisma.asset.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.asset.count({ where }),
        ]);

        return {
            generations: assets,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            status: status || 'all',
        };
    }

    /**
     * Delete generation
     */
    async deleteGeneration(id: string, userId: string) {
        const asset = await this.prisma.asset.findFirst({
            where: {
                id,
                userId,
            },
        });

        if (!asset) {
            throw new NotFoundException(
                'Generation not found or you do not have permission to delete it',
            );
        }

        await this.prisma.asset.delete({
            where: { id },
        });

        return {
            message: 'Generation deleted successfully',
            deletedId: id,
        };
    }

    /**
     * Bulk delete generations
     */
    async bulkDeleteGenerations(ids: string[], userId: string) {
        const assets = await this.prisma.asset.findMany({
            where: {
                id: { in: ids },
                userId,
            },
            select: { id: true },
        });

        const existingIds = assets.map((asset) => asset.id);
        const notFoundIds = ids.filter((id) => !existingIds.includes(id));

        if (existingIds.length === 0) {
            throw new NotFoundException(
                'No generations found or you do not have permission to delete them',
            );
        }

        await this.prisma.asset.deleteMany({
            where: {
                id: { in: existingIds },
                userId,
            },
        });

        return {
            message: `${existingIds.length} generation(s) deleted successfully`,
            deletedCount: existingIds.length,
            deletedIds: existingIds,
            notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined,
            totalRequested: ids.length,
        };
    }

    /**
     * Remove background from image using fal-ai/imageutils/rembg
     */
    async removeBackground(
        userId: string,
        params: {
            image_url: string;
            sync_mode?: boolean;
            crop_to_bbox?: boolean;
        },
        options: {
            waitForCompletion?: boolean;
            timeoutMs?: number;
        } = {},
    ): Promise<GenerationResult> {
        const modelName = 'fal-ai/imageutils/rembg';
        const modelConfig = this.validateModel(modelName);

        this.logger.log(
            `Starting background removal for user ${userId}, image: ${params.image_url.substring(0, 50)}...`,
        );

        // COMMENTED OUT FOR TESTING
        // await this.checkUserCredits(userId, modelConfig.credits);

        // 1. Create asset with QUEUED status
        const asset = await this.prisma.asset.create({
            data: {
                userId,
                mediaType: 'IMAGE' as any,
                modelName: modelConfig.modelName,
                inputPrompt: `Background removal for: ${params.image_url}`,
                params,
                status: JobStatus.QUEUED,
                creditsUsed: modelConfig.credits,
                source: 'AI_GENERATED',
                type: 'IMAGE',
            },
        });

        try {
            // 2. Submit to Fal
            const { request_id } = await fal.queue.submit(
                modelConfig.endpoint,
                {
                    input: {
                        image_url: params.image_url,
                        sync_mode: params.sync_mode ?? false,
                        crop_to_bbox: params.crop_to_bbox ?? false,
                    },
                    webhookUrl: `${this.configService.get('SELF_DOMAIN')}/generation/webhook/result`,
                },
            );

            this.logger.log(`Background removal submitted: ${request_id}`);

            // 3. Update asset with request ID
            await this.prisma.asset.update({
                where: { id: asset.id },
                data: {
                    falRequestId: request_id,
                    status: JobStatus.PROCESSING,
                },
            });

            // 4. If synchronous, wait for completion
            if (options.waitForCompletion) {
                return this.completeGeneration(
                    asset.id,
                    request_id,
                    modelConfig,
                    userId,
                    options.timeoutMs ?? 60000,
                );
            }

            // 5. Return async response
            return {
                success: true,
                assetId: asset.id,
                creditsUsed: 0, // Credits disabled
                creditsRemaining: 0, // Credits disabled
                model: modelConfig.modelName,
            };
        } catch (error: any) {
            this.logger.error('Background removal failed:', error);

            // Update asset as failed
            await this.prisma.asset.update({
                where: { id: asset.id },
                data: {
                    status: JobStatus.FAILED,
                    error: this.extractErrorMessage(error),
                },
            });

            throw new InternalServerErrorException(
                `Background removal failed: ${this.extractErrorMessage(error)}`,
            );
        }
    }
}
