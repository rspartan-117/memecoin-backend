import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DownloadRequestDto {
  @ApiPropertyOptional({
    description: 'Specific path to download (defaults to full project)',
    example: '/workspace/game',
  })
  @IsString()
  @IsOptional()
  source_path?: string;

  @ApiPropertyOptional({
    description: 'Custom name for the ZIP file',
    example: 'my-game-project.zip',
  })
  @IsString()
  @IsOptional()
  zip_name?: string;

  @ApiPropertyOptional({
    description: 'Patterns to exclude from ZIP',
    example: ['node_modules', '.git', '*.log'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  exclude_patterns?: string[];

  @ApiPropertyOptional({
    description: 'Use default exclusion patterns',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  use_defaults?: boolean;

  @ApiPropertyOptional({
    description: 'URL expiration time in seconds',
    example: 3600,
  })
  @IsNumber()
  @IsOptional()
  url_expiration?: number;
}
