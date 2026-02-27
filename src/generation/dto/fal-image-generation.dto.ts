import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
    IsNotEmpty, 
    IsObject, 
    IsString, 
    IsOptional, 
    IsBoolean, 
    IsNumber, 
    IsEnum,
    IsArray,
    Min,
    Max,
    IsInt,
    ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Image size presets for Fal AI models
 */
export enum ImageSize {
    SQUARE_HD = 'square_hd',
    SQUARE = 'square',
    PORTRAIT_4_3 = 'portrait_4_3',
    PORTRAIT_16_9 = 'portrait_16_9',
    LANDSCAPE_4_3 = 'landscape_4_3',
    LANDSCAPE_16_9 = 'landscape_16_9',
}

/**
 * Output format options
 */
export enum OutputFormat {
    JPEG = 'jpeg',
    PNG = 'png',
    WEBP = 'webp',
}

/**
 * Acceleration level for generation
 */
export enum AccelerationLevel {
    NONE = 'none',
    REGULAR = 'regular',
    HIGH = 'high',
}

/**
 * Custom image size (alternative to presets)
 */
export class CustomImageSize {
    @ApiProperty({ 
        description: 'Image width in pixels', 
        minimum: 512, 
        maximum: 2048,
        example: 1280 
    })
    @IsInt()
    @Min(512)
    @Max(2048)
    width: number;

    @ApiProperty({ 
        description: 'Image height in pixels', 
        minimum: 512, 
        maximum: 2048,
        example: 720 
    })
    @IsInt()
    @Min(512)
    @Max(2048)
    height: number;
}

/**
 * Unified image generation parameters for all Fal AI models
 * Supports both text-to-image and image-to-image workflows
 * 
 * For Text-to-Image (flux-2/dev, nano-banana, nano-banana-pro, recraft-v3):
 *   - Required: prompt
 *   - Optional: image_size, num_inference_steps, guidance_scale, seed, num_images, output_format, enable_safety_checker, enable_prompt_expansion, acceleration
 * 
 * For Image-to-Image (nano-banana/edit, nano-banana-pro/edit, flux-2/edit):
 *   - Required: prompt, image_urls
 *   - Optional: aspect_ratio, strength, num_images, seed, output_format
 */
export class ImageGenerationParamsDto {
    @ApiProperty({
        description: 'Text prompt describing the image to generate or edit',
        example: 'A futuristic city with flying cars at sunset, cyberpunk style, highly detailed',
        maxLength: 1000,
    })
    @IsString()
    @IsNotEmpty()
    prompt: string;

    // TEXT-TO-IMAGE PARAMETERS

    @ApiPropertyOptional({
        description: '[Text2Image] Image size preset or custom dimensions',
        enum: ImageSize,
        example: ImageSize.LANDSCAPE_4_3,
        default: ImageSize.LANDSCAPE_4_3,
    })
    @IsOptional()
    @IsEnum(ImageSize)
    image_size?: ImageSize;

    @ApiPropertyOptional({
        description: '[Text2Image] Custom image dimensions (alternative to image_size preset)',
        type: CustomImageSize,
    })
    @IsOptional()
    @Type(() => CustomImageSize)
    custom_size?: CustomImageSize;

