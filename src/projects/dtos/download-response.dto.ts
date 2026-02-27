import { ApiProperty } from '@nestjs/swagger';

export class DownloadResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Download URL for the ZIP file',
    example: 'https://storage.example.com/downloads/project_123.zip?token=...',
  })
  download_url: string;

  @ApiProperty({
    description: 'ZIP filename',
    example: 'my-game-project.zip',
  })
  filename: string;

  @ApiProperty({
    description: 'Path in sandbox where ZIP is stored',
    example: '/workspace/downloads/project_123.zip',
  })
  sandbox_path: string;

  @ApiProperty({
    description: 'Source path that was zipped',
    example: '/home/user/game/assets',
  })
  source_path: string;

  @ApiProperty({
    description: 'Whether the entire project was zipped',
    example: false,
  })
  is_full_project: boolean;

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
    description: 'User ID',
    example: 'user_123',
  })
  user_id: string;

  @ApiProperty({
    description: 'Project ID',
    example: 'proj_456',
  })
  project_id: string;

  @ApiProperty({
    description: 'URL expiration timestamp',
    example: '2025-12-26T12:00:00Z',
  })
  expires_at: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-12-26T11:00:00Z',
  })
  created_at: string;
}
