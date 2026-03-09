import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeployToKoyebDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Project ID',
    example: 'project456',
    required: true,
  })
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Application name for Koyeb deployment',
    example: 'my-app',
    required: true,
  })
  appName: string;

  @IsBoolean()
  @ApiProperty({
    description: 'Whether the deployment should be public or private',
    example: true,
    default: true,
    required: true,
  })
  isPublic: boolean;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    description: 'Environment variables for backend and frontend',
    example: {
      backend: {
        MONGO_URL: 'mongodb+srv://...',
        DB_NAME: 'mydatabase',
      },
    },
    required: false,
  })
  envVariables?: {
    backend?: Record<string, string>;
    frontend?: Record<string, string>;
  };

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description:
      'Custom domain to attach to the frontend (e.g., app.mydomain.com). Required for all deployments. User must add a CNAME record pointing their domain to in.saascustomdomains.com at their DNS provider after deployment.',
    example: 'app.mydomain.com',
    required: true,
  })
  customDomain: string;
}

export class DeployToKoyebResponseDto {
  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'GitHub repository URL' })
  repoUrl: string;

  @ApiProperty({ description: 'Backend deployment URL' })
  backendUrl: string;

  @ApiProperty({ description: 'Frontend deployment URL' })
  frontendUrl: string;

  @ApiProperty({ description: 'Backend app name for reference' })
  backendAppName: string;

  @ApiProperty({ description: 'Frontend app name for reference' })
  frontendAppName: string;
}
