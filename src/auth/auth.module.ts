import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthMiddleware } from './auth.middleware';
import { PrismaService } from 'src/shared/services/prisma.service';

@Module({
  imports: [ConfigModule.forRoot()],
  providers: [PrismaService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        // Public routes
        { path: '/', method: RequestMethod.GET },
        { path: '/health', method: RequestMethod.GET },
        { path: '/meme-gpt/health', method: RequestMethod.GET },
        // Swagger documentation routes
        { path: '/api', method: RequestMethod.GET },
        { path: '/api-json', method: RequestMethod.GET },
        { path: '/api/*path', method: RequestMethod.GET },
        // Webhook routes
        {
          path: '/payments/webhook/meme-coin/confirm-payin-created',
          method: RequestMethod.POST,
        },
        {
          path: '/payments/webhook/meme-coin/confirm-payin-completed',
          method: RequestMethod.POST,
        },
        {
          path: '/generation/webhook/result',
          method: RequestMethod.POST,
        },
        {
          path: '/webhooks/e2b',
          method: RequestMethod.POST,
        },
        {
          path: '/api/enable3/webhook/withdrawal',
          method: RequestMethod.POST,
        },
        // User authentication routes
        {
          path: '/user/sign-message',
          method: RequestMethod.GET,
        },
        {
          path: '/user/login',
          method: RequestMethod.POST,
        },
        {
          path: '/user/auth/refresh-token',
          method: RequestMethod.POST,
        },
        // Public generation model routes
        {
          path: '/generation/models/image-to-3d',
          method: RequestMethod.GET,
        },
        {
          path: '/generation/models/text-to-3d',
          method: RequestMethod.GET,
        },
        // Python backend routes (no JWT required, uses API key + userId in body)
        {
          path: '/generation/text-to-image',
          method: RequestMethod.POST,
        },
        {
          path: '/generation/image-to-image',
          method: RequestMethod.POST,
        },
        {
          path: '/generation/remove-background',
          method: RequestMethod.POST,
        },
        {
          path: '/brand/retrieve',
          method: RequestMethod.POST,
        },
        {
          path: '/brand/ai-query',
          method: RequestMethod.POST,
        },
      )
      .forRoutes('*');
  }
}
