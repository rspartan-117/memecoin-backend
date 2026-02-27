import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';

// Request DTOs
export class PushToGithubRequestDto {
  @ApiProperty({
    description: 'Project ID',
    example: 'project456',
  })
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @ApiProperty({
    description: 'Application name',
    example: 'my-app',
  })
  @IsNotEmpty()
  @IsString()
  appName: string;

  @ApiPropertyOptional({
    description: 'Custom repository name (optional)',
    example: 'my-fullstack-app',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  repoName?: string;
}

export class CloneRepoRequestDto {
  @ApiProperty({
    description: 'GitHub repository URL',
    example: 'https://github.com/username/repository',
  })
  @IsNotEmpty()
  @IsString()
  @IsUrl()
  repoUrl: string;
}

// Response DTOs
export class GithubMessageResponseDto {
  @ApiProperty({
    description: 'Success or error message',
    example: 'Operation completed successfully',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'GitHub username',
    example: 'johndoe',
  })
  username?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://avatars.githubusercontent.com/u/123456',
  })
  avatarUrl?: string;
}

export class PushToGithubResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Code pushed successfully to GitHub',
  })
  message: string;

  @ApiProperty({
    description: 'GitHub repository URL',
    example: 'https://github.com/username/my-repo',
  })
  repoUrl: string;

  @ApiProperty({
    description: 'Repository name',
    example: 'my-repo',
  })
  repoName: string;

  @ApiProperty({
    description: 'Clone URL',
    example: 'https://github.com/username/my-repo.git',
  })
  cloneUrl: string;

  @ApiProperty({
    description: 'Full repository name (owner/repo)',
    example: 'username/my-repo',
  })
  fullName: string;
}

export class CloneRepoResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Repository cloned successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Local path where repo was cloned',
    example: '/path/to/cloned/repo',
  })
  localPath: string;

  @ApiProperty({
    description: 'Repository name',
    example: 'my-repo',
  })
  repoName: string;
}

export class GithubAuthDto {
  @ApiProperty({
    description: 'GitHub OAuth authorization URL',
    example: 'https://github.com/login/oauth/authorize?client_id=...',
  })
  authUrl: string;

  @ApiProperty({
    description: 'State parameter for OAuth security',
    example: 'abc123def456',
  })
  state: string;
}

export class GithubRepoDto {
  @ApiProperty({
    description: 'Repository ID',
    example: 123456789,
  })
  id: number;

  @ApiProperty({
    description: 'Repository name',
    example: 'my-repo',
  })
  name: string;

  @ApiProperty({
    description: 'Full repository name (owner/repo)',
    example: 'username/my-repo',
  })
  fullName: string;

  @ApiPropertyOptional({
    description: 'Repository description',
    example: 'A sample repository',
  })
  description: string | null;

  @ApiProperty({
    description: 'Repository HTML URL',
    example: 'https://github.com/username/my-repo',
  })
  htmlUrl: string;

  @ApiProperty({
    description: 'Clone URL',
    example: 'https://github.com/username/my-repo.git',
  })
  cloneUrl: string;

  @ApiProperty({
    description: 'Is private repository',
    example: false,
  })
  private: boolean;

  @ApiPropertyOptional({
    description: 'Primary programming language',
    example: 'TypeScript',
  })
  language: string | null;

  @ApiProperty({
    description: 'Number of stars',
    example: 42,
  })
  stargazersCount: number;

  @ApiProperty({
    description: 'Number of forks',
    example: 10,
  })
  forksCount: number;

  @ApiProperty({
    description: 'Created at timestamp',
    example: '2023-01-01T00:00:00Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Updated at timestamp',
    example: '2023-12-31T23:59:59Z',
  })
  updatedAt: string;
}

export class GithubRepoListDto {
  @ApiProperty({
    description: 'Number of repositories returned',
    example: 30,
  })
  count: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Items per page',
    example: 30,
  })
  perPage: number;

  @ApiProperty({
    description: 'List of repositories',
    type: [GithubRepoDto],
  })
  repositories: GithubRepoDto[];
}

export class GithubUserInfoDto {
  @ApiProperty({
    description: 'Whether GitHub is connected',
    example: true,
  })
  connected: boolean;

  @ApiPropertyOptional({
    description: 'GitHub username',
    example: 'johndoe',
  })
  username?: string;

  @ApiPropertyOptional({
    description: 'Full name',
    example: 'John Doe',
  })
  name?: string | null;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://avatars.githubusercontent.com/u/123456',
  })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'john@example.com',
  })
  email?: string | null;

  @ApiPropertyOptional({
    description: 'Number of public repositories',
    example: 25,
  })
  publicRepos?: number;

  @ApiPropertyOptional({
    description: 'Error message if fetching info failed',
    example: 'Could not fetch latest GitHub info',
  })
  error?: string;
}

export class ClonedRepositoryDto {
  @ApiProperty({
    description: 'Cloned repository ID',
    example: 'clm1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Repository URL',
    example: 'https://github.com/username/my-repo',
  })
  repoUrl: string;

  @ApiProperty({
    description: 'Repository name',
    example: 'my-repo',
  })
  repoName: string;

  @ApiProperty({
    description: 'Local path where repo is stored',
    example: '/path/to/cloned/repo',
  })
  localPath: string;

  @ApiProperty({
    description: 'When repository was cloned',
    example: '2023-12-31T23:59:59Z',
  })
  clonedAt: Date;
}

export class ClonedRepoListDto {
  @ApiProperty({
    description: 'Number of cloned repositories',
    example: 5,
  })
  count: number;

  @ApiProperty({
    description: 'List of cloned repositories',
    type: [ClonedRepositoryDto],
  })
  repositories: ClonedRepositoryDto[];
}
