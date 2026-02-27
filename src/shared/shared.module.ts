import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleService } from './services/schedule.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from './services/prisma.service';
import { ApiClient } from './types/utils/api-client';
import { CircuitBreaker } from './types/utils/circuit-breaker';
import { SecurityConfig } from './config/security.config';
import { CacheService } from './services/redis-cache.service';
import { ProjectManagementService } from './services/project-management.service';
import { S3UrlService } from './services/s3-url.service';
import { GameGenCreditService } from '../projects/services/game-gen-credit.service';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [
    PrismaService,
    ScheduleService,
    ApiClient,
    CircuitBreaker,
    SecurityConfig,
    CacheService,
    ProjectManagementService,
    ConfigService,
    S3UrlService,
    GameGenCreditService,
  ],
  exports: [
    ScheduleService,
    CacheService,
    ProjectManagementService,
    PrismaService,
    S3UrlService,
    GameGenCreditService,
  ],
})
export class SharedModule {}
