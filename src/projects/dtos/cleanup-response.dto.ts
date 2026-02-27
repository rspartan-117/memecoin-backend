import { ApiProperty } from '@nestjs/swagger';

export class CleanupResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Message',
    example: 'Successfully deleted 3 ZIP files',
  })
  message: string;

  @ApiProperty({
    description: 'Path of deleted file (when deleting specific file)',
    example: '/home/user/game/my-project.zip',
    required: false,
  })
  deleted_path?: string;

  @ApiProperty({
    description: 'Number of files deleted (when deleting all)',
    example: 3,
    required: false,
  })
  deleted_count?: number;

  @ApiProperty({
    description: 'Total count of files found (when deleting all)',
    example: 3,
    required: false,
  })
  total_count?: number;
}
