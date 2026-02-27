import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ValidateNested,
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  IsUrl,
} from 'class-validator';
import { GenerateRequestDto } from '../shared/generate.dto';

export class Text2ImageParamsDto {
  // Common parameters
  @ApiProperty({
    description: 'Text prompt for image generation',
    required: false,
  })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiProperty({
    description: 'Negative prompt to avoid certain elements',
    required: false,
  })
  @IsOptional()
  @IsString()
  negative_prompt?: string;

  @ApiProperty({
    description: 'Random seed for reproducible results',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  seed?: number;

  @ApiProperty({ description: 'Enable safety checker', required: false })
  @IsOptional()
  @IsBoolean()
  enable_safety_checker?: boolean;

  @ApiProperty({ description: 'Output format (jpeg/png)', required: false })
  @IsOptional()
  @IsString()
  output_format?: string;

  @ApiProperty({ description: 'Synchronous mode', required: false })
  @IsOptional()
  @IsBoolean()
  sync_mode?: boolean;

  // Size/Aspect Ratio parameters
  @ApiProperty({
    description: 'Image size (e.g., square_hd, landscape_4_3)',
    required: false,
  })
  @IsOptional()
  @IsString()
  image_size?: string;

  @ApiProperty({
    description: 'Aspect ratio (e.g., 16:9, 1:1)',
    required: false,
  })
  @IsOptional()
  @IsString()
  aspect_ratio?: string;

  // Inference parameters
  @ApiProperty({
    description: 'Number of inference steps (1-50)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  num_inference_steps?: number;

  @ApiProperty({ description: 'Guidance scale (0-20)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  guidance_scale?: number;

  @ApiProperty({ description: 'Safety tolerance level (1-6)', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  safety_tolerance?: number;

  // Style parameters
  @ApiProperty({
    description: 'Style name (e.g., cinematic, photographic, anime)',
    required: false,
  })
  @IsOptional()
  @IsString()
  style_name?: string;

  @ApiProperty({
    description: 'Style type (e.g., auto, realistic, anime)',
    required: false,
  })
  @IsOptional()
  @IsString()
  style?: string;

  @ApiProperty({ description: 'Expand prompt automatically', required: false })
  @IsOptional()
  @IsBoolean()
  expand_prompt?: boolean;

  // Image input parameters
  @ApiProperty({
    description: 'URL of input image for editing/inpainting',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  image_url?: string;

  @ApiProperty({
    description: 'URL of mask image for inpainting',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  mask_url?: string;

  @ApiProperty({ description: 'First reference image URL', required: false })
  @IsOptional()
  @IsUrl()
  first_image_url?: string;

  @ApiProperty({ description: 'Second reference image URL', required: false })
  @IsOptional()
  @IsUrl()
  second_image_url?: string;

  // Advanced parameters
  @ApiProperty({
    description: 'Strength of the effect (0.1-1)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  strength?: number;

  @ApiProperty({ description: 'Real CFG scale (0-5)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  real_cfg_scale?: number;

  @ApiProperty({ description: 'True CFG (1-5)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  true_cfg?: number;

  @ApiProperty({
    description: 'Reference resolution (512-1024)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ref_resolution?: number;

  @ApiProperty({
    description: 'First reference task (ip/id/style)',
    required: false,
  })
  @IsOptional()
  @IsString()
  first_reference_task?: string;

  @ApiProperty({
    description: 'Second reference task (ip/id/style)',
    required: false,
  })
  @IsOptional()
  @IsString()
  second_reference_task?: string;

  @ApiProperty({ description: 'Use thought process', required: false })
  @IsOptional()
  @IsBoolean()
  use_thought?: boolean;

  @ApiProperty({
    description: 'Scheduler type (euler/dpmpp_2m)',
    required: false,
  })
  @IsOptional()
  @IsString()
  scheduler?: string;

  // FlowEdit specific parameters
  @ApiProperty({ description: 'Source prompt for editing', required: false })
  @IsOptional()
  @IsString()
  source_prompt?: string;

  @ApiProperty({ description: 'Target prompt for editing', required: false })
  @IsOptional()
  @IsString()
  target_prompt?: string;

  @ApiProperty({ description: 'Source guidance scale (0-30)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  src_guidance_scale?: number;

  @ApiProperty({ description: 'Target guidance scale (0-30)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  tar_guidance_scale?: number;

  @ApiProperty({ description: 'N average parameter', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  n_avg?: number;

  @ApiProperty({ description: 'N max parameter', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  n_max?: number;

  // Illusion Diffusion parameters
  @ApiProperty({
    description: 'ControlNet conditioning scale (0-1)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  controlnet_conditioning_scale?: number;

  @ApiProperty({ description: 'Control guidance end (0-1)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  control_guidance_end?: number;

  // Flux General parameters
  @ApiProperty({ description: 'Max shift (0.1-5)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  max_shift?: number;

  @ApiProperty({ description: 'Base shift (0-1)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  base_shift?: number;

  @ApiProperty({ description: 'Reference end (0-1)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  reference_end?: number;

  @ApiProperty({ description: 'Reference strength (-3 to 3)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  reference_strength?: number;

  @ApiProperty({ description: 'Reference start (0-1)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  reference_start?: number;

  // Flux Pro Ultra Finetuned parameters
  @ApiProperty({
    description: 'Finetune ID for custom models',
    required: false,
  })
  @IsOptional()
  @IsString()
  finetune_id?: string;

  @ApiProperty({ description: 'Raw mode', required: false })
  @IsOptional()
  @IsBoolean()
  raw?: boolean;

  @ApiProperty({ description: 'Resolution (e.g., 1K, 2K)', required: false })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiProperty({
    description: 'Embeddings for fine-tuned models',
    required: false,
  })
  @IsOptional()
  @IsString()
  embeddings?: string;

  @ApiProperty({
    description: 'Safety checker version (v1/v2)',
    required: false,
  })
  @IsOptional()
  @IsString()
  safety_checker_version?: string;

  @ApiProperty({ description: 'Control guidance start (0-1)', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  control_guidance_start?: number;
}

export class Text2ImageDto extends GenerateRequestDto {
  @ApiProperty({
    description: 'Model-specific input parameters',
    type: Text2ImageParamsDto,
  })
  @ValidateNested()
  @Type(() => Text2ImageParamsDto)
  declare params: Text2ImageParamsDto;
}
