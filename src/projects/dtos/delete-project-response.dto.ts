import { ApiProperty } from '@nestjs/swagger';

export class DeleteProjectResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Human-readable message',
    example: 'Project deleted successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Deleted project ID',
    example: 'proj_a1b2c3d4e5f6',
  })
  project_id: string;

  @ApiProperty({
    description: 'Timestamp when project was deleted',
    example: '2026-01-26T10:45:00Z',
  })
  deleted_at: Date;

  @ApiProperty({
    description: 'Sandbox cleanup status',
    enum: ['completed', 'deferred', 'failed'],
    example: 'deferred',
  })
  sandbox_cleanup_status: 'completed' | 'deferred' | 'failed';

  @ApiProperty({
    description: 'Assets S3 cleanup status',
    enum: ['completed', 'failed'],
    example: 'completed',
  })
  assets_cleanup_status?: 'completed' | 'failed';
}
