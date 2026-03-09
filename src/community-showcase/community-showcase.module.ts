import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommunityShowcaseController } from './controllers/community-showcase.controller';
import { CommunityShowcaseService } from './services/community-showcase.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [ConfigModule, SharedModule],
  controllers: [CommunityShowcaseController],
  providers: [CommunityShowcaseService],
  exports: [CommunityShowcaseService],
})
export class CommunityShowcaseModule {}
