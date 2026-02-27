import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectResponseDto {
  @ApiProperty({
    description: 'Project ID',
    example: 'proj_a1b2c3d4e5f6',
  })
  id: string;

  @ApiProperty({
    description: 'User ID',
    example: 'user_xyz789',
  })
  userId: string;

  @ApiProperty({
    description: 'Project name',
    example: 'Space Shooter Game',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'A 2D space shooter with power-ups and boss battles',
  })
  description?: string;

  @ApiProperty({
    description: 'Project type',
    example: 'LANDING_PAGE',
    enum: ['LANDING_PAGE'],
  })
  type: string;

  @ApiPropertyOptional({
    description: 'Active E2B sandbox ID for this project',
    example: 'sb_1234567890abcdef',
  })
  active_sandbox_id?: string;

  @ApiProperty({
    description: 'Current state of the sandbox',
    enum: ['RUNNING', 'PAUSED', 'KILLED', 'NONE'],
    example: 'RUNNING',
  })
  sandbox_state: string;

  @ApiProperty({
    description: 'Project session status',
    enum: ['ACTIVE', 'PAUSED', 'ENDED'],
    example: 'ACTIVE',
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Public URL for frontend preview (port 3000)',
    example: 'https://3000-sb-1234567890abcdef.e2b.app',
  })
  frontend_url?: string;

  @ApiPropertyOptional({
    description: 'Public URL for backend API (port 8000)',
    example: 'https://8000-sb-1234567890abcdef.e2b.app',
  })
  backend_url?: string;

  @ApiPropertyOptional({
    description:
      'Project metadata including uploaded assets, URLs, and AI context',
    example: {
      documents: [
        {
          asset_id: 'asset_abc123',
          filename: 'game_logic.py',
          s3_url: 'https://s3.amazonaws.com/...',
          file_type: 'py',
          language: 'python',
          is_code_file: true,
          summary: 'Core game logic and player mechanics',
          total_chunks: 8,
          token_count: 3500,
          rag_processed: true,
          added_at: '2026-01-25T10:30:00Z',
        },
      ],
      images: [
        {
          asset_id: 'asset_img456',
          filename: 'character_design.png',
          s3_url: 'https://s3.amazonaws.com/...',
          image_url: 'https://s3.amazonaws.com/...',
          analysis: 'Character sprite sheet with 16 animation frames',
          rag_processed: true,
          added_at: '2026-01-25T10:35:00Z',
        },
      ],
    },
  })
  metadata?: any;

  @ApiProperty({
    description: 'Timestamp when project was created',
    example: '2026-01-25T10:00:00Z',
  })
  created_at: Date;

  @ApiProperty({
    description: 'Timestamp when project was last updated',
    example: '2026-01-25T12:30:00Z',
  })
  updated_at: Date;

  @ApiProperty({
    description: 'Timestamp of last user activity on this project',
    example: '2026-01-25T12:30:00Z',
  })
  last_active: Date;

  @ApiPropertyOptional({
    description: 'GitHub repository URL for this project',
    example: 'https://github.com/user/my-project',
  })
  githubRepoUrl?: string;

  @ApiPropertyOptional({
    description: 'GitHub username of the project owner',
    example: 'johndoe',
  })
  githubUsername?: string;

  @ApiPropertyOptional({
    description: 'Deployment information for this project',
    example: {
      id: 'dep_abc123',
      status: 'ACTIVE',
      backendUrl: 'https://backend.example.com',
      frontendUrl: 'https://frontend.example.com',
      githubRepoUrl: 'https://github.com/user/repo',
      screenshotUrl: 'https://s3.amazonaws.com/screenshot.png',
      customDomain: 'example.com',
      domainStatus: 'ACTIVE',
      deployedAt: '2026-01-25T14:00:00Z',
      backendAppName: 'backend-app',
      frontendAppName: 'frontend-app',
      projectType: 'LANDING_PAGE',
      visibility: 'pr',
      createdAt: '2026-01-25T13:00:00Z',
      updatedAt: '2026-01-25T14:00:00Z',
    },
  })
  deployment?: {
    id: string;
    status: string;
    backendUrl: string;
    frontendUrl: string;
    githubRepoUrl: string;
    screenshotUrl: string;
    customDomain?: string;
    domainStatus?: string;
    deployedAt?: Date;
    backendAppName?: string;
    frontendAppName?: string;
    projectType: string;
    visibility: string;
    createdAt: Date;
    updatedAt: Date;
  };
}
