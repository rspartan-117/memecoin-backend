import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { E2bWebhookService } from '../services/e2b-webhook.service';

interface E2bWebhookPayload {
  version: string;
  id: string;
  type: string;
  event_data: {
    sandbox_metadata?: Record<string, any>;
  };
  sandboxBuildId: string;
  sandboxExecutionId: string;
  sandboxId: string;
  sandboxTeamId: string;
  sandboxTemplateId: string;
  timestamp: string;
}

@ApiTags('E2B Webhooks')
@Controller('webhooks/e2b')
export class E2bWebhookController {
  private readonly logger = new Logger(E2bWebhookController.name);

  constructor(private readonly e2bWebhookService: E2bWebhookService) {}

  @Post()
  @ApiOperation({ summary: 'Receive E2B sandbox lifecycle events' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWebhook(
    @Body() payload: E2bWebhookPayload,
    @Headers('e2b-signature') signature: string,
  ): Promise<{ success: boolean }> {
    const isValid = this.e2bWebhookService.verifyWebhookSignature(
      JSON.stringify(payload),
      signature,
    );

    if (!isValid) {
      this.logger.error('Invalid webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    // Handle different event types
    try {
      await this.e2bWebhookService.handleWebhookEvent(payload);
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error handling webhook: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Error processing webhook');
    }
  }
}
