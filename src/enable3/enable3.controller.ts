import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Logger,
    Post,
    RawBodyRequest,
    Req,
    UnauthorizedException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
    ApiHeader,
} from '@nestjs/swagger';
import { Enable3Service } from './enable3.service';
import {
    Enable3WithdrawalDto,
    Enable3WebhookResponseDto,
} from './dto/enable3-webhook.dto';
import { Request } from 'express';

@ApiTags('Enable3 Loyalty')
@Controller('api/enable3')
export class Enable3Controller {
    private readonly logger = new Logger(Enable3Controller.name);

    constructor(private readonly enable3Service: Enable3Service) {}

    /**
     * Enable3 Withdrawal Webhook
     * Called by Enable3 when a user redeems their loyalty points for credits
     */
    @Post('webhook/withdrawal')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Enable3 Withdrawal Webhook',
        description:
            'Receives withdrawal events from Enable3 when users redeem loyalty points',
    })
    @ApiHeader({
        name: 'X-REQUEST-SIGNATURE',
        description: 'Enable3 webhook signature for verification',
        required: false,
    })
    @ApiResponse({
        status: 200,
        description: 'Withdrawal processed successfully',
        type: Enable3WebhookResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid payload structure',
    })
    @ApiResponse({
        status: 401,
        description: 'Invalid webhook signature',
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    @ApiResponse({
        status: 409,
        description: 'Transaction already processed (idempotency)',
    })
    @ApiResponse({
        status: 500,
        description: 'Internal server error',
    })
    async handleWithdrawal(
        @Body() dto: Enable3WithdrawalDto,
        @Headers('X-REQUEST-SIGNATURE') signature: string,
        @Req() req: RawBodyRequest<Request>,
    ): Promise<Enable3WebhookResponseDto> {
        this.logger.log('Received Enable3 withdrawal webhook');
        this.logger.debug('Enable3 webhook body:', dto);

        // Input validation - check required fields
        if (!dto?.userId || !dto?.transactionId) {
            this.logger.error(
                'Invalid Enable3 withdrawal payload - missing required fields',
            );
            throw new BadRequestException(
                'Invalid payload structure - missing userId or transactionId',
            );
        }

        if (typeof dto.tokenAmount !== 'number' || dto.tokenAmount <= 0) {
            this.logger.error(`Invalid tokenAmount: ${dto.tokenAmount}`);
            throw new BadRequestException(
                `Invalid tokenAmount: ${dto.tokenAmount}`,
            );
        }

        this.logger.debug(`User ID: ${dto.userId}`);
        this.logger.debug(`Transaction ID: ${dto.transactionId}`);
        this.logger.debug(`Token Amount: ${dto.tokenAmount} FRG`);

        try {
            // Get raw body for signature verification
            const rawBody = req.rawBody?.toString() || JSON.stringify(dto);

            // Verify signature (skip in development if needed)
            if (process.env.NODE_ENV === 'production' || signature) {
                if (!signature) {
                    this.logger.error('Missing X-REQUEST-SIGNATURE header');
                    throw new UnauthorizedException(
                        'Missing webhook signature',
                    );
                }

                const isValid = this.enable3Service.verifySignature(
                    rawBody,
                    signature,
                );
                if (!isValid) {
                    this.logger.error('Invalid webhook signature');
                    throw new UnauthorizedException(
                        'Invalid webhook signature',
                    );
                }

                this.logger.log('Webhook signature verified successfully');
            } else {
                this.logger.warn(
                    'Skipping signature verification in development mode',
                );
            }

            // Process the withdrawal
            const result = await this.enable3Service.processWithdrawal(dto);

            this.logger.log(
                `Successfully processed Enable3 withdrawal for transaction ${dto.transactionId}`,
            );

            return {
                success: result.success,
                message: result.message,
                creditsAwarded: result.creditsAwarded,
            };
        } catch (error) {
            // Re-throw known HTTP exceptions
            if (
                error instanceof BadRequestException ||
                error instanceof UnauthorizedException
            ) {
                throw error;
            }

            // Check for specific error types from service
            if (error.status === 404 || error.status === 409) {
                throw error;
            }

            // Log unexpected errors and return 500
            this.logger.error('Error processing Enable3 withdrawal:', error);
            throw new InternalServerErrorException(
                'Failed to process withdrawal webhook',
            );
        }
    }

    /**
     * Get user's Enable3 redemption history
     */
    @Get('redemptions')
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Get user redemption history',
        description: 'Returns all Enable3 redemptions for a user',
    })
    @ApiResponse({
        status: 200,
        description: 'Redemption history retrieved successfully',
    })
    @ApiResponse({
        status: 401,
        description: 'User not authenticated',
    })
    async getUserRedemptions(@Req() req: Request) {
        const userId = req.user as string;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        this.logger.log(`Getting redemption history for user: ${userId}`);
        const redemptions =
            await this.enable3Service.getUserRedemptions(userId);
        return {
            userId,
            redemptions,
            totalRedemptions: redemptions.length,
        };
    }

    /**
     * Get total credits awarded from Enable3
     */
    @Get('credits')
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Get total Enable3 credits',
        description:
            'Returns total credits awarded to user from Enable3 redemptions',
    })
    @ApiResponse({
        status: 200,
        description: 'Total credits retrieved successfully',
    })
    @ApiResponse({
        status: 401,
        description: 'User not authenticated',
    })
    async getTotalEnable3Credits(@Req() req: Request) {
        const userId = req.user as string;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        this.logger.log(`Getting total Enable3 credits for user: ${userId}`);
        const totalCredits =
            await this.enable3Service.getTotalCreditsFromEnable3(userId);
        return {
            userId,
            totalCreditsFromEnable3: totalCredits,
        };
    }
}
