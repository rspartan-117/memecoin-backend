import { ApiProperty } from '@nestjs/swagger';

export class SandboxUrlsResponseDto {
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
    description: 'Frontend URL',
    example: 'https://sandbox-frontend.example.com',
  })
  frontend_url: string;

  @ApiProperty({
    description: 'Backend URL',
    example: 'https://sandbox-backend.example.com',
  })
  backend_url: string;

  @ApiProperty({
    description: 'Sandbox ID',
    example: 'sandbox_789ghi',
  })
  sandbox_id: string;
}
