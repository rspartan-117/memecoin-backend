import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './webhook.controller';
import { PaymentsWebhookService } from './services/payment.webhook.service';
import { PrismaService } from 'src/shared/services/prisma.service';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RawBodyMiddleware } from './middleware/raw-body.middleware';
import { AtlosWebhookGuard } from './guards/atlos-webhook.guard';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    PaymentsService,
    PaymentsWebhookService,
    PrismaService,
    ConfigService,
    AtlosWebhookGuard,
  ],
  exports: [PaymentsService], // Export PaymentsService so other modules can use it
})
export class PaymentsModule {}
