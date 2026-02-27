import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './logging.interceptor';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { SanitizeResponseInterceptor } from './shared/interceptors/sanitize-response.interceptor';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { UsersModule } from './users/users.module';
import { GenerationModule } from './generation/generation.module';
import { CouponsModule } from './coupons/coupons.module';
import { ProjectsModule } from './projects/projects.module';
import { PaymentsModule } from './payments/payments.module';
import { Enable3Module } from './enable3/enable3.module';
import { DeploymentModule } from './deployment/deployment.module';
import { GithubModule } from './github/github.module';
import { MemeGptModule } from './mastra/meme-gpt.module';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('RedisCacheModule');
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';
        const redisHost =
          configService.getOrThrow<string>('REDIS_HOST_ADDRESS');
        const redisPort = configService.getOrThrow('REDIS_PORT');
        const isDigitalOcean = redisHost?.includes('digitalocean.com');
        const isScaleGrid = redisHost?.includes('mongodirector.com');
        const requiresTLS = isProduction || isDigitalOcean || isScaleGrid;

        logger.log(`🔄 Initializing Redis Cache connection...`);
        logger.log(`📍 Redis Host: ${redisHost}`);
        logger.log(`🔌 Redis Port: ${redisPort}`);
        logger.log(`🔐 TLS Enabled: ${requiresTLS}`);
        logger.log(
          `🌍 Environment: ${isProduction ? 'production' : 'development'}`,
        );

        return {
          store: redisStore,
          host: redisHost,
          port: redisPort,
          auth_pass: configService.getOrThrow('REDIS_PASSWORD'),
          tls: requiresTLS ? { rejectUnauthorized: false } : undefined,
        };
      },
      inject: [ConfigService],
    }),
    SharedModule,
    AuthModule,
    ScheduleModule.forRoot(),
    PrometheusModule.register({
      path: '/health',
      defaultMetrics: {
        enabled: true,
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [SharedModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        return [
          {
            ttl: 60000, // 1 minute in milliseconds
            limit: isProduction ? 30 : 100, // Stricter in production
          },
        ];
      },
    }),
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';
        const isDigitalOcean = configService
          .get<string>('REDIS_HOST_ADDRESS')
          ?.includes('digitalocean.com');
        const isScaleGrid = configService
          .get<string>('REDIS_HOST_ADDRESS')
          ?.includes('mongodirector.com');
        const requiresTLS = isProduction || isDigitalOcean || isScaleGrid;

        return {
          redis: {
            host: configService.getOrThrow<string>('REDIS_HOST_ADDRESS'),
            port: configService.getOrThrow<number>('REDIS_PORT'),
            password: configService.getOrThrow<string>('REDIS_PASSWORD'),
            tls: requiresTLS ? { rejectUnauthorized: false } : undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    GenerationModule,
    UsersModule,
    CouponsModule,
    ProjectsModule,
    PaymentsModule,
    Enable3Module,
    DeploymentModule,
    GithubModule,
    MemeGptModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // {
    //     provide: APP_INTERCEPTOR,
    //     useClass: SanitizeResponseInterceptor,
    // },
  ],
})
export class AppModule {}
