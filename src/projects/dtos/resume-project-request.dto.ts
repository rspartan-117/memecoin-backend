import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResumeProjectRequestDto {
  @ApiPropertyOptional({
    description:
      'Force reconnection even if sandbox is already running. Useful for recovering from connection issues.',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  force?: boolean;

  @ApiPropertyOptional({
    description:
      'Restore sandbox state from checkpoint. If false, starts fresh sandbox.',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  restore_state?: boolean;
}
