/**
 * Meme GPT Module
 * AI-powered meme coin research agent
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../shared/shared.module';
import { MemeGptService } from './meme-gpt.service';
import { MemeGptController } from './meme-gpt.controller';
import { ParallelAIService } from './services/parallel-ai.service';
import { OpenRouterService } from './services/openrouter.service';

@Module({
  imports: [ConfigModule, SharedModule],
  controllers: [MemeGptController],
  providers: [MemeGptService, ParallelAIService, OpenRouterService],
  exports: [MemeGptService],
})
export class MemeGptModule {}
