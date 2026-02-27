import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DeployService } from '../services/deploy.service';

@Processor('deploy-queue')
export class DeployProcessor {
  private readonly logger = new Logger(DeployProcessor.name);

  constructor(private readonly deployService: DeployService) {}

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}...`);
    this.logger.log(
      `Job data: ${JSON.stringify({ deploymentId: job.data?.deploymentId, userId: job.data?.userId })}`,
    );
  }

  @OnQueueCompleted()
  onComplete(job: Job, result: any) {
    this.logger.log(`Completed job ${job.id} of type ${job.name}`);
    this.logger.log(`Result: ${JSON.stringify(result)}`);
  }

  @OnQueueFailed()
  onError(job: Job<any>, error: any) {
    this.logger.error(
      `Failed job ${job.id} of type ${job.name}: ${error.message}`,
    );
    this.logger.error(`Error stack: ${error.stack}`);
  }

  @Process({
    name: 'deploy-task',
    concurrency: 1, // Process one job at a time
  })
  async handleDeploy(job: Job) {
    const {
      deploymentId,
      dto,
      userId,
      frontendAppName,
      frontendServiceName,
      projectTypeCode,
    } = job.data;

    this.logger.log(
      `🚀 Processing deploy-task for deployment: ${deploymentId}`,
    );
    this.logger.log(`Job ID: ${job.id}, Attempt: ${job.attemptsMade + 1}`);

    try {
      await this.deployService.runDeploymentJob(
        deploymentId,
        dto,
        userId,
        frontendAppName,
        frontendServiceName,
        job,
        projectTypeCode,
      );

      this.logger.log(
        `✅ Deploy-task completed successfully for: ${deploymentId}`,
      );
      return { success: true, deploymentId };
    } catch (error) {
      this.logger.error(`❌ Deploy-task failed for: ${deploymentId}`);
      this.logger.error(`Error: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      throw error;
    }
  }
}
