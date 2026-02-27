import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RedeemCouponDto {
  @ApiProperty({
    description: 'The coupon code to redeem',
    example: 'WELCOME2024',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
