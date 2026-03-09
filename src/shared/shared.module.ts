import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from './services/prisma.service';
import { CacheService } from './services/redis-cache.service';
import { S3UrlService } from './services/s3-url.service';
import { CreditService } from '../projects/services/credit.service';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [
    PrismaService,
    CacheService,
    ConfigService,
    S3UrlService,
    CreditService,
  ],
  exports: [CacheService, PrismaService, S3UrlService, CreditService],
})
export class SharedModule {}
