import { ApiProperty } from '@nestjs/swagger';

export class CouponDto {
  @ApiProperty({
    description: 'Coupon ID',
    example: 'clxx123456',
  })
  id: string;

  @ApiProperty({
    description: 'Coupon code',
    example: 'WELCOME2024',
  })
  code: string;

  @ApiProperty({
    description: 'Credit amount granted when redeemed',
    example: 100,
  })
  creditAmount: number;

  @ApiProperty({
    description: 'Whether the coupon is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Number of times this coupon has been redeemed',
    example: 45,
  })
  redemptionCount: number;

  @ApiProperty({
    description: 'When the coupon was created',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the coupon was last updated',
    example: '2024-01-15T14:20:00.000Z',
  })
  updatedAt: Date;
}

export class RedeemCouponResponseDto {
  @ApiProperty({
    description: 'Whether the redemption was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Success or error message',
    example: 'Successfully redeemed coupon! 100 credits added to your account.',
  })
  message: string;

  @ApiProperty({
    description: 'Credits added to the user account',
    example: 100,
  })
  creditsAdded: number;

  @ApiProperty({
    description: 'Total credits after redemption',
    example: 100,
  })
  totalCredits: number;

  @ApiProperty({
    description: 'Whether user can now access payment plans',
    example: true,
  })
  canAccessPayments?: boolean;
}

export class CouponRedemptionDto {
  @ApiProperty({
    description: 'Redemption ID',
    example: 'clxx123456',
  })
  id: string;

  @ApiProperty({
    description: 'User ID who redeemed the coupon',
    example: 'user123',
  })
  userId: string;

  @ApiProperty({
    description: 'Coupon ID that was redeemed',
    example: 'clyy789012',
  })
  couponId: string;

  @ApiProperty({
    description: 'Coupon code that was redeemed',
    example: 'WELCOME2024',
  })
  couponCode: string;

  @ApiProperty({
    description: 'Credits added when redeemed',
    example: 100,
  })
  creditsAdded: number;

  @ApiProperty({
    description: 'When the coupon was redeemed',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;
}
