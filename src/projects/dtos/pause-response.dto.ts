import { ApiProperty } from '@nestjs/swagger';

export class PauseResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Message',
    example: 'Project paused successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Project ID',
    example: 'proj_123abc',
  })
  projectId: string;
}
