import { ApiProperty } from '@nestjs/swagger';
import { ProjectResponseDto } from './project-response.dto';

export class ProjectsListResponseDto {
  @ApiProperty({
    description: 'List of projects',
    type: [ProjectResponseDto],
  })
  projects: ProjectResponseDto[];

  @ApiProperty({
    description: 'Total count of projects',
    example: 10,
  })
  total: number;

  @ApiProperty({
    description: 'Current limit',
    example: 50,
  })
  limit: number;

  @ApiProperty({
    description: 'Current offset',
    example: 0,
  })
  offset: number;
}
