import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DeployController } from './controllers/deploy.controller';
import { DeployService } from './services/deploy.service';
import { DeployProcessor } from './processors/deploy.processor';
import { SharedModule } from '../shared/shared.module';
import { CommunityShowcaseModule } from '../community-showcase/community-showcase.module';

@Module({
  imports: [
    SharedModule,
    CommunityShowcaseModule,

    // Register queue with improved options
    BullModule.registerQueue({
      name: 'deploy-queue',
      defaultJobOptions: {
        attempts: 3, // Retry failed jobs 3 times
        backoff: {
          type: 'exponential',
          delay: 5000, // Increased delay between retries
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: false, // Keep failed jobs for debugging
        timeout: 1800000, // 30 minutes timeout (deployment can take time)
      },
      settings: {
        lockDuration: 600000, // 10 minutes lock duration (important!)
        lockRenewTime: 30000, // Renew lock every 30 seconds
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 1, // Max times a job can be recovered from stalled state
      },
      limiter: {
        max: 1, // Process 1 deployment at a time (prevent conflicts)
        duration: 1000, // per second
      },
    }),
  ],
  controllers: [DeployController],
  providers: [DeployService, DeployProcessor],
  exports: [DeployService],
})
export class DeploymentModule {}
