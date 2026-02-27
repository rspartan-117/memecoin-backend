import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({
    description: 'The coupon code (if not provided, will be auto-generated)',
    required: false,
    example: 'WELCOME2024',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({
    description: 'Amount of credits to grant when coupon is redeemed',
    example: 100,
  })
  @IsNumber()
  @Min(0)
  creditAmount: number;

  @ApiProperty({
    description: 'Description of the coupon',
    required: false,
    example: 'Welcome bonus for new users',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Maximum number of times this coupon can be redeemed',
    required: false,
    default: 1,
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;

  @ApiProperty({
    description: 'Date from which the coupon is valid',
    required: false,
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiProperty({
    description: 'Date until which the coupon is valid',
    required: false,
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiProperty({
    description: 'Whether the coupon is active',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
