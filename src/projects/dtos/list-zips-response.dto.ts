import { ApiProperty } from '@nestjs/swagger';

class ZipFileInfo {
  @ApiProperty({
    description: 'ZIP filename',
    example: 'my-game-project.zip',
  })
  filename: string;

  @ApiProperty({
    description: 'Full path to ZIP in sandbox',
    example: '/home/user/game/my-game-project.zip',
  })
  path: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
  })
  size_bytes: number;

  @ApiProperty({
    description: 'File size in megabytes',
    example: 1.5,
  })
  size_mb: number;

  @ApiProperty({
    description: 'Modification timestamp',
    example: '2025-12-26T11:00:00Z',
  })
  modified_at: string;
}

export class ListZipsResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Project ID',
    example: 'proj_123abc',
  })
  project_id: string;

  @ApiProperty({
    description: 'Total count of ZIP files',
    example: 3,
  })
  zip_count: number;

  @ApiProperty({
    description: 'List of ZIP files',
    type: [ZipFileInfo],
  })
  zip_files: ZipFileInfo[];
}
