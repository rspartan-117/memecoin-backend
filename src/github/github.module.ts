// github.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubController } from './controllers/github.controller';
import { GithubService } from './services/github.service';
import { PrismaService } from '../shared/services/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [GithubController],
  providers: [GithubService, PrismaService],
  exports: [GithubService],
})
export class GithubModule {}