    @ApiPropertyOptional({
        description: '[Text2Image] Guidance scale - how closely to follow the prompt (0-20)',
        minimum: 0,
        maximum: 20,
        default: 2.5,
        example: 3.5,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(20)
    guidance_scale?: number;

    @ApiPropertyOptional({
        description: '[Text2Image] Number of inference steps (1-50). Higher = better quality but slower',
        minimum: 1,
        maximum: 50,
        default: 28,
        example: 28,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    num_inference_steps?: number;

    @ApiPropertyOptional({
        description: '[Text2Image] Acceleration level for faster generation',
        enum: AccelerationLevel,
        default: AccelerationLevel.REGULAR,
        example: AccelerationLevel.REGULAR,
    })
    @IsOptional()
    @IsEnum(AccelerationLevel)
    acceleration?: AccelerationLevel;

    @ApiPropertyOptional({
        description: '[Text2Image] Enable prompt expansion for enhanced results',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    enable_prompt_expansion?: boolean;

    @ApiPropertyOptional({
        description: '[Text2Image] Enable safety checker to filter inappropriate content',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    enable_safety_checker?: boolean;

    // IMAGE-TO-IMAGE PARAMETERS

    @ApiPropertyOptional({
        description: '[Image2Image REQUIRED] Source image URLs for editing (1-10 images). Required for /edit models.',
        type: [String],
        example: ['https://example.com/input-image.jpg'],
        minItems: 1,
        maxItems: 10,
    })
    @IsOptional()
    @IsString({ each: true })
    image_urls?: string[];

    @ApiPropertyOptional({
        description: '[Image2Image] Aspect ratio for output images',
        enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', 'auto'],
        example: '16:9',
        default: 'auto',
    })
    @IsOptional()
    @IsString()
    aspect_ratio?: string;

    @ApiPropertyOptional({
        description: '[Image2Image] Strength of transformation (0-1). Lower = closer to original',
        minimum: 0,
        maximum: 1,
        example: 0.75,
        default: 0.85,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    strength?: number;

    // COMMON PARAMETERS (works for both text2image and image2image)

    @ApiPropertyOptional({
        description: 'Random seed for reproducibility. Leave empty for random',
        example: 12345,
    })
    @IsOptional()
    @IsInt()
    seed?: number;

    @ApiPropertyOptional({
        description: 'Number of images to generate (1-10)',
        minimum: 1,
        maximum: 10,
        default: 1,
        example: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    num_images?: number;

    @ApiPropertyOptional({
        description: 'Output format for the generated image',
        enum: OutputFormat,
        default: OutputFormat.WEBP,
        example: OutputFormat.WEBP,
    })
    @IsOptional()
    @IsEnum(OutputFormat)
    output_format?: OutputFormat;
}

/**
 * Main DTO for synchronous generation with credits
 */
export class GenerateWithCreditsDto {
    @ApiProperty({
        description: 'Fal AI model to use for generation',
        example: 'fal-ai/flux-2/dev',
        enum: [
            'fal-ai/flux-2/dev',
            'fal-ai/nano-banana',
            'fal-ai/nano-banana-pro',
            'fal-ai/recraft-v3',
            'fal-ai/nano-banana/edit',
            'fal-ai/nano-banana-pro/edit',
            'fal-ai/flux-2/edit',
        ],
    })
    @IsString()
    @IsNotEmpty()
    modelName: string;

    @ApiProperty({
        description: 'Image generation parameters',
        type: ImageGenerationParamsDto,
    })
    @ValidateNested()
    @Type(() => ImageGenerationParamsDto)
    @IsNotEmpty()
    params: ImageGenerationParamsDto;

    @ApiPropertyOptional({
        description: 'Wait for generation to complete before returning (recommended for LLM/Agent tools)',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    waitForCompletion?: boolean;

    @ApiPropertyOptional({
        description: 'Maximum time to wait for completion in milliseconds',
        default: 120000,
        minimum: 30000,
        maximum: 300000,
        example: 120000,
    })
    @IsOptional()
    @IsInt()
    @Min(30000)
    @Max(300000)
    timeoutMs?: number;
}

/**
 * Main request DTO for async generation (legacy)
 */
export class GenerateRequestDto {
    @ApiProperty({
        description: 'The name of the Fal AI model to use',
        example: 'fal-ai/flux/schnell',
    })
    @IsString()
    @IsNotEmpty()
    modelName: string;

    @ApiProperty({
        description:
            'Parameters for the selected model (dynamic based on model)',
        type: Object,
        example: {
            prompt: 'A beautiful sunset over mountains',
            image_size: 'landscape_4_3',
            num_inference_steps: 4,
            num_images: 1,
        },
    })
    @IsObject()
    params: Record<string, any>;
}

/**
 * Response DTO for generation with credits
 */
export class GenerationResultDto {
    @ApiProperty({ description: 'Whether generation was successful', example: true })
    success: boolean;

    @ApiProperty({ description: 'Generated asset ID', example: 'clx123456789' })
    assetId: string;

    @ApiPropertyOptional({ description: 'Permanent S3 URL of generated image', example: 'https://s3.../image.webp' })
    imageUrl?: string;

    @ApiProperty({ description: 'Credits deducted for this generation', example: 2 })
    creditsUsed: number;

    @ApiProperty({ description: 'Remaining credit balance', example: 98 })
    creditsRemaining: number;

    @ApiProperty({ description: 'Model used for generation', example: 'fal-ai/flux-2/dev' })
    model: string;

    @ApiPropertyOptional({ description: 'Error message if generation failed' })
    error?: string;

    @ApiPropertyOptional({
        description: 'Image metadata',
        example: { width: 1024, height: 768, format: 'webp', seed: 12345 }
    })
    metadata?: {
        width?: number;
        height?: number;
        format?: string;
        seed?: number;
    };
}

/**
 * Bulk delete request DTO
 */
export class BulkDeleteDto {
    @ApiProperty({
        description: 'Array of generation IDs to delete',
        example: ['clx123', 'clx456', 'clx789'],
        type: [String],
    })
    @IsNotEmpty()
    ids: string[];
}

/**
 * Media types for generation
 */
export enum MediaType {
    IMAGE = 'IMAGE',
}

/**
 * Job status enum
 */
export enum JobStatus {
    QUEUED = 'QUEUED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

// ============================================================================
// SEPARATED TEXT-TO-IMAGE AND IMAGE-TO-IMAGE DTOs
// ============================================================================

/**
 * Text-to-Image Generation Request DTO
 * For models: flux-2/dev, nano-banana, nano-banana-pro
 * 
 * Note: Different models support different parameters:
 * - flux-2/dev: image_size, guidance_scale, num_inference_steps, acceleration, enable_prompt_expansion, enable_safety_checker
 * - nano-banana/nano-banana-pro: aspect_ratio, safety_tolerance, limit_generations
 * - nano-banana-pro only: resolution, enable_web_search
 */
export class Text2ImageParamsDto {
    @ApiProperty({
        description: 'Text prompt describing the image to generate',
        example: 'A futuristic city with flying cars at sunset, cyberpunk style, highly detailed',
        maxLength: 1000,
    })
    @IsString()
    @IsNotEmpty()
    prompt: string;

    @ApiPropertyOptional({
        description: 'Image size preset',
        enum: ImageSize,
        example: ImageSize.LANDSCAPE_16_9,
        default: ImageSize.LANDSCAPE_4_3,
    })
    @IsOptional()
    @IsEnum(ImageSize)
    image_size?: ImageSize;

    @ApiPropertyOptional({
        description: 'Custom image dimensions (alternative to image_size preset)',
        type: CustomImageSize,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => CustomImageSize)
    custom_size?: CustomImageSize;

    @ApiPropertyOptional({
        description: 'Guidance scale - how closely to follow the prompt (0-20)',
        minimum: 0,
        maximum: 20,
        default: 3.5,
        example: 3.5,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(20)
    guidance_scale?: number;

    @ApiPropertyOptional({
        description: 'Number of inference steps (1-50). Higher = better quality but slower',
        minimum: 1,
        maximum: 50,
        default: 28,
        example: 28,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    num_inference_steps?: number;

    @ApiPropertyOptional({
        description: 'Number of images to generate (1-10)',
        minimum: 1,
        maximum: 10,
        default: 1,
        example: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    num_images?: number;

    @ApiPropertyOptional({
        description: 'Random seed for reproducibility',
        example: 12345,
    })
    @IsOptional()
    @IsInt()
    seed?: number;

    @ApiPropertyOptional({
        description: 'Output format',
        enum: OutputFormat,
        default: OutputFormat.PNG,
        example: OutputFormat.PNG,
    })
    @IsOptional()
    @IsEnum(OutputFormat)
    output_format?: OutputFormat;

    @ApiPropertyOptional({
        description: 'Enable safety checker to filter inappropriate content',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    enable_safety_checker?: boolean;

    @ApiPropertyOptional({
        description: 'Enable prompt expansion for enhanced results',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    enable_prompt_expansion?: boolean;

    @ApiPropertyOptional({
        description: 'Acceleration level for faster generation (flux-2/dev only)',
        enum: AccelerationLevel,
        default: AccelerationLevel.REGULAR,
        example: AccelerationLevel.REGULAR,
    })
    @IsOptional()
    @IsEnum(AccelerationLevel)
    acceleration?: AccelerationLevel;

    @ApiPropertyOptional({
        description: 'Aspect ratio for output image (nano-banana models only - alternative to image_size)',
        enum: ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', 'auto'],
        example: '1:1',
        default: '1:1',
    })
    @IsOptional()
    @IsString()
    aspect_ratio?: string;

    @ApiPropertyOptional({
        description: 'Safety tolerance level (nano-banana models only): 1 = most strict, 6 = least strict',
        enum: ['1', '2', '3', '4', '5', '6'],
        default: '4',
        example: '4',
    })
    @IsOptional()
    @IsString()
    safety_tolerance?: string;

    @ApiPropertyOptional({
        description: 'Limit generations to 1 per prompt (nano-banana models only, experimental)',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    limit_generations?: boolean;

    @ApiPropertyOptional({
        description: 'Output resolution (nano-banana-pro only): 1K, 2K, or 4K',
        enum: ['1K', '2K', '4K'],
        default: '1K',
        example: '2K',
    })
    @IsOptional()
    @IsString()
    resolution?: string;

    @ApiPropertyOptional({
        description: 'Enable web search for current trends/info (nano-banana-pro only)',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    enable_web_search?: boolean;
}

/**
 * Text-to-Image Generation Request with Model
 */
export class Text2ImageRequestDto {
    @ApiProperty({
        description: 'Text-to-image model name',
        enum: [
            'fal-ai/flux-2/dev',
            'fal-ai/nano-banana',
            'fal-ai/nano-banana-pro',
        ],
        example: 'fal-ai/flux-2/dev',
    })
    @IsString()
    @IsNotEmpty()
    modelName: string;

    @ApiProperty({
        description: 'Text-to-image generation parameters',
        type: Text2ImageParamsDto,
    })
    @ValidateNested()
    @Type(() => Text2ImageParamsDto)
    params: Text2ImageParamsDto;
}

/**
 * Text-to-Image with Credits DTO (for sync endpoint)
 */
export class Text2ImageWithCreditsDto extends Text2ImageRequestDto {
    @ApiPropertyOptional({
        description: 'Wait for generation to complete before returning',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    waitForCompletion?: boolean;

    @ApiPropertyOptional({
        description: 'Maximum time to wait for completion in milliseconds',
        default: 120000,
        example: 120000,
        minimum: 10000,
        maximum: 300000,
    })
    @IsOptional()
    @IsInt()
    @Min(10000)
    @Max(300000)
    timeoutMs?: number;
}

/**
 * Image-to-Image Editing Request DTO
 * For models: nano-banana/edit, nano-banana-pro/edit, flux-2/edit
 * 
 * Note: Different models support different parameters:
 * - flux-2/edit: image_size, guidance_scale, num_inference_steps, acceleration, enable_prompt_expansion, enable_safety_checker
 * - nano-banana/edit: aspect_ratio, safety_tolerance, limit_generations
 * - nano-banana-pro/edit: aspect_ratio, safety_tolerance, limit_generations, resolution, enable_web_search
 */
export class Image2ImageParamsDto {
    @ApiProperty({
        description: 'Text prompt describing the desired edit or transformation',
        example: 'Transform this into a watercolor painting style, add vibrant colors',
        maxLength: 1000,
    })
    @IsString()
    @IsNotEmpty()
    prompt: string;

    @ApiProperty({
        description: 'Source image URLs for editing (1-10 images)',
        type: [String],
        example: ['https://example.com/input-image.jpg'],
        minItems: 1,
        maxItems: 10,
    })
    @IsArray()
    @IsString({ each: true })
    @IsNotEmpty()
    image_urls: string[];

    @ApiPropertyOptional({
        description: 'Aspect ratio for output images (nano-banana models only)',
        enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3', '5:4', '4:5', 'auto'],
        example: 'auto',
        default: 'auto',
    })
    @IsOptional()
    @IsString()
    aspect_ratio?: string;

    @ApiPropertyOptional({
        description: 'Image size preset (flux-2/edit only)',
        enum: ImageSize,
        example: ImageSize.LANDSCAPE_16_9,
    })
    @IsOptional()
    @IsEnum(ImageSize)
    image_size?: ImageSize;

    @ApiPropertyOptional({
        description: 'Custom image dimensions (flux-2/edit only)',
        type: CustomImageSize,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => CustomImageSize)
    custom_size?: CustomImageSize;

    @ApiPropertyOptional({
        description: 'Guidance scale (flux-2/edit only) - how closely to follow the prompt (0-20)',
        minimum: 0,
        maximum: 20,
        default: 2.5,
        example: 2.5,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(20)
    guidance_scale?: number;

    @ApiPropertyOptional({
        description: 'Number of inference steps (flux-2/edit only) (1-50). Higher = better quality but slower',
        minimum: 1,
        maximum: 50,
        default: 28,
        example: 28,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    num_inference_steps?: number;

    @ApiPropertyOptional({
        description: 'Number of images to generate (1-10)',
        minimum: 1,
        maximum: 10,
        default: 1,
        example: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    num_images?: number;

    @ApiPropertyOptional({
        description: 'Random seed for reproducibility',
        example: 12345,
    })
    @IsOptional()
    @IsInt()
    seed?: number;

    @ApiPropertyOptional({
        description: 'Output format',
        enum: OutputFormat,
        default: OutputFormat.PNG,
        example: OutputFormat.PNG,
    })
    @IsOptional()
    @IsEnum(OutputFormat)
    output_format?: OutputFormat;

    @ApiPropertyOptional({
        description: 'Enable safety checker to filter inappropriate content (flux-2/edit only)',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    enable_safety_checker?: boolean;

    @ApiPropertyOptional({
        description: 'Enable prompt expansion for enhanced results (flux-2/edit only)',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    enable_prompt_expansion?: boolean;

    @ApiPropertyOptional({
        description: 'Acceleration level for faster generation (flux-2/edit only)',
        enum: AccelerationLevel,
        default: AccelerationLevel.REGULAR,
        example: AccelerationLevel.REGULAR,
    })
    @IsOptional()
    @IsEnum(AccelerationLevel)
    acceleration?: AccelerationLevel;

    @ApiPropertyOptional({
        description: 'Safety tolerance level (nano-banana models only): 1 = most strict, 6 = least strict',
        enum: ['1', '2', '3', '4', '5', '6'],
        default: '4',
        example: '4',
    })
    @IsOptional()
    @IsString()
    safety_tolerance?: string;

    @ApiPropertyOptional({
        description: 'Limit generations to 1 per prompt (nano-banana models only, experimental)',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    limit_generations?: boolean;

    @ApiPropertyOptional({
        description: 'Output resolution (nano-banana-pro/edit only): 1K, 2K, or 4K',
        enum: ['1K', '2K', '4K'],
        default: '1K',
        example: '2K',
    })
    @IsOptional()
    @IsString()
    resolution?: string;

    @ApiPropertyOptional({
        description: 'Enable web search for current trends/info (nano-banana-pro/edit only)',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    enable_web_search?: boolean;
}

/**
 * Image-to-Image Editing Request with Model
 */
export class Image2ImageRequestDto {
    @ApiProperty({
        description: 'Image-to-image editing model name',
        enum: [
            'fal-ai/nano-banana/edit',
            'fal-ai/nano-banana-pro/edit',
            'fal-ai/flux-2/edit',
        ],
        example: 'fal-ai/nano-banana/edit',
    })
    @IsString()
    @IsNotEmpty()
    modelName: string;

    @ApiProperty({
        description: 'Image-to-image editing parameters',
        type: Image2ImageParamsDto,
    })
    @ValidateNested()
    @Type(() => Image2ImageParamsDto)
    params: Image2ImageParamsDto;
}

/**
 * Image-to-Image with Credits DTO (for sync endpoint)
 */
export class Image2ImageWithCreditsDto extends Image2ImageRequestDto {
    @ApiPropertyOptional({
        description: 'Wait for generation to complete before returning',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    waitForCompletion?: boolean;

    @ApiPropertyOptional({
        description: 'Maximum time to wait for completion in milliseconds',
        default: 120000,
        example: 120000,
        minimum: 10000,
        maximum: 300000,
    })
    @IsOptional()
    @IsInt()
    @Min(10000)
    @Max(300000)
    timeoutMs?: number;
}
