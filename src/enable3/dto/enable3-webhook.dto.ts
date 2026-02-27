import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for Enable3 Withdrawal Webhook
 * Sent by Enable3 when a user redeems their loyalty points
 */
export class Enable3WithdrawalDto {
  @ApiProperty({ description: 'User ID (your internal user.id/cuid)' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ description: 'Reward option ID selected by user' })
  @IsOptional()
  @IsString()
  optionId?: string;

  @ApiPropertyOptional({
    description: 'Your assigned product ID in Enable3 admin',
  })
  @IsOptional()
  @IsString()
  purchaseProductId?: string;

  @ApiProperty({ description: 'Amount in USDC equivalent' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Amount in OBOE tokens (loyalty points)' })
  @IsNumber()
  tokenAmount: number;

  @ApiProperty({ description: 'Token exchange rate' })
  @IsNumber()
  tokenRate: number;

  @ApiProperty({
    description: 'Unique transaction ID from Enable3 (for idempotency)',
  })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({
    description: 'Datetime when user requested withdrawal',
    example: '2026-01-07T10:00:00.000000',
  })
  @IsString()
  @IsNotEmpty()
  createdAt: string;
}

/**
 * Response DTO for Enable3 webhook
 */
export class Enable3WebhookResponseDto {
  @ApiProperty({
    description: 'Whether the webhook was processed successfully',
  })
  success: boolean;

  @ApiPropertyOptional({ description: 'Error message if processing failed' })
  message?: string;

  @ApiPropertyOptional({ description: 'Credits awarded to user' })
  creditsAwarded?: number;
}
