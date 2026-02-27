import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/shared/services/prisma.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  RedeemCouponResponseDto,
  CouponDto,
  CouponRedemptionDto,
} from './dto';
import { FreePlanStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });

    return (
      user?.walletAddress.toLowerCase() ===
      this.configService
        .getOrThrow<string>('ADMIN_WALLET_ADDRESS')
        .toLowerCase()
    );
  }

  /**
   * Admin: Create a new coupon code
   */
  async createCoupon(
    createCouponDto: CreateCouponDto,
    userId: string,
  ): Promise<CouponDto> {
    if (!(await this.isAdmin(userId))) {
      throw new UnauthorizedException(
        `User is not an admin. Please login with the admin account(${this.configService.getOrThrow<string>('ADMIN_WALLET_ADDRESS')}).`,
      );
    }
    try {
      // Check if coupon code already exists
      const existing = await this.prisma.coupon.findUnique({
        where: { code: createCouponDto.code },
      });

      if (existing) {
        throw new BadRequestException(
          `Coupon code '${createCouponDto.code}' already exists`,
        );
      }

      const coupon = await this.prisma.coupon.create({
        data: {
          code: createCouponDto.code ?? 'GENERATIVE_PROMO_CODE',
          creditAmount: createCouponDto.creditAmount,
        },
        include: {
          _count: {
            select: { redemptions: true },
          },
        },
      });

      this.logger.log(`Created coupon: ${coupon.code}`);

      return {
        id: coupon.id,
        code: coupon.code,
        creditAmount: coupon.creditAmount,
        isActive: coupon.isActive,
        redemptionCount: coupon._count.redemptions,
        createdAt: coupon.createdAt,
        updatedAt: coupon.updatedAt,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error creating coupon:', error);
      throw new BadRequestException('Failed to create coupon');
    }
  }

  /**
   * Admin: Update an existing coupon
   */
  async updateCoupon(
    id: string,
    updateCouponDto: UpdateCouponDto,
    userId: string,
  ): Promise<CouponDto> {
    if (!(await this.isAdmin(userId))) {
      throw new UnauthorizedException(
        `User is not an admin. Please login with the admin account(${this.configService.getOrThrow<string>('ADMIN_WALLET_ADDRESS')}).`,
      );
    }
    try {
      const coupon = await this.prisma.coupon.findUnique({
        where: { id },
      });

      if (!coupon) {
        throw new NotFoundException(`Coupon with ID ${id} not found`);
      }

      const updated = await this.prisma.coupon.update({
        where: { id },
        data: updateCouponDto,
        include: {
          _count: {
            select: { redemptions: true },
          },
        },
      });

      this.logger.log(`Updated coupon: ${updated.code}`);

      return {
        id: updated.id,
        code: updated.code,
        creditAmount: updated.creditAmount,
        isActive: updated.isActive,
        redemptionCount: updated._count.redemptions,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Error updating coupon:', error);
      throw new BadRequestException('Failed to update coupon');
    }
  }

  /**
   * Admin: List all coupons with redemption stats
   */
  async listCoupons(userId: string): Promise<CouponDto[]> {
    if (!(await this.isAdmin(userId))) {
      throw new UnauthorizedException(
        `User is not an admin. Please login with the admin account(${this.configService.getOrThrow<string>('ADMIN_WALLET_ADDRESS')}).`,
      );
    }
    const coupons = await this.prisma.coupon.findMany({
      include: {
        _count: {
          select: { redemptions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      creditAmount: coupon.creditAmount,
      isActive: coupon.isActive,
      redemptionCount: coupon._count.redemptions,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    }));
  }

  /**
   * Admin: Get a specific coupon by ID
   */
  async getCoupon(id: string, userId: string): Promise<CouponDto> {
    if (!(await this.isAdmin(userId))) {
      throw new UnauthorizedException(
        `User is not an admin. Please login with the admin account(${this.configService.getOrThrow<string>('ADMIN_WALLET_ADDRESS')}).`,
      );
    }
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        _count: {
          select: { redemptions: true },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID ${id} not found`);
    }

    return {
      id: coupon.id,
      code: coupon.code,
      creditAmount: coupon.creditAmount,
      isActive: coupon.isActive,
      redemptionCount: coupon._count.redemptions,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
  }

  /**
   * Admin: Delete a coupon
   */
  async deleteCoupon(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!(await this.isAdmin(userId))) {
      throw new UnauthorizedException(
        `User is not an admin. Please login with the admin account(${this.configService.getOrThrow<string>('ADMIN_WALLET_ADDRESS')}).`,
      );
    }
    try {
      const coupon = await this.prisma.coupon.findUnique({
        where: { id },
        include: {
          _count: {
            select: { redemptions: true },
          },
        },
      });

      if (!coupon) {
        throw new NotFoundException(`Coupon with ID ${id} not found`);
      }

      // Check if coupon has been redeemed
      if (coupon._count.redemptions > 0) {
        throw new BadRequestException(
          `Cannot delete coupon '${coupon.code}' as it has ${coupon._count.redemptions} redemptions`,
        );
      }

      await this.prisma.coupon.delete({
        where: { id },
      });

      this.logger.log(`Deleted coupon: ${coupon.code}`);

      return {
        success: true,
        message: `Coupon '${coupon.code}' deleted successfully`,
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Error deleting coupon:', error);
      throw new BadRequestException('Failed to delete coupon');
    }
  }

  /**
   * Admin: Get redemptions for a specific coupon
   */
  async getCouponRedemptions(
    couponId: string,
    userId: string,
  ): Promise<CouponRedemptionDto[]> {
    if (!(await this.isAdmin(userId))) {
      throw new UnauthorizedException(
        `User is not an admin. Please login with the admin account(${this.configService.getOrThrow<string>('ADMIN_WALLET_ADDRESS')}).`,
      );
    }
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID ${couponId} not found`);
    }

    const redemptions = await this.prisma.couponRedemption.findMany({
      where: { couponId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            walletAddress: true,
          },
        },
        coupon: {
          select: {
            code: true,
            creditAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return redemptions.map((redemption) => ({
      id: redemption.id,
      userId: redemption.userId,
      couponId: redemption.couponId,
      couponCode: redemption.coupon.code,
      creditsAdded: redemption.coupon.creditAmount,
      createdAt: redemption.createdAt,
    }));
  }

  /**
   * User: Redeem a coupon code
   */
  async redeemCoupon(
    userId: string,
    code: string,
  ): Promise<RedeemCouponResponseDto> {
    try {
      // Find the coupon
      const coupon = await this.prisma.coupon.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (!coupon) {
        throw new BadRequestException('Invalid coupon code');
      }

      if (!coupon.isActive) {
        throw new BadRequestException('This coupon code is no longer active');
      }

      // Check if user has already redeemed this coupon
      const existingRedemption = await this.prisma.couponRedemption.findUnique({
        where: {
          userId_couponId: {
            userId,
            couponId: coupon.id,
          },
        },
      });

      if (existingRedemption) {
        throw new BadRequestException(
          'You have already redeemed this coupon code',
        );
      }

      // Get or create user's Credits record
      let userCredits = await this.prisma.credits.findUnique({
        where: { userId },
      });

      if (!userCredits) {
        // Create new Credits record for user
        userCredits = await this.prisma.credits.create({
          data: {
            userId,
            availableCredits: 0,
            creditUsage: 0,
            status: FreePlanStatus.ACTIVE,
          },
        });
      }

      // Use transaction to ensure atomicity
      const result = await this.prisma.$transaction(async (tx) => {
        // Create redemption record
        await tx.couponRedemption.create({
          data: {
            userId,
            couponId: coupon.id,
          },
        });

        // Add credits to user
        const updatedCredits = await tx.credits.update({
          where: { userId },
          data: {
            availableCredits: { increment: coupon.creditAmount },
            status: FreePlanStatus.ACTIVE,
          },
        });

        // Enable payment access for user
        await tx.users.update({
          where: { id: userId },
          data: {
            canAccessPayments: true,
          },
        });

        return updatedCredits;
      });

      this.logger.log(
        `User ${userId} redeemed coupon '${code}' for ${coupon.creditAmount} credits`,
      );

      return {
        success: true,
        message: `Successfully redeemed coupon! ${coupon.creditAmount} credits added to your account.`,
        creditsAdded: coupon.creditAmount,
        totalCredits: result.availableCredits,
        canAccessPayments: true,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error redeeming coupon:', error);
      throw new BadRequestException('Failed to redeem coupon');
    }
  }

  /**
   * User: Get redemption history for a user
   */
  async getUserRedemptions(userId: string): Promise<CouponRedemptionDto[]> {
    const redemptions = await this.prisma.couponRedemption.findMany({
      where: { userId },
      include: {
        coupon: {
          select: {
            code: true,
            creditAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return redemptions.map((redemption) => ({
      id: redemption.id,
      userId: redemption.userId,
      couponId: redemption.couponId,
      couponCode: redemption.coupon.code,
      creditsAdded: redemption.coupon.creditAmount,
      createdAt: redemption.createdAt,
    }));
  }

  /**
   * User: Check if user can access payment plans
   */
  async canAccessPayments(
    userId: string,
  ): Promise<{ canAccessPayments: boolean }> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { canAccessPayments: true },
    });

    return { canAccessPayments: user?.canAccessPayments ?? false };
  }
}
