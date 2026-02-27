import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class UpdateUserNameDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'Name must be at least 1 character long' })
  @MaxLength(50, { message: 'Name must not exceed 50 characters' })
  @ApiProperty({
    description: 'New name for the user',
    example: 'Shrey',
    required: true,
    minLength: 1,
    maxLength: 50,
  })
  name: string;
}
