import {
    IsString,
    IsOptional,
    IsObject,
    IsEnum,
    IsNumber,
    Min,
    Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Fal AI Generation Type
 */
export enum FalGenerationType {
    TEXT_TO_IMAGE = 'text2image',
    IMAGE_TO_IMAGE = 'image2image',
}

/**
 * Common image generation parameters
 */
export class ImageGenerationParams {
    @ApiProperty({ description: 'Text prompt for image generation' })
    @IsString()
    prompt: string;

    @ApiProperty({ required: false, description: 'Negative prompt' })
    @IsOptional()
    @IsString()
    negative_prompt?: string;

    @ApiProperty({ required: false, description: 'Image width' })
    @IsOptional()
    @IsNumber()
    @Min(128)
    @Max(2048)
    image_size?: number;

    @ApiProperty({ required: false, description: 'Number of inference steps' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(150)
    num_inference_steps?: number;

    @ApiProperty({ required: false, description: 'Guidance scale' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(20)
    guidance_scale?: number;

    @ApiProperty({
        required: false,
        description: 'Number of images to generate',
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(10)
    num_images?: number;

    @ApiProperty({
        required: false,
        description: 'Random seed for reproducibility',
    })
    @IsOptional()
    @IsNumber()
    seed?: number;

    @ApiProperty({ required: false, description: 'Safety checker enabled' })
    @IsOptional()
    enable_safety_checker?: boolean;
}

/**
 * Image-to-Image specific parameters
 */
export class Image2ImageParams extends ImageGenerationParams {
    @ApiProperty({
        description: 'Input image URL for image-to-image transformation',
    })
    @IsString()
    image_url: string;

    @ApiProperty({
        required: false,
        description: 'Strength of transformation (0-1)',
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    strength?: number;
}

/**
 * Main Generation Request DTO for Fal AI
 */
export class FalGenerationRequestDto {
    @ApiProperty({
        description: 'Fal AI model name',
        example: 'fal-ai/flux/schnell',
    })
    @IsString()
    modelName: string;

    @ApiProperty({
        description: 'Generation type',
        enum: FalGenerationType,
        example: FalGenerationType.TEXT_TO_IMAGE,
    })
    @IsEnum(FalGenerationType)
    type: FalGenerationType;

    @ApiProperty({
        description:
            'Generation parameters (ImageGenerationParams or Image2ImageParams)',
        oneOf: [
            { $ref: '#/components/schemas/ImageGenerationParams' },
            { $ref: '#/components/schemas/Image2ImageParams' },
        ],
    })
    @IsObject()
    params: ImageGenerationParams | Image2ImageParams;
}

/**
 * Webhook result DTO from Fal AI
 */
export class FalWebhookResultDto {
    @ApiProperty({ description: 'Fal AI request ID' })
    @IsString()
    request_id: string;

    @ApiProperty({ description: 'Status of the generation' })
    @IsString()
    status: string;

    @ApiProperty({ required: false, description: 'Generation result payload' })
    @IsOptional()
    @IsObject()
    payload?: any;

    @ApiProperty({ required: false, description: 'Error message if failed' })
    @IsOptional()
    @IsString()
    error?: string;
}
