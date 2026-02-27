import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PaymentsWebhookService } from './services/payment.webhook.service';
import { AtlosWebhookGuard } from './guards/atlos-webhook.guard';

@Controller('payments/webhook/meme-coin')
export class PaymentsWebhookController {
  constructor(
    private readonly paymentsWebhookService: PaymentsWebhookService,
  ) {}

  @Post('confirm-payin-completed')
  @UseGuards(AtlosWebhookGuard)
  async confirmPayinCompleted(@Body() body: any) {
    console.log('confirmPayinCompleted', body);
    return await this.paymentsWebhookService.confirmPayinCompleted(body);
  }
}
