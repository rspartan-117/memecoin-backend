import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
    IsNotEmpty, 
    IsString, 
    IsOptional, 
    IsBoolean, 
    IsUrl
} from 'class-validator';

/**
 * Background Removal Request DTO
 * For fal-ai/imageutils/rembg model
 */
export class BackgroundRemovalRequestDto {
    @ApiProperty({
        description: 'Publicly accessible URL or data URI of the input image',
        example: 'https://example.com/mascot.png',
    })
    @IsString()
    @IsNotEmpty()
    image_url: string;

    @ApiPropertyOptional({
        description: 'If true, returns media as data URI and won\'t be stored in history',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    sync_mode?: boolean;

    @ApiPropertyOptional({
        description: 'If true, output is cropped to tight bounding box around subject',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    crop_to_bbox?: boolean;
}

/**
 * Background Removal Result DTO
 */
export class BackgroundRemovalResultDto {
    @ApiProperty({
        description: 'Success status',
        example: true,
    })
    success: boolean;

    @ApiProperty({
        description: 'Asset ID in database',
        example: 'clx123456789abcdef',
    })
    assetId: string;

    @ApiProperty({
        description: 'URL of the image with background removed',
        example: 'https://s3.amazonaws.com/bucket/generations/user123/bg-removed-uuid.png',
    })
    imageUrl: string;

    @ApiProperty({
        description: 'Credits used for this operation',
        example: 2,
    })
    creditsUsed: number;

    @ApiProperty({
        description: 'Remaining credits after operation',
        example: 98,
    })
    creditsRemaining: number;

    @ApiProperty({
        description: 'Model used',
        example: 'fal-ai/imageutils/rembg',
    })
    model: string;

    @ApiPropertyOptional({
        description: 'Image metadata',
        example: {
            width: 1024,
            height: 768,
            format: 'png',
            cropped: false,
        },
    })
    metadata?: {
        width?: number;
        height?: number;
        format?: string;
        cropped?: boolean;
        file_size?: number;
    };
}

/**
 * Background Removal with Credits DTO
 * Combines request params with credit management options
 */
export class BackgroundRemovalWithCreditsDto extends BackgroundRemovalRequestDto {
    @ApiPropertyOptional({
        description: 'Wait for completion before returning (synchronous)',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    waitForCompletion?: boolean;

    @ApiPropertyOptional({
        description: 'Timeout in milliseconds for synchronous generation',
        default: 60000,
        example: 60000,
        minimum: 10000,
        maximum: 300000,
    })
    @IsOptional()
    timeoutMs?: number;
}
