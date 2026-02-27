import { IsBoolean, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PauseProjectRequestDto {
  @ApiPropertyOptional({
    description:
      'Save sandbox state before pausing. If false, sandbox state will be lost.',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  save_state?: boolean;

  @ApiPropertyOptional({
    description:
      'Timeout in seconds before force killing sandbox. Set to 0 for immediate termination.',
    example: 30,
    default: 30,
    minimum: 0,
    maximum: 300,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(300)
  timeout?: number;
}
