import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { GenerateRequestDto } from '../shared/generate.dto';

export class Image2ImageParamsDto {
  // Required for most models
  @ApiProperty({ description: 'Input image URL', required: false })
  @IsOptional()
  @IsString()
  image_url: string;

  // Text generation parameters
  @ApiProperty({
    description: 'Text prompt for image generation',
    required: false,
  })
  @IsOptional()
  @IsString()
  prompt: string;

  @ApiProperty({
    description: 'Negative prompt to avoid certain features',
    required: false,
  })
  @IsOptional()
  @IsString()
  negative_prompt?: string;

  // Image dimensions and sizing
  @ApiProperty({ description: 'Image size preset', required: false })
  @IsOptional()
  @IsString()
  image_size?: string;

  @ApiProperty({
    description: 'Aspect ratio for the output image',
    enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21', '3:2', '2:3'],
    required: false,
  })
  @IsOptional()
  @IsIn(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21', '3:2', '2:3'])
  aspect_ratio?: string;

  // Generation control parameters
  @ApiProperty({
    description: 'Number of inference steps (1-50)',
    minimum: 1,
    maximum: 50,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  num_inference_steps?: number;

  @ApiProperty({
    description: 'Guidance scale for prompt adherence (0-20)',
    minimum: 0,
    maximum: 20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  guidance_scale?: number;

  @ApiProperty({
    description: 'Strength of the transformation (0-1)',
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  strength?: number;

  @ApiProperty({
    description: 'Number of images to generate (1-4)',
    minimum: 1,
    maximum: 4,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  num_images?: number;

  @ApiProperty({
    description: 'Random seed for reproducible results',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  seed?: number;

  // Safety and output parameters
  @ApiProperty({
    description: 'Enable safety content checker',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enable_safety_checker?: boolean;

  @ApiProperty({
    description: 'Output image format',
    enum: ['jpeg', 'png'],
    required: false,
  })
  @IsOptional()
  @IsIn(['jpeg', 'png'])
  output_format?: string;

  @ApiProperty({ description: 'Synchronous processing mode', required: false })
  @IsOptional()
  @IsBoolean()
  sync_mode?: boolean;

  @ApiProperty({
    description: 'Processing acceleration level',
    enum: ['none', 'regular', 'high'],
    required: false,
  })
  @IsOptional()
  @IsIn(['none', 'regular', 'high'])
  acceleration?: string;

  @ApiProperty({
    description: 'Safety tolerance level (1-6)',
    enum: ['1', '2', '3', '4', '5', '6'],
    required: false,
  })
  @IsOptional()
  @IsIn(['1', '2', '3', '4', '5', '6'])
  safety_tolerance?: string;

  // Upscaling parameters
  @ApiProperty({
    description: 'Upscale factor (1-4)',
    minimum: 1,
    maximum: 4,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  upscale_factor?: number;

  @ApiProperty({
    description: 'Creativity level for upscaling (0-1)',
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  creativity?: number;

  @ApiProperty({
    description: 'Resemblance to original (0-1)',
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  resemblance?: number;

  // PASD model parameters
  @ApiProperty({
    description: 'Scale factor (1-4)',
    minimum: 1,
    maximum: 4,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  scale?: number;

  @ApiProperty({
    description: 'Processing steps (10-50)',
    minimum: 10,
    maximum: 50,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  steps?: number;

  @ApiProperty({
    description: 'Conditioning scale (0.1-1)',
    minimum: 0.1,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  conditioning_scale?: number;

  // Reframe/positioning parameters
  @ApiProperty({ description: 'Grid position X coordinate', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  grid_position_x?: number;

  @ApiProperty({ description: 'Grid position Y coordinate', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  grid_position_y?: number;

  @ApiProperty({ description: 'X start coordinate', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  x_start?: number;

  @ApiProperty({ description: 'X end coordinate', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  x_end?: number;

  @ApiProperty({ description: 'Y start coordinate', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  y_start?: number;

  @ApiProperty({ description: 'Y end coordinate', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  y_end?: number;

  // Chain of Zoom parameters
  @ApiProperty({
    description: 'Center X for zoom (0-1)',
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  center_x?: number;

  @ApiProperty({
    description: 'Center Y for zoom (0-1)',
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  center_y?: number;

  @ApiProperty({
    description: 'User prompt for chain of zoom',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_prompt?: string;
}

export class Image2ImageDto extends GenerateRequestDto {
  @ApiProperty({
    description: 'Model-specific input parameters',
    type: Image2ImageParamsDto,
  })
  @ValidateNested()
  @Type(() => Image2ImageParamsDto)
  declare params: Image2ImageParamsDto;
}
