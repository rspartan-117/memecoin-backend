import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResumeProjectResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Human-readable message',
    example: 'Project resumed successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Project ID',
    example: 'proj_a1b2c3d4e5f6',
  })
  project_id: string;

  @ApiProperty({
    description: 'Active sandbox ID',
    example: 'sb_1234567890abcdef',
  })
  sandbox_id: string;

  @ApiProperty({
    description: 'Previous sandbox state before resume',
    enum: ['PAUSED', 'KILLED', 'NONE', 'RUNNING'],
    example: 'PAUSED',
  })
  previous_state: string;

  @ApiProperty({
    description: 'Current sandbox state after resume',
    enum: ['RUNNING'],
    example: 'RUNNING',
  })
  current_state: string;

  @ApiPropertyOptional({
    description: 'Frontend preview URL (port 3000)',
    example: 'https://3000-sb-1234567890abcdef.e2b.app',
  })
  frontend_url?: string;

  @ApiPropertyOptional({
    description: 'Backend API URL (port 8000)',
    example: 'https://8000-sb-1234567890abcdef.e2b.app',
  })
  backend_url?: string;

  @ApiProperty({
    description: 'Timestamp when project was resumed',
    example: '2026-01-26T10:30:00Z',
  })
  resumed_at: Date;
}
