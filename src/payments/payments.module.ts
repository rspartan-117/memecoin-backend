import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './webhook.controller';
import { PaymentsWebhookService } from './services/payment.webhook.service';
import { PrismaService } from 'src/shared/services/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AtlosWebhookGuard } from './guards/atlos-webhook.guard';
import { X402SubscriptionController } from './controllers/x402-subscription.controller';
import { X402SubscriptionService } from './services/x402-subscription.service';
import { X402MiddlewareService } from './services/x402-middleware.service';
import { SubscriptionPaymentService } from './services/subscription-payment.service';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [
    PaymentsController,
    PaymentsWebhookController,
    X402SubscriptionController,
  ],
  providers: [
    PaymentsService,
    PaymentsWebhookService,
    X402SubscriptionService,
    X402MiddlewareService,
    SubscriptionPaymentService,
    PrismaService,
    ConfigService,
    AtlosWebhookGuard,
  ],
  exports: [
    PaymentsService,
    X402SubscriptionService,
    X402MiddlewareService,
    SubscriptionPaymentService,
  ], // Export PaymentsService so other modules can use it
})
export class PaymentsModule {}
