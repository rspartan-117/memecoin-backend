import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeployedAppDto {
  @ApiProperty({ description: 'Deployment ID', example: 'clxyz123abc' })
  id: string;

  @ApiProperty({ description: 'App name derived from the frontend app name' })
  name: string;

  @ApiProperty({ description: 'Deployment status', example: 'ACTIVE' })
  status: string;

  @ApiProperty({
    description: 'List of domain URLs for this deployment',
    type: [String],
    example: ['https://myapp-fr-lp-pb-1234567890.koyeb.app'],
  })
  domains: string[];

  @ApiPropertyOptional({
    description: 'Screenshot URL from S3',
    example:
      'https://bucket.nyc3.digitaloceanspaces.com/deployments/screenshots/proj_abc-123.jpg',
  })
  screenshotUrl?: string;

  @ApiProperty({ description: 'ISO date string when deployment was created' })
  createdAt: string;

  @ApiProperty({
    description: 'ISO date string when deployment was last updated',
  })
  updatedAt: string;

  @ApiPropertyOptional({
    description:
      'Project category detected from app name. Always "landingpage" in this project.',
    example: 'landingpage',
  })
  category?: string;

  @ApiPropertyOptional({
    description: 'Project name from the associated project record',
    example: 'My Awesome Landing Page',
  })
  projectName?: string;

  @ApiPropertyOptional({
    description: 'Username of the deployer',
    example: 'john_doe',
  })
  username?: string;
}

export class CommunityShowcaseResponseDto {
  @ApiProperty({
    type: [DeployedAppDto],
    description: 'List of public deployed apps',
  })
  apps: DeployedAppDto[];

  @ApiProperty({ description: 'Total number of matching apps', example: 5 })
  total: number;
}
