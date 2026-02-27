import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsUrl,
  IsEmail,
} from 'class-validator';

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

export class UpdateUserDetailsDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Username must be at least 1 character long' })
  @MaxLength(50, { message: 'Username must not exceed 50 characters' })
  @ApiProperty({
    description: 'Username for the user',
    example: 'john_doe',
    required: false,
    minLength: 1,
    maxLength: 50,
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'First name must be at least 1 character long' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  @ApiProperty({
    description: 'First name of the user',
    example: 'John',
    required: false,
    minLength: 1,
    maxLength: 50,
  })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Last name must be at least 1 character long' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  @ApiProperty({
    description: 'Last name of the user',
    example: 'Doe',
    required: false,
    minLength: 1,
    maxLength: 50,
  })
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  @ApiProperty({
    description: 'User description/bio',
    example: 'Digital artist and AI enthusiast',
    required: false,
    maxLength: 500,
  })
  description?: string;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Profile image must be a valid URL' })
  @ApiProperty({
    description: 'URL for the user profile image',
    example: 'https://example.com/profile.jpg',
    required: false,
  })
  profileImage?: string;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Cover image must be a valid URL' })
  @ApiProperty({
    description: 'URL for the user cover image',
    example: 'https://example.com/cover.jpg',
    required: false,
  })
  coverImage?: string;

  @IsOptional()
  @IsString()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @ApiProperty({
    description: 'Email address of the user',
    example: 'user@example.com',
    required: false,
  })
  email?: string;
}
