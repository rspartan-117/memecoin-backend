import {
    Controller,
    Post,
    Body,
    Get,
    Param,
    Delete,
    Query,
    HttpCode,
    HttpStatus,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiQuery,
    ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';
import { GenerationService } from './services/generation.service';
import { GenerationConfigService } from './services/generation-config.service';
import { 
    GenerationResultDto,
    BulkDeleteDto,
    JobStatus,
    Text2ImageRequestDto,
    Text2ImageWithCreditsDto,
    Image2ImageRequestDto,
    Image2ImageWithCreditsDto,
} from './dto/fal-image-generation.dto';
import {
    BackgroundRemovalWithCreditsDto,
    BackgroundRemovalResultDto,
} from './dto/background-removal.dto';
import { InternalApiKeyGuard } from '../shared/guards/internal-api-key.guard';

@ApiBearerAuth()
@ApiTags('generation')
@Controller('generation')
export class GenerationController {
    constructor(
        private readonly generationService: GenerationService,
        private readonly configService: GenerationConfigService,
    ) {}

    @Post('remove-background')
    @UseGuards(InternalApiKeyGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Remove background from an image',
        description: `
        Remove the background from an image using fal-ai/imageutils/rembg model.
        
        **Features:**
        - Synchronous processing with polling (default timeout: 60s)
        - Clean background removal with transparency
        - Optional crop to bounding box of foreground object
        - 2 credits per operation
        - Permanent S3 storage
        
        **Use Cases:**
        - Product photography (remove distracting backgrounds)
        - Profile pictures (clean isolated portraits)
        - Design assets (extract objects for compositing)
        - E-commerce images (consistent white backgrounds)
        
        **Output:**
        - PNG format with alpha channel (transparency)
        - Original dimensions preserved (unless crop_to_bbox=true)
        - High-quality edge detection
        `,
    })
    @ApiBody({
        type: BackgroundRemovalWithCreditsDto,
        description: 'Background removal configuration',
        examples: {
            'Basic Background Removal': {
                value: {
                    image_url: 'https://example.com/product.jpg',
                    waitForCompletion: true,
                    timeoutMs: 60000,
                },
            },
            'With Cropping': {
                value: {
                    image_url: 'https://example.com/portrait.jpg',
                    crop_to_bbox: true,
                    waitForCompletion: true,
                },
            },
            'Synchronous Mode': {
                value: {
                    image_url: 'https://example.com/logo.png',
                    sync_mode: true,
                    crop_to_bbox: false,
                    waitForCompletion: true,
                    timeoutMs: 30000,
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Background removed successfully',
        type: BackgroundRemovalResultDto,
        schema: {
            example: {
                success: true,
                assetId: 'clx987654321zyxwvu',
                imageUrl: 'https://s3.amazonaws.com/bucket/generations/user123/nobg-uuid.png',
                creditsUsed: 2,
                creditsRemaining: 96,
                model: 'fal-ai/imageutils/rembg',
                metadata: {
                    width: 1024,
                    height: 1024,
                    format: 'png',
                    hasAlpha: true,
                },
            },
        },
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid image URL or insufficient credits',
        schema: {
            example: {
                statusCode: 400,
                message: 'Invalid image_url: Must be a valid HTTP/HTTPS URL',
                error: 'Bad Request',
            },
        },
    })
    @ApiResponse({
        status: 408,
        description: 'Processing timeout',
        schema: {
            example: {
                statusCode: 408,
                message: 'Background removal timed out after 60000ms',
                error: 'Request Timeout',
            },
        },
    })
    @ApiResponse({
        status: 500,
        description: 'Processing failed (credits refunded)',
        schema: {
            example: {
                success: false,
                error: 'Background removal failed: Processing error',
                creditsRefunded: 2,
                creditsRemaining: 98,
            },
        },
    })
    async removeBackground(
        @Body() dto: BackgroundRemovalWithCreditsDto,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.generationService.removeBackground(
            userId,
            {
                image_url: dto.image_url,
                sync_mode: dto.sync_mode,
                crop_to_bbox: dto.crop_to_bbox,
            },
            {
                waitForCompletion: dto.waitForCompletion ?? true,
                timeoutMs: dto.timeoutMs ?? 60000,
            },
        );
    }

    // ========================================================================
    // NEW SEPARATED ENDPOINTS - Text-to-Image and Image-to-Image
    // ========================================================================

    @Post('text-to-image')
    @UseGuards(InternalApiKeyGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Generate image from text prompt (Text-to-Image)',
        description: `
        Create images from text descriptions using AI models.
        
        **Supported Models:**
        - \`fal-ai/flux-2/dev\` (2 credits) - High quality, versatile, best for detailed prompts
        - \`fal-ai/nano-banana\` (10 credits) - Fast generation, supports aspect ratios and safety controls
        - \`fal-ai/nano-banana-pro\` (15 credits) - Premium quality with resolution options and web search
        
        **Features:**
        - Synchronous generation with polling
        - Automatic credit deduction with refund on failure
        - Multiple size presets or custom dimensions (flux-2/dev)
        - Aspect ratio control (nano-banana models)
        - Prompt expansion and safety checker options
        - Reproducible results with seed parameter
        
        **Use Cases:**
        - Meme coin logos and branding
        - Marketing visuals
        - Social media content
        - Concept art and illustrations
        `,
    })
    @ApiBody({
        type: Text2ImageWithCreditsDto,
        description: 'Text-to-image generation parameters',
        examples: {
            'Flux Dev - High Quality': {
                value: {
                    modelName: 'fal-ai/flux-2/dev',
                    params: {
                        prompt: 'Futuristic city skyline at sunset with neon lights, cyberpunk style, highly detailed',
                        image_size: 'landscape_16_9',
                        num_inference_steps: 30,
                        guidance_scale: 3.5,
                        enable_safety_checker: true,
                        enable_prompt_expansion: true,
                    },
                    waitForCompletion: true,
                    timeoutMs: 90000,
                },
            },
            'Nano Banana - Fast Generation': {
                value: {
                    modelName: 'fal-ai/nano-banana',
                    params: {
                        prompt: 'Cute cartoon dog riding a rocket to the moon, meme coin style, simple logo, vibrant colors',
                        aspect_ratio: '1:1',
                        safety_tolerance: '2',
                        num_images: 1,
                    },
                    waitForCompletion: true,
                    timeoutMs: 60000,
                },
            },
            'Nano Banana Pro - Premium': {
                value: {
                    modelName: 'fal-ai/nano-banana-pro',
                    params: {
                        prompt: 'Professional product photography, modern minimalist style, studio lighting',
                        aspect_ratio: '4:3',
                        resolution: '2K',
                        safety_tolerance: '4',
                        enable_web_search: false,
                    },
                    waitForCompletion: true,
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Image generated successfully',
        type: GenerationResultDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request or insufficient credits',
    })
    @ApiResponse({
        status: 408,
        description: 'Generation timeout',
    })
    @ApiResponse({
        status: 500,
        description: 'Generation failed (credits refunded)',
    })
    async text2Image(
        @Body() dto: Text2ImageWithCreditsDto,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.generationService.generateWithCredits(
            userId,
            dto.modelName,
            dto.params,
            {
                waitForCompletion: dto.waitForCompletion ?? true,
                timeoutMs: dto.timeoutMs ?? 120000,
            },
        );
    }

    @Post('image-to-image')
    @UseGuards(InternalApiKeyGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Edit existing images with AI (Image-to-Image)',
        description: `
        Transform existing images using AI-powered editing.
        
        **Supported Models:**
        - \`fal-ai/flux-2/edit\` (5 credits) - Advanced transformations with fine control
        - \`fal-ai/nano-banana/edit\` (15 credits) - Fast image editing with aspect ratio control
        - \`fal-ai/nano-banana-pro/edit\` (20 credits) - Premium quality edits with resolution options
        
        **Features:**
        - Edit with text prompts
        - Multiple aspect ratio options
        - Reproducible edits with seed
        - Support for multiple input images
        - Model-specific parameters (guidance_scale, num_inference_steps for flux-2/edit)
        
        **Use Cases:**
        - Style transfer (photo to painting, etc.)
        - Image enhancement and modifications
        - Creative transformations
        - Batch image processing
        - Product photo editing
        
        **Important:** Requires \`image_urls\` parameter with source image(s)
        `,
    })
    @ApiBody({
        type: Image2ImageWithCreditsDto,
        description: 'Image-to-image editing parameters',
        examples: {
            'Flux Edit - Advanced Control': {
                value: {
                    modelName: 'fal-ai/flux-2/edit',
                    params: {
                        prompt: 'Add dramatic sunset lighting, cinematic atmosphere, golden hour',
                        image_urls: ['https://example.com/landscape.jpg'],
                        image_size: 'landscape_16_9',
                        guidance_scale: 3.5,
                        num_inference_steps: 28,
                        enable_safety_checker: true,
                        seed: 12345,
                    },
                    waitForCompletion: true,
                    timeoutMs: 90000,
                },
            },
            'Nano Banana Edit - Fast': {
                value: {
                    modelName: 'fal-ai/nano-banana/edit',
                    params: {
                        prompt: 'Transform into a beautiful watercolor painting, soft pastel colors',
                        image_urls: ['https://example.com/photo.jpg'],
                        aspect_ratio: '16:9',
                        safety_tolerance: '2',
                        num_images: 1,
                    },
                    waitForCompletion: true,
                    timeoutMs: 60000,
                },
            },
            'Nano Banana Pro Edit - Premium': {
                value: {
                    modelName: 'fal-ai/nano-banana-pro/edit',
                    params: {
                        prompt: 'Enhance colors, improve lighting, professional quality',
                        image_urls: ['https://example.com/raw-photo.jpg'],
                        aspect_ratio: 'auto',
                        resolution: '2K',
                        safety_tolerance: '4',
                        output_format: 'webp',
                    },
                    waitForCompletion: true,
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Image edited successfully',
        type: GenerationResultDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request or insufficient credits',
    })
    @ApiResponse({
        status: 408,
        description: 'Generation timeout',
    })
    @ApiResponse({
        status: 500,
        description: 'Generation failed (credits refunded)',
    })
    async image2Image(
        @Body() dto: Image2ImageWithCreditsDto,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.generationService.generateWithCredits(
            userId,
            dto.modelName,
            dto.params,
            {
                waitForCompletion: dto.waitForCompletion ?? true,
                timeoutMs: dto.timeoutMs ?? 120000,
            },
        );
    }

    // ========================================================================
    // END NEW ENDPOINTS
    // ========================================================================

    @Get('credits')
    @ApiOperation({ summary: 'Get user credit balance and usage stats' })
    @ApiResponse({
        status: 200,
        description: 'User credits retrieved',
    })
    async getUserCredits(@Req() req: Request) {
        const userId = req.user as string;
        return this.generationService.getUserCredits(userId);
    }

    @Post('webhook/result')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Webhook endpoint for Fal AI callbacks' })
    @ApiResponse({
        status: 200,
        description: 'Webhook processed',
    })
    async handleWebhook(@Body() dto: any) {
        await this.generationService.webhookResult(dto);
        return { success: true };
    }

    @Get('status/:falRequestId')
    @ApiOperation({ summary: 'Get generation status by Fal request ID' })
    @ApiResponse({
        status: 200,
        description: 'Generation status retrieved',
    })
    async getGenerationStatus(
        @Param('falRequestId') falRequestId: string,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.generationService.getGenerationStatus(falRequestId, userId);
    }

    @Get('user/generations')
    @ApiOperation({ summary: 'Get user generations' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({
        status: 200,
        description: 'User generations retrieved',
    })
    async getUserGenerations(
        @Req() req: Request,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ) {
        const userId = req.user as string;
        return this.generationService.getUserGenerations(userId, page, limit);
    }

    @Get('results')
    @ApiOperation({ summary: 'Get user generations with optional status filter' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'status', required: false, enum: JobStatus })
    @ApiResponse({
        status: 200,
        description: 'Filtered generations retrieved',
    })
    async fetchGenerationResults(
        @Req() req: Request,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Query('status') status?: JobStatus,
    ) {
        const userId = req.user as string;
        return this.generationService.fetchGenerationResults(userId, page, limit, status);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a specific generation by ID' })
    @ApiResponse({
        status: 200,
        description: 'Generation retrieved',
    })
    async getGenerationById(
        @Param('id') id: string,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.generationService.getGenerationById(id, userId);
    }

    @Delete(':generationId')
    @ApiOperation({ summary: 'Delete a generation' })
    @ApiResponse({
        status: 200,
        description: 'Generation deleted',
    })
    async deleteGeneration(
        @Param('generationId') generationId: string,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.generationService.deleteGeneration(generationId, userId);
    }

    @Post('bulk-delete')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Delete multiple generations' })
    @ApiBody({
        type: BulkDeleteDto,
        description: 'Array of generation IDs to delete',
    })
    @ApiResponse({
        status: 200,
        description: 'Generations deleted',
    })
    async bulkDeleteGenerations(
        @Body() dto: BulkDeleteDto,
        @Req() req: Request,
    ) {
        const userId = req.user as string;
        return this.generationService.bulkDeleteGenerations(dto.ids, userId);
    }

    @Get('config/status')
    @ApiOperation({ summary: 'Get generation module configuration status' })
    @ApiResponse({
        status: 200,
        description: 'Configuration status',
    })
    async getConfigStatus() {
        const validation = this.configService.validateConfiguration();
        return {
            status: validation.valid ? 'ready' : 'incomplete',
            s3Configured: this.configService.isS3Configured(),
            availableProviders: this.configService.getConfiguredProviders(),
            errors: validation.errors,
            warnings: validation.warnings,
        };
    }
}
