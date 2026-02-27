import {
    IsString,
    IsOptional,
    IsEnum,
    IsNumber,
    Min,
    Max,
    IsBoolean,
    IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AIProvider {
    OPENAI = 'openai',
    GOOGLE = 'google',
    OPENROUTER = 'openrouter',
}

export enum ImageSize {
    SMALL = '256x256',
    MEDIUM = '512x512',
    LARGE = '1024x1024',
    HD = '1792x1024',
    SQUARE_HD = '1024x1792',
}

export enum ImageQuality {
    STANDARD = 'standard',
    HD = 'hd',
}

export class GenerateImageDto {
    @ApiProperty({
        description: 'Prompt for image generation',
        example: 'A futuristic meme coin logo with vibrant colors',
    })
    @IsString()
    prompt: string;

    @ApiPropertyOptional({
        description: 'AI provider to use',
        enum: AIProvider,
        default: AIProvider.OPENAI,
    })
    @IsEnum(AIProvider)
    @IsOptional()
    provider?: AIProvider = AIProvider.OPENAI;

    @ApiPropertyOptional({
        description: 'Image size',
        enum: ImageSize,
        default: ImageSize.LARGE,
    })
    @IsEnum(ImageSize)
    @IsOptional()
    size?: ImageSize = ImageSize.LARGE;

    @ApiPropertyOptional({
        description: 'Image quality',
        enum: ImageQuality,
        default: ImageQuality.STANDARD,
    })
    @IsEnum(ImageQuality)
    @IsOptional()
    quality?: ImageQuality = ImageQuality.STANDARD;

    @ApiPropertyOptional({
        description: 'Number of images to generate',
        minimum: 1,
        maximum: 4,
        default: 1,
    })
    @IsInt()
    @Min(1)
    @Max(4)
    @IsOptional()
    n?: number = 1;

    @ApiPropertyOptional({
        description:
            'Store image as public (true) or private with presigned URL (false)',
        default: true,
    })
    @IsBoolean()
    @IsOptional()
    isPublic?: boolean = true;
}

export class GenerateTextDto {
    @ApiProperty({
        description: 'Prompt for text generation',
        example: 'Write a compelling description for a meme coin',
    })
    @IsString()
    prompt: string;

    @ApiPropertyOptional({
        description: 'AI provider to use',
        enum: AIProvider,
        default: AIProvider.OPENAI,
    })
    @IsEnum(AIProvider)
    @IsOptional()
    provider?: AIProvider = AIProvider.OPENAI;

    @ApiPropertyOptional({
        description: 'Maximum tokens to generate',
        minimum: 1,
        maximum: 4000,
        default: 1000,
    })
    @IsInt()
    @Min(1)
    @Max(4000)
    @IsOptional()
    maxTokens?: number = 1000;

    @ApiPropertyOptional({
        description: 'Temperature (creativity level)',
        minimum: 0,
        maximum: 2,
        default: 0.7,
    })
    @IsNumber()
    @Min(0)
    @Max(2)
    @IsOptional()
    temperature?: number = 0.7;

    @ApiPropertyOptional({
        description: 'System message/context',
    })
    @IsString()
    @IsOptional()
    systemMessage?: string;
}

export class GenerateContentDto {
    @ApiProperty({
        description: 'Main prompt for content generation',
        example: 'Create marketing content for a new meme coin launch',
    })
    @IsString()
    prompt: string;

    @ApiPropertyOptional({
        description: 'Generate accompanying images',
        default: true,
    })
    @IsBoolean()
    @IsOptional()
    generateImages?: boolean = true;

    @ApiPropertyOptional({
        description: 'Number of images to generate',
        minimum: 0,
        maximum: 4,
        default: 1,
    })
    @IsInt()
    @Min(0)
    @Max(4)
    @IsOptional()
    imageCount?: number = 1;

    @ApiPropertyOptional({
        description: 'Specific prompt for image generation',
    })
    @IsString()
    @IsOptional()
    imagePrompt?: string;

    @ApiPropertyOptional({
        description: 'Text AI provider',
        enum: AIProvider,
        default: AIProvider.OPENAI,
    })
    @IsEnum(AIProvider)
    @IsOptional()
    textProvider?: AIProvider = AIProvider.OPENAI;

    @ApiPropertyOptional({
        description: 'Image AI provider',
        enum: AIProvider,
        default: AIProvider.OPENAI,
    })
    @IsEnum(AIProvider)
    @IsOptional()
    imageProvider?: AIProvider = AIProvider.OPENAI;

    @ApiPropertyOptional({
        description: 'Maximum tokens for text',
        minimum: 1,
        maximum: 4000,
        default: 1500,
    })
    @IsInt()
    @Min(1)
    @Max(4000)
    @IsOptional()
    maxTokens?: number = 1500;

    @ApiPropertyOptional({
        description: 'Temperature',
        minimum: 0,
        maximum: 2,
        default: 0.7,
    })
    @IsNumber()
    @Min(0)
    @Max(2)
    @IsOptional()
    temperature?: number = 0.7;

    @ApiPropertyOptional({
        description: 'Image size',
        enum: ImageSize,
        default: ImageSize.LARGE,
    })
    @IsEnum(ImageSize)
    @IsOptional()
    imageSize?: ImageSize = ImageSize.LARGE;

    @ApiPropertyOptional({
        description: 'Image quality',
        enum: ImageQuality,
        default: ImageQuality.STANDARD,
    })
    @IsEnum(ImageQuality)
    @IsOptional()
    imageQuality?: ImageQuality = ImageQuality.STANDARD;
}
