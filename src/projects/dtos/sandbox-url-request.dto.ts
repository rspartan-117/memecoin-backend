import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max } from 'class-validator';

export class SandboxUrlRequestDto {
  @ApiProperty({
    description: 'Project ID',
    example: 'proj_123abc',
  })
  @IsString()
  project_id: string;

  @ApiProperty({
    description: 'Port number (3000 for frontend, 8000 for backend)',
    example: 3000,
    minimum: 1,
    maximum: 65535,
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;
}
