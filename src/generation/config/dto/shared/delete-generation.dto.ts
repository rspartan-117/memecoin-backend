import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  ArrayMinSize,
} from 'class-validator';

export class DeleteGenerationDto {
  @ApiProperty({
    description: 'The unique identifier of the generation to delete',
    example: 'clr9x1234567890abcdef',
  })
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class BulkDeleteGenerationsDto {
  @ApiProperty({
    description: 'Array of generation IDs to delete',
    example: ['clr9x1234567890abcdef', 'clr9x0987654321fedcba'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one generation ID must be provided' })
  @ArrayMinSize(1, { message: 'At least one generation ID must be provided' })
  @IsString({ each: true, message: 'Each generation ID must be a string' })
  @IsNotEmpty({ each: true, message: 'Generation IDs cannot be empty' })
  ids: string[];
}
