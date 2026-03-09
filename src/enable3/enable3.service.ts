import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/shared/services/prisma.service';
import { Enable3WithdrawalDto } from './dto/enable3-webhook.dto';
import * as crypto from 'crypto';
import { Enable3RedemptionStatus } from '@prisma/client';

@Injectable()
export class Enable3Service implements OnModuleInit {
  private readonly logger = new Logger(Enable3Service.name);

  // Conversion rate: FRG points to credits
  // Default: 10 FRG = 1 credit (0.1)
  private readonly FRG_TO_CREDITS_RATE: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.FRG_TO_CREDITS_RATE = this.configService.get<number>(
      'ENABLE3_FRG_TO_CREDITS_RATE',
      0.1,
    );
    this.logger.log(
      `Enable3 Service initialized. FRG to Credits rate: ${this.FRG_TO_CREDITS_RATE}`,
    );
  }

  async onModuleInit() {
    // Ensure PrismaService is properly connected
    if (!this.prisma) {
      throw new InternalServerErrorException('PrismaService not injected');
    }
    try {
      // Test the connection
      await this.prisma.$connect();
      this.logger.log(
        'Enable3 Service: PrismaService successfully initialized',
      );
    } catch (error) {
      this.logger.error('Failed to initialize PrismaService:', error);
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Get the Enable3 webhook secret from environment
   */
  private getWebhookSecret(): string {
    const secret = this.configService.get<string>('ENABLE3_WEBHOOK_SECRET');
    if (!secret) {
      throw new Error('ENABLE3_WEBHOOK_SECRET not configured');
    }
    return secret;
  }

  /**
   * Verify the webhook signature from Enable3
   * Enable3 uses MD5 + HMAC-SHA512 for signature
   */
  verifySignature(requestBody: string, signature: string): boolean {
    try {
      const secret = this.getWebhookSecret();

      // Calculate expected signature
      // 1. MD5 hash of request body
      const md5Hex = crypto.createHash('md5').update(requestBody).digest('hex');

      // 2. HMAC-SHA512 of the MD5 hash using secret
      const expectedSignature = crypto
        .createHmac('sha512', secret)
        .update(md5Hex)
        .digest('base64');

      // 3. Compare signatures
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (error) {
      this.logger.error('Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Process Enable3 withdrawal/redemption webhook
   * Converts FRG points to credits and adds them to user's balance
   */
  async processWithdrawal(dto: Enable3WithdrawalDto): Promise<{
    success: boolean;
    creditsAwarded: number;
    message: string;
  }> {
    this.logger.log(`Processing Enable3 withdrawal for user: ${dto.userId}`);
    this.logger.debug(`Transaction ID: ${dto.transactionId}`);
    this.logger.debug(`Token Amount: ${dto.tokenAmount} FRG`);

    try {
      // 1. Idempotency check - prevent duplicate processing
      const existingRedemption = await this.prisma.enable3Redemption.findUnique(
        {
          where: { transactionId: dto.transactionId },
        },
      );

      if (existingRedemption) {
        this.logger.log(
          `Transaction ${dto.transactionId} already processed, skipping`,
        );
        // Return success for idempotency (Enable3 may retry)
        return {
          success: true,
          creditsAwarded: existingRedemption.creditsAwarded,
          message: `Transaction already processed`,
        };
      }

      // 2. Find user by ID
      const user = await this.prisma.users.findUnique({
        where: { id: dto.userId },
        include: { Credits: true },
      });

      if (!user) {
        this.logger.error(`User not found: ${dto.userId}`);
        throw new NotFoundException(`User not found: ${dto.userId}`);
      }

      // 3. Validate tokenAmount
      if (isNaN(dto.tokenAmount) || dto.tokenAmount <= 0) {
        throw new BadRequestException(
          `Invalid tokenAmount: ${dto.tokenAmount}`,
        );
      }

      // 4. Calculate credits to award
      const creditsToAward = dto.tokenAmount * this.FRG_TO_CREDITS_RATE;

      this.logger.log(
        `Awarding ${creditsToAward} credits to user ${dto.userId} (${dto.tokenAmount} FRG * ${this.FRG_TO_CREDITS_RATE})`,
      );

      // 5. Parse Enable3 date
      let enable3Date: Date | null = null;
      try {
        enable3Date = new Date(dto.createdAt);
      } catch {
        this.logger.warn(`Could not parse Enable3 date: ${dto.createdAt}`);
      }

      // 6. Use transaction to ensure atomicity
      await this.prisma.$transaction(
        async (tx) => {
          // Create redemption record
          await tx.enable3Redemption.create({
            data: {
              userId: dto.userId,
              transactionId: dto.transactionId,
              tokenAmount: dto.tokenAmount,
              creditsAwarded: creditsToAward,
              tokenRate: dto.tokenRate,
              usdcAmount: dto.amount,
              optionId: dto.optionId,
              productId: dto.purchaseProductId,
              status: Enable3RedemptionStatus.COMPLETED,
              enable3Date: enable3Date,
            },
          });

          // Update or create user credits
          if (user.Credits) {
            // User has existing credits - increment availableCredits
            await tx.credits.update({
              where: { userId: dto.userId },
              data: {
                availableCredits: {
                  increment: creditsToAward,
                },
              },
            });
          } else {
            // User doesn't have credits record - create one
            await tx.credits.create({
              data: {
                userId: dto.userId,
                availableCredits: creditsToAward,
                creditUsage: 0,
              },
            });
          }
        },
        {
          timeout: 60000, // Set a timeout for the transaction
        },
      );

      this.logger.log(
        `Successfully processed Enable3 withdrawal. User: ${dto.userId}, Credits awarded: ${creditsToAward}`,
      );

      return {
        success: true,
        creditsAwarded: creditsToAward,
        message: `Successfully awarded ${creditsToAward} credits for ${dto.tokenAmount} FRG`,
      };
    } catch (error) {
      this.logger.error('Error processing Enable3 withdrawal:', error);
      throw error;
    }
  }

  /**
   * Get user's Enable3 redemption history
   */
  async getUserRedemptions(userId: string) {
    return this.prisma.enable3Redemption.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get total credits awarded from Enable3 for a user
   */
  async getTotalCreditsFromEnable3(userId: string): Promise<number> {
    const result = await this.prisma.enable3Redemption.aggregate({
      where: { userId, status: Enable3RedemptionStatus.COMPLETED },
      _sum: { creditsAwarded: true },
    });
    return result._sum.creditsAwarded || 0;
  }
}
