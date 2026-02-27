import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class GenerateCouponsDto {
  @ApiProperty({
    description: 'Number of coupons to generate',
    example: 10,
    default: 1,
  })
  @IsNumber()
  @Min(1)
  @Max(1000)
  count: number;

  @ApiProperty({
    description: 'Amount of credits to grant when coupon is redeemed',
    example: 100,
  })
  @IsNumber()
  @Min(0)
  creditAmount: number;

  @ApiProperty({
    description: 'Description of the coupons',
    required: false,
    example: 'Welcome bonus for new users',
  })
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Maximum number of times each coupon can be redeemed',
    required: false,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;

  @ApiProperty({
    description: 'Date until which the coupons are valid (ISO 8601 format)',
    required: false,
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  validUntil?: string;
}
