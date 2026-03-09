import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/services/prisma.service';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as AdmZip from 'adm-zip';
import { Octokit } from 'octokit';
import { DeployToKoyebDto } from '../dto/deploy-to-koyeb.dto';
import { Response, Request } from 'express';
import { S3UrlService } from '../../shared/services/s3-url.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { CommunityShowcaseService } from '../../community-showcase/services/community-showcase.service';
import {
  CreditService,
  DEPLOYMENT_CREDIT_COST,
  CUSTOM_DOMAIN_CREDIT_SURCHARGE,
  InsufficientCreditsError,
} from '../../projects/services/credit.service';

@Injectable()
export class DeployService {
  private readonly logger = new Logger(DeployService.name);
  private readonly koyebApiToken: string;
  private readonly koyebApiBaseUrl = 'https://app.koyeb.com/v1';
  private readonly githubToken: string;
  private readonly zipStorageDir: string;
  private readonly unzipStorageDir: string;
  private readonly projectApiUrl: string;
  private readonly pagespeedApiKey: string;
  private readonly pagespeedApiUrl =
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

  // Base credit cost per deployment trigger (1,100 credits = $5.50)
  // Covers 1 month of: Koyeb nano ($2.68) + DO Spaces (~$0.01) at 2× margin.
  // No refund on failure — platform resources are consumed regardless.
  private static readonly DEPLOYMENT_CREDIT_COST = DEPLOYMENT_CREDIT_COST;

  // Custom domain surcharge included in every deployment (100 credits = $0.50)
  // Covers SaaS Custom Domains $0.20/domain/month at 2× margin.
  // Total per deployment: 1,100 + 100 = 1,200 credits ($6.00).
  private static readonly CUSTOM_DOMAIN_CREDIT_SURCHARGE =
    CUSTOM_DOMAIN_CREDIT_SURCHARGE;

  // SaaS Custom Domains configuration
  private readonly saascdApiToken: string | null;
  private readonly saascdAccountUuid: string | null;
  private readonly saascdApiBaseUrl =
    'https://app.saascustomdomains.com/api/v1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly s3Service: S3UrlService,
    private readonly creditService: CreditService,
    private readonly showcaseService: CommunityShowcaseService,
    @InjectQueue('deploy-queue') private readonly deployQueue: Queue,
  ) {
    const koyebToken =
      process.env.KOYEB_API_TOKEN ||
      configService.get<string>('KOYEB_API_TOKEN');
    if (!koyebToken) {
      throw new Error('KOYEB_API_TOKEN is not set in environment variables');
    }
    this.koyebApiToken = koyebToken;

    const ghToken =
      process.env.GITHUB_TOKEN || configService.get<string>('GITHUB_TOKEN');
    if (!ghToken) {
      throw new Error('GITHUB_TOKEN is not set in environment variables');
    }
    this.githubToken = ghToken;

    this.zipStorageDir = path.resolve(process.cwd(), 'zipstorage');
    this.unzipStorageDir = path.resolve(process.cwd(), 'unzipstorage');

    // PYTHON_API_URL is critical — without it every deployment ZIP fetch will fail
    const projectApiUrl = this.configService.get<string>('PYTHON_API_URL');
    if (!projectApiUrl) {
      throw new Error(
        'PYTHON_API_URL is not set in environment variables. ' +
          'This URL is required to fetch the project ZIP bundle from the Python generation service.',
      );
    }
    this.projectApiUrl = projectApiUrl;

    this.pagespeedApiKey =
      this.configService.get<string>('GOOGLE_PAGESPEED_API_KEY') || '';
    if (!this.pagespeedApiKey) {
      this.logger.warn(
        'GOOGLE_PAGESPEED_API_KEY is not set — deployment screenshots will be skipped',
      );
    }

    // SaaS Custom Domains (required — every deployment requires a custom domain)
    this.saascdApiToken =
      process.env.SAAS_CD_API_TOKEN ||
      configService.get<string>('SAAS_CD_API_TOKEN') ||
      null;
    this.saascdAccountUuid =
      process.env.SAAS_CD_ACCOUNT_UUID ||
      configService.get<string>('SAAS_CD_ACCOUNT_UUID') ||
      null;

    // SaaS CD credentials are required — custom domain is mandatory for all deployments
    if (this.saascdApiToken && !this.saascdAccountUuid) {
      this.logger.error(
        'SAAS_CD_API_TOKEN is set but SAAS_CD_ACCOUNT_UUID is missing — deployments will fail',
      );
    } else if (!this.saascdApiToken && this.saascdAccountUuid) {
      this.logger.error(
        'SAAS_CD_ACCOUNT_UUID is set but SAAS_CD_API_TOKEN is missing — deployments will fail',
      );
    } else if (!this.saascdApiToken && !this.saascdAccountUuid) {
      this.logger.error(
        'SAAS_CD_API_TOKEN and SAAS_CD_ACCOUNT_UUID are not set — deployments will fail',
      );
    }

    if (!fs.existsSync(this.zipStorageDir)) {
      fs.mkdirSync(this.zipStorageDir, { recursive: true });
    }
    if (!fs.existsSync(this.unzipStorageDir)) {
      fs.mkdirSync(this.unzipStorageDir, { recursive: true });
    }

    this.setupQueueListeners();
  }

  private setupQueueListeners() {
    this.deployQueue.on('error', (error) => {
      this.logger.error(`Queue error: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
    });

    this.deployQueue.on('waiting', (jobId) => {
      this.logger.log(`Job ${jobId} is waiting in queue`);
    });

    this.deployQueue.on('active', (job) => {
      this.logger.log(
        `Job ${job.id} is now active - processing deployment ${job.data.deploymentId}`,
      );
    });

    this.deployQueue.on('completed', (job, result) => {
      this.logger.log(`Job ${job.id} completed successfully`);
    });

    this.deployQueue.on('failed', async (job, err) => {
      this.logger.error(`Job ${job.id} failed: ${err.message}`);
      this.logger.error(`Error stack: ${err.stack}`);

      const deploymentId = job.data?.deploymentId;
      if (deploymentId) {
        try {
          await this.prisma.deployment.update({
            where: { id: deploymentId },
            data: { status: 'FAILED' },
          });
          this.logger.log(
            `Updated deployment ${deploymentId} status to FAILED`,
          );
        } catch (updateError) {
          this.logger.error(
            `Failed to update deployment status: ${updateError.message}`,
          );
        }
      } else {
        this.logger.warn(`No deploymentId found in failed job ${job.id}`);
      }
    });

    this.deployQueue.on('stalled', async (job) => {
      this.logger.warn(`Job ${job.id} has stalled`);

      const deploymentId = job.data?.deploymentId;
      if (deploymentId) {
        try {
          const deployment = await this.prisma.deployment.findUnique({
            where: { id: deploymentId },
            select: { status: true },
          });

          if (deployment?.status === 'PROCESSING') {
            await this.prisma.deployment.update({
              where: { id: deploymentId },
              data: { status: 'FAILED' },
            });
            this.logger.log(
              `Updated stalled deployment ${deploymentId} status to FAILED`,
            );
          }
        } catch (updateError) {
          this.logger.error(
            `Failed to update stalled deployment status: ${updateError.message}`,
          );
        }
      }
    });
  }

  private async deletePreviousDeployment(projectId: string): Promise<void> {
    try {
      const existingDeployment = await this.prisma.deployment.findFirst({
        where: { projectId },
        select: {
          id: true,
          frontendAppName: true,
          saascdDomainUuid: true,
          saascdUpstreamUuid: true,
        },
      });

      if (!existingDeployment) {
        this.logger.log(
          `No previous deployment found for project ${projectId}`,
        );
        return;
      }

      this.logger.log(
        `Found previous deployment ${existingDeployment.id} for project ${projectId}`,
      );

      // Clean up SaaS Custom Domains resources
      if (existingDeployment.saascdUpstreamUuid) {
        try {
          this.logger.log(
            `Deleting SaaS CD upstream: ${existingDeployment.saascdUpstreamUuid}`,
          );
          // Deleting the upstream also removes all custom domains on it
          const deleteRes = await this.saascdFetch(
            `/upstreams/${existingDeployment.saascdUpstreamUuid}`,
            'DELETE',
          );
          if (deleteRes.ok) {
            this.logger.log(
              `SaaS CD upstream ${existingDeployment.saascdUpstreamUuid} deleted successfully`,
            );
          } else {
            const errBody = await deleteRes.text().catch(() => '');
            this.logger.warn(
              `Failed to delete SaaS CD upstream: ${deleteRes.status} ${errBody}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to delete SaaS CD upstream: ${error.message}`,
          );
        }
      }

      if (existingDeployment.frontendAppName) {
        try {
          this.logger.log(
            `Deleting frontend app: ${existingDeployment.frontendAppName}`,
          );
          execSync(
            `koyeb apps delete ${existingDeployment.frontendAppName} --token ${this.koyebApiToken}`,
            { encoding: 'utf-8' },
          );
          this.logger.log(
            `Frontend app ${existingDeployment.frontendAppName} deleted successfully`,
          );
        } catch (error) {
          this.logger.warn(`Failed to delete frontend app: ${error.message}`);
        }
      }

      try {
        await this.prisma.deployment.delete({
          where: { id: existingDeployment.id },
        });
        this.logger.log(
          `Previous deployment ${existingDeployment.id} deleted from database`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to delete deployment record from database: ${error.message}`,
        );
      }
    } catch (error) {
      this.logger.error(`Error deleting previous deployment: ${error.message}`);
    }
  }

  /**
   * Terminate an active deployment by stopping all associated cloud resources
   * and marking the deployment record as DELETED.
   *
   * Used by the monthly billing cron when a user has insufficient credits.
   * The DB record is kept (status = 'DELETED') so the user can see their history.
   */
  async terminateDeploymentById(deployment: {
    id: string;
    frontendAppName: string | null;
    saascdUpstreamUuid: string | null;
    saascdDomainUuid: string | null;
  }): Promise<void> {
    this.logger.log(`[Terminate] Terminating deployment ${deployment.id}`);

    // 1. Delete SaaS Custom Domains resources (deleting upstream removes all domains on it)
    if (deployment.saascdUpstreamUuid) {
      try {
        const deleteRes = await this.saascdFetch(
          `/upstreams/${deployment.saascdUpstreamUuid}`,
          'DELETE',
        );
        if (deleteRes.ok) {
          this.logger.log(
            `[Terminate] SaaS CD upstream ${deployment.saascdUpstreamUuid} deleted`,
          );
        } else {
          const errBody = await deleteRes.text().catch(() => '');
          this.logger.warn(
            `[Terminate] SaaS CD upstream delete failed: ${deleteRes.status} ${errBody}`,
          );
        }
      } catch (err) {
        this.logger.warn(`[Terminate] SaaS CD delete error: ${err.message}`);
      }
    }

    // 2. Delete Koyeb application
    if (deployment.frontendAppName) {
      try {
        execSync(
          `koyeb apps delete ${deployment.frontendAppName} --token ${this.koyebApiToken}`,
          { encoding: 'utf-8' },
        );
        this.logger.log(
          `[Terminate] Koyeb app ${deployment.frontendAppName} deleted`,
        );
      } catch (err) {
        this.logger.warn(`[Terminate] Koyeb app delete error: ${err.message}`);
      }
    }

    // 3. Mark as DELETED in DB — preserve record for user history
    try {
      await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: 'DELETED' },
      });
      this.logger.log(
        `[Terminate] Deployment ${deployment.id} marked DELETED in DB`,
      );
    } catch (err) {
      this.logger.error(
        `[Terminate] Failed to mark deployment DELETED: ${err.message}`,
      );
    }

    // 4. Invalidate community showcase cache (deployment may have been public)
    try {
      await this.showcaseService.invalidateCache();
      this.logger.log('[Terminate] Community showcase cache invalidated');
    } catch (err) {
      this.logger.warn(
        `[Terminate] Failed to invalidate showcase cache: ${err.message}`,
      );
    }
  }

  /**
   * Daily cron job (runs at 03:00 UTC) that handles recurring monthly billing
   * for all active Koyeb deployments.
   *
   * Flow for each deployment where nextBillingAt <= now():
   *   ✅ Credits available → deduct, advance nextBillingAt by 30 days
   *   ❌ Insufficient credits → terminate Koyeb + SaaS CD resources, mark DELETED
   *
   * This is the correct recurring revenue model: the initial upfront charge
   * (1,100 credits) covers month 1; this cron covers every subsequent month.
   */
  @Cron('0 3 * * *', { name: 'deployment-renewal-billing' })
  async handleDeploymentRenewalBilling(): Promise<void> {
    const now = new Date();
    this.logger.log(
      '[DeploymentBilling] Starting daily renewal billing check...',
    );

    let checked = 0;
    let renewed = 0;
    let terminated = 0;

    try {
      const dueBillings = await this.prisma.deployment.findMany({
        where: {
          status: 'ACTIVE',
          nextBillingAt: { lte: now },
        },
        select: {
          id: true,
          userId: true,
          projectId: true,
          frontendAppName: true,
          saascdUpstreamUuid: true,
          saascdDomainUuid: true,
          customDomain: true,
        },
      });

      checked = dueBillings.length;
      this.logger.log(
        `[DeploymentBilling] ${checked} deployment(s) due for renewal`,
      );

      for (const deployment of dueBillings) {
        const creditsToDeduct =
          DeployService.DEPLOYMENT_CREDIT_COST +
          (deployment.customDomain
            ? DeployService.CUSTOM_DOMAIN_CREDIT_SURCHARGE
            : 0);

        try {
          // chargeForDeployment throws InsufficientCreditsError when user has no credits left
          await this.creditService.chargeForDeployment({
            userId: deployment.userId,
            projectId: deployment.projectId,
            creditsToDeduct,
          });

          // Charge succeeded — advance the billing window by 30 days
          const nextBillingAt = new Date(
            now.getTime() + 30 * 24 * 60 * 60 * 1000,
          );
          await this.prisma.deployment.update({
            where: { id: deployment.id },
            data: {
              lastBilledAt: now,
              nextBillingAt,
            },
          });

          renewed++;
          this.logger.log(
            `[DeploymentBilling] ✅ Renewed ${deployment.id} (user: ${deployment.userId}) — ` +
              `${creditsToDeduct} credits charged, next billing: ${nextBillingAt.toISOString()}`,
          );
        } catch (chargeError) {
          if (chargeError instanceof InsufficientCreditsError) {
            // User has no credits left — terminate and stop billing them
            terminated++;
            this.logger.warn(
              `[DeploymentBilling] ⚠️ Insufficient credits for deployment ${deployment.id} ` +
                `(user: ${deployment.userId}) — terminating. ${chargeError.message}`,
            );
            await this.terminateDeploymentById(deployment);
          } else {
            // Transient error (DB down, network, etc.) — skip this cycle, retry tomorrow
            this.logger.error(
              `[DeploymentBilling] ❌ Unexpected error charging deployment ${deployment.id} ` +
                `(user: ${deployment.userId}) — skipping, will retry next cycle. Error: ${chargeError.message}`,
              chargeError.stack,
            );
          }
        }
      }

      this.logger.log(
        `[DeploymentBilling] Done: ${checked} checked, ${renewed} renewed, ${terminated} terminated`,
      );
    } catch (error) {
      this.logger.error(
        `[DeploymentBilling] Fatal error: ${error.message}`,
        error.stack,
      );
    }
  }

  async deployToKoyeb(dto: DeployToKoyebDto, userId: string) {
    const { projectId, appName, envVariables, isPublic } = dto;

    this.logger.log(
      `Starting deployment (enqueue) for ${userId}_${projectId}_${appName}`,
    );

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { type: true },
    });

    if (!project) {
      throw new BadRequestException(`Project ${projectId} not found`);
    }

    // ===== CREDIT GATE =====
    // 1,200 credits per deployment: 1,100 (Koyeb nano + storage) + 100 (custom domain)
    // Custom domain is mandatory for all deployments.
    const creditsToDeduct =
      DeployService.DEPLOYMENT_CREDIT_COST +
      DeployService.CUSTOM_DOMAIN_CREDIT_SURCHARGE;
    this.logger.log(
      `Deployment credits to charge: ${creditsToDeduct} (includes custom domain)`,
    );
    const { creditsDeducted, creditsRemaining } =
      await this.creditService.chargeForDeployment({
        userId,
        projectId,
        creditsToDeduct,
      });
    this.logger.log(
      `Credits charged: ${creditsDeducted} — remaining: ${creditsRemaining} (user: ${userId})`,
    );
    // =======================

    // All post-charge steps are wrapped in one try so that any failure
    // (DB constraint on deployment.create, Redis down for deployQueue.add, etc.)
    // triggers a full credit refund — at this point no cloud resources exist yet.
    let deployment: { id: string } | null = null;
    try {
      await this.deletePreviousDeployment(projectId);

      const projectTypeCode = 'lp'; // Always landing page
      const visibility = isPublic ? 'pb' : 'pr';

      const sanitizedAppName = this.sanitizeName(appName);
      const timestamp = Date.now();

      const frontendAppName = `${sanitizedAppName}-fr-${projectTypeCode}-${visibility}-${timestamp}`;
      const frontendServiceName = sanitizedAppName;

      deployment = await this.prisma.deployment.create({
        data: {
          userId,
          projectId,
          frontendAppName,
          frontendServiceName,
          frontendUrl: '',
          githubRepoUrl: '',
          visibility,
          projectType: project.type,
          status: 'PROCESSING',
          screenshotUrl: '',
          customDomain: dto.customDomain,
          domainStatus: 'PENDING',
        },
      });

      this.logger.log(`Deployment record created with ID: ${deployment.id}`);

      this.logger.log('Checking queue connection...');
      const queueHealth = await this.deployQueue.isReady();
      this.logger.log(`Queue ready status: ${queueHealth}`);

      const client = await this.deployQueue.client;
      this.logger.log(`Queue client status: ${client.status}`);

      this.logger.log('Adding job to queue...');
      const job = await this.deployQueue.add(
        'deploy-task',
        {
          deploymentId: deployment.id,
          dto,
          userId,
          frontendAppName,
          frontendServiceName,
          projectTypeCode,
        },
        {
          jobId: `deploy-${deployment.id}`,
          timeout: 1800000,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      this.logger.log(`✅ Job added to queue successfully! Job ID: ${job.id}`);
      this.logger.log(
        `Job data: ${JSON.stringify({ deploymentId: deployment.id, userId })}`,
      );

      return {
        message: 'Deployment started',
        deploymentId: deployment.id,
        jobId: job.id,
        frontendAppName,
        frontendServiceName,
        creditsDeducted,
        creditsRemaining,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to enqueue deployment: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      this.logger.error(`Error details: ${JSON.stringify(error)}`);

      if (deployment) {
        await this.prisma.deployment
          .update({ where: { id: deployment.id }, data: { status: 'FAILED' } })
          .catch((e) =>
            this.logger.warn(`Could not mark deployment FAILED: ${e.message}`),
          );
      }

      // Refund credits — queue enqueue failed before any cloud resources were allocated
      await this.creditService
        .refundDeploymentCredits({
          userId,
          projectId,
          creditsToRefund: creditsDeducted,
        })
        .catch((refundErr) => {
          this.logger.error(
            `CRITICAL: Failed to refund ${creditsDeducted} credits for user ${userId} ` +
              `after pre-queue failure (project: ${projectId}): ${refundErr.message}`,
          );
        });

      throw new InternalServerErrorException(
        `Failed to start deployment: ${error.message}`,
      );
    }
  }

  async streamDeployToKoyeb(
    dto: DeployToKoyebDto,
    userId: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const { projectId, appName } = dto;

    this.logger.log(
      `Starting streaming deployment for ${userId}_${projectId}_${appName}`,
    );

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    } else {
      res.write('\n');
    }

    const writeSSE = (data: any) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        this.logger.error(`SSE write error: ${err.message}`);
      }
    };

    // Hoisted so the outer catch can read them for the refund / cleanup path
    let creditsDeducted = 0;
    let creditsRemaining = 0;
    // Tracks whether deployment.create() succeeded so the catch can mark it FAILED
    // if deployQueue.add() subsequently throws (deployment is const inside the try).
    let createdDeploymentId: string | null = null;

    try {
      // Initial event
      writeSSE({ type: 'init', message: 'Deployment initiated' });

      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { type: true },
      });

      if (!project) {
        writeSSE({ type: 'error', message: 'Project not found' });
        res.end();
        return;
      }

      // ===== CREDIT GATE =====
      // 1,200 credits per deployment: 1,100 (Koyeb nano + storage) + 100 (custom domain)
      // Custom domain is mandatory for all deployments.
      const creditsToDeduct =
        DeployService.DEPLOYMENT_CREDIT_COST +
        DeployService.CUSTOM_DOMAIN_CREDIT_SURCHARGE;
      try {
        const chargeResult = await this.creditService.chargeForDeployment({
          userId,
          projectId,
          creditsToDeduct,
        });
        creditsDeducted = chargeResult.creditsDeducted;
        creditsRemaining = chargeResult.creditsRemaining;
        this.logger.log(
          `Credits charged: ${creditsDeducted} — remaining: ${creditsRemaining} (user: ${userId})`,
        );
      } catch (creditError) {
        writeSSE({
          type: 'error',
          message:
            creditError.message || 'Insufficient credits to start deployment',
          code: 'INSUFFICIENT_CREDITS',
          required: creditsToDeduct,
        });
        res.end();
        return;
      }
      // =======================

      writeSSE({
        type: 'progress',
        progress: 1,
        step: `Credits deducted: ${creditsDeducted} (${creditsRemaining} remaining)`,
      });

      await this.deletePreviousDeployment(projectId);
      writeSSE({
        type: 'progress',
        progress: 2,
        step: 'Cleaned up previous deployment',
      });

      const projectTypeCode = 'lp'; // Always landing page
      const visibility = dto.isPublic ? 'pb' : 'pr';
      const sanitizedAppName = this.sanitizeName(appName);
      const timestamp = Date.now();

      const frontendAppName = `${sanitizedAppName}-fr-${projectTypeCode}-${visibility}-${timestamp}`;
      const frontendServiceName = sanitizedAppName;

      const deployment = await this.prisma.deployment.create({
        data: {
          userId,
          projectId,
          frontendAppName,
          frontendServiceName,
          frontendUrl: '',
          githubRepoUrl: '',
          visibility,
          projectType: project.type,
          status: 'PROCESSING',
          screenshotUrl: '',
          customDomain: dto.customDomain,
          domainStatus: 'PENDING',
        },
      });
      // Make the id visible to the outer catch in case deployQueue.add() throws next
      createdDeploymentId = deployment.id;

      writeSSE({
        type: 'queued',
        deploymentId: deployment.id,
        message: 'Deployment queued',
        progress: 5,
      });

      //Queue the job
      const job = await this.deployQueue.add(
        'deploy-task',
        {
          deploymentId: deployment.id,
          dto,
          userId,
          frontendAppName,
          frontendServiceName,
          projectTypeCode,
        },
        {
          jobId: `deploy-${deployment.id}`,
          timeout: 1800000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Job ${job.id} queued, streaming progress...`);

      // Poll job progress and stream updates
      const pollInterval = setInterval(async () => {
        try {
          const currentJob = await this.deployQueue.getJob(job.id as string);
          if (!currentJob) {
            clearInterval(pollInterval);
            return;
          }

          const state = await currentJob.getState();
          const progress = await currentJob.progress();
          const deploymentRecord = await this.prisma.deployment.findUnique({
            where: { id: deployment.id },
          });

          // Map progress to step descriptions
          let step = '';
          if (progress < 15) step = 'Creating project bundle...';
          else if (progress < 25) step = 'Extracting files...';
          else if (progress < 40) step = 'Setting up GitHub repository...';
          else if (progress < 85) step = 'Deploying frontend application...';
          else if (progress < 100) step = 'Capturing screenshot...';
          else step = 'Finalizing deployment...';

          writeSSE({
            type: 'progress',
            progress: progress || 10,
            step,
            state,
          });

          // Send URLs when available
          if (deploymentRecord?.githubRepoUrl && !res.writableEnded) {
            writeSSE({
              type: 'url',
              service: 'github',
              url: deploymentRecord.githubRepoUrl,
            });
          }

          if (deploymentRecord?.frontendUrl && !res.writableEnded) {
            writeSSE({
              type: 'url',
              service: 'frontend',
              url: deploymentRecord.frontendUrl,
            });
          }

          // Check if completed or failed
          if (state === 'completed' || deploymentRecord?.status === 'ACTIVE') {
            clearInterval(pollInterval);
            writeSSE({
              type: 'complete',
              deploymentId: deployment.id,
              status: 'ACTIVE',
              backendUrl: deploymentRecord?.backendUrl || '',
              frontendUrl: deploymentRecord?.frontendUrl || '',
              githubRepoUrl: deploymentRecord?.githubRepoUrl || '',
              screenshotUrl: deploymentRecord?.screenshotUrl || '',
              customDomain: deploymentRecord?.customDomain || null,
              customDomainCname: deploymentRecord?.customDomainCname || null,
              domainStatus: deploymentRecord?.domainStatus || null,
              creditsDeducted,
              creditsRemaining,
              progress: 100,
            });
            res.end();
          } else if (
            state === 'failed' ||
            deploymentRecord?.status === 'FAILED'
          ) {
            clearInterval(pollInterval);
            const failedReason = await currentJob.failedReason;
            writeSSE({
              type: 'error',
              deploymentId: deployment.id,
              message: failedReason || 'Deployment failed',
              status: 'FAILED',
            });
            res.end();
          }
        } catch (pollError) {
          this.logger.error(`Poll error: ${pollError.message}`);
        }
      }, 2000); // Poll every 2 seconds

      // Cleanup on client disconnect
      const cleanup = () => {
        clearInterval(pollInterval);
        try {
          if (!res.writableEnded) res.end();
        } catch (e) {
          // ignore
        }
      };

      req.on('close', cleanup);
      res.on('close', cleanup);
    } catch (error) {
      this.logger.error(`Streaming deployment error: ${error.message}`);

      // Mark the deployment record FAILED if it was created before the throw
      if (createdDeploymentId) {
        await this.prisma.deployment
          .update({
            where: { id: createdDeploymentId },
            data: { status: 'FAILED' },
          })
          .catch((e) =>
            this.logger.warn(
              `Could not mark stream deployment FAILED: ${e.message}`,
            ),
          );
      }

      // Refund credits if they were successfully charged before the failure.
      // creditsDeducted is 0 until chargeForDeployment succeeds, so this guard
      // ensures we only refund when the charge actually went through and then
      // deployment.create() or deployQueue.add() subsequently failed.
      // At this point no cloud resources (GitHub, Koyeb, SaaS CD) exist yet.
      if (creditsDeducted > 0) {
        await this.creditService
          .refundDeploymentCredits({
            userId,
            projectId,
            creditsToRefund: creditsDeducted,
          })
          .catch((refundErr) => {
            this.logger.error(
              `CRITICAL: Failed to refund ${creditsDeducted} credits for user ${userId} ` +
                `after pre-queue failure (project: ${projectId}): ${refundErr.message}`,
            );
          });
      }

      writeSSE({
        type: 'error',
        message: error.message || 'Deployment failed to start',
      });
      res.end();
    }
  }

  async runDeploymentJob(
    deploymentId: string,
    dto: DeployToKoyebDto,
    userId: string,
    frontendAppName: string,
    frontendServiceName: string,
    job?: Job,
    projectTypeCode?: string,
  ) {
    const { projectId, appName, envVariables, isPublic } = dto;

    this.logger.log(`🚀 Running deployment job: ${deploymentId}`);

    // Update status: PROCESSING
    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'PROCESSING' },
    });

    if (job) await job.progress(5);

    const zipFileName = `${userId}_${projectId}_${appName}.zip`;
    const zipFilePath = path.join(this.zipStorageDir, zipFileName);
    const unzipDir = path.join(
      this.unzipStorageDir,
      `${userId}_${projectId}_${appName}`,
    );
    const frontendDir = path.join(unzipDir, 'frontend');

    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { type: true },
      });

      if (!project) {
        throw new BadRequestException(`Project ${projectId} not found`);
      }

      this.logger.log(
        `📦 Creating ZIP file for project ${projectId} (type: ${project.type})`,
      );
      if (job) await job.progress(10);
      await this.createZipFile(projectId, appName, zipFilePath, userId);
      this.logger.log(`Zip file created: ${zipFileName}`);
      if (job) await job.progress(15);

      if (!fs.existsSync(zipFilePath)) {
        throw new Error(`Zip file not found after creation: ${zipFileName}`);
      }

      this.extractZipFile(zipFilePath, unzipDir);
      if (job) await job.progress(20);

      // Tracks whether we're deploying a static landing page (Dockerfile)
      // vs a real frontend project (buildpack). This affects how we configure
      // the Koyeb service later.
      let isStaticLandingPage = false;

      // Landing page projects from the Python backend are flat static files
      // (index.html, style.css, script.js, etc.) — not a Node.js project.
      // The ZIP may also contain Python sandbox files (server.py, error_logger.py,
      // __pycache__/) that are only used inside the E2B sandbox and must be
      // excluded from the production deployment.
      //
      // Instead of forcing a Node.js buildpack (which requires package.json,
      // package-lock.json, npm ci — all unnecessary for static files), we
      // use a simple Dockerfile with `serve` pre-installed.
      if (!fs.existsSync(frontendDir)) {
        isStaticLandingPage = true;
        this.logger.log(
          'No frontend/ directory found — restructuring static landing page for Dockerfile deployment',
        );

        fs.mkdirSync(frontendDir, { recursive: true });

        // Python/sandbox files that must NOT be shipped in the frontend deployment
        const backendExclusions = new Set([
          'server.py',
          'error_logger.py',
          '__pycache__',
          'README_FOR_AGENT.md',
          'requirements.txt',
          '.env',
          'venv',
          'node_modules',
        ]);

        // Move only frontend-relevant files into frontend/ (flat — no build/ subfolder)
        const items = fs.readdirSync(unzipDir);
        let movedCount = 0;
        for (const item of items) {
          if (item === 'frontend') continue; // skip the directory we just created
          if (backendExclusions.has(item)) {
            this.logger.log(`Skipping sandbox/backend file: ${item}`);
            const src = path.join(unzipDir, item);
            fs.rmSync(src, { recursive: true, force: true });
            continue;
          }
          const src = path.join(unzipDir, item);
          const dest = path.join(frontendDir, item);
          fs.renameSync(src, dest);
          movedCount++;
        }

        // Write a Dockerfile that serves static files with `serve`.
        // This avoids the entire npm/buildpack/lockfile complexity.
        // The image is small (~180 MB) and starts in <2 s.
        const dockerfile = [
          'FROM node:20-alpine',
          'RUN npm install -g serve@14',
          'WORKDIR /app',
          'COPY . .',
          'EXPOSE 3000',
          'CMD ["serve", "-s", ".", "-l", "3000"]',
        ].join('\n');
        fs.writeFileSync(path.join(frontendDir, 'Dockerfile'), dockerfile);

        this.logger.log(
          `Static landing page restructured: ${movedCount} files moved to frontend/, Dockerfile created`,
        );
      }

      // For real frontend projects (React/CRA etc.), ensure package.json
      // and lockfile exist so the buildpack can install dependencies.
      if (!isStaticLandingPage) {
        this.ensurePackageJson(frontendDir);

        if (
          !fs.existsSync(path.join(frontendDir, 'package-lock.json')) &&
          !fs.existsSync(path.join(frontendDir, 'yarn.lock')) &&
          !fs.existsSync(path.join(frontendDir, 'pnpm-lock.yaml'))
        ) {
          this.logger.log(
            'No lockfile found in frontend dir — generating package-lock.json',
          );
          try {
            execSync('npm install --package-lock-only --ignore-scripts', {
              cwd: frontendDir,
              stdio: 'pipe',
              timeout: 60000,
            });
            this.logger.log('Generated package-lock.json for frontend');
          } catch (lockErr) {
            this.logger.warn(`Could not generate lockfile: ${lockErr.message}`);
          }
        }
      }
      if (job) await job.progress(25);

      const octokit = new Octokit({ auth: this.githubToken });
      const baseRepoName = `${userId}_${projectId}_${appName}`;
      let repoName = baseRepoName;
      let repoData: any;

      // NOTE: GitHub repo must be PUBLIC for Koyeb to access it
      this.logger.log(
        `Creating GitHub repository: ${repoName} (public for Koyeb, showcase: ${isPublic ? 'visible' : 'hidden'})`,
      );
      try {
        const { data } = await octokit.request('POST /user/repos', {
          name: repoName,
          private: false, // Always public for Koyeb deployment compatibility
        });
        repoData = data;
        this.logger.log(`Created GitHub repo: ${repoData.html_url}`);
      } catch (error: any) {
        if (
          error.status === 422 &&
          error.message?.includes('name already exists')
        ) {
          this.logger.warn(
            `Repository ${repoName} already exists, attempting to delete...`,
          );

          try {
            const { data: userData } = await octokit.request('GET /user');
            const owner = userData.login;

            await octokit.request('DELETE /repos/{owner}/{repo}', {
              owner,
              repo: repoName,
            });
            this.logger.log(`Deleted existing repository ${repoName}`);

            await new Promise((resolve) => setTimeout(resolve, 2000));

            const { data } = await octokit.request('POST /user/repos', {
              name: repoName,
              private: false,
            });
            repoData = data;
            this.logger.log(
              `Created GitHub repo after deletion: ${repoData.html_url}`,
            );
          } catch (deleteError: any) {
            this.logger.warn(
              `Could not delete existing repo: ${deleteError.message}`,
            );
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            repoName = `${baseRepoName}-${randomSuffix}`;
            this.logger.log(`Using unique repository name: ${repoName}`);

            const { data } = await octokit.request('POST /user/repos', {
              name: repoName,
              private: false,
            });
            repoData = data;
            this.logger.log(
              `Created GitHub repo with unique name: ${repoData.html_url}`,
            );
          }
        } else {
          throw error;
        }
      }

      if (job) await job.progress(30);

      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { githubRepoUrl: repoData.html_url },
      });

      const tokenRepoUrl = repoData.clone_url.replace(
        'https://',
        `https://${this.githubToken}@`,
      );
      this.pushToGitHub(unzipDir, tokenRepoUrl);
      if (job) await job.progress(40);

      const githubRepoFormat = this.formatRepoForKoyeb(repoData.clone_url);

      const frontendEnvVars = {
        PORT: '3000',
        NODE_ENV: 'production',
        ...(envVariables?.frontend || {}),
      };

      this.logger.log(
        `Deploying frontend: ${frontendAppName}/${frontendServiceName} (${isStaticLandingPage ? 'docker' : 'buildpack'})`,
      );
      if (job) await job.progress(45);
      const frontendResult = await this.deployKoyebService(
        frontendAppName,
        frontendServiceName,
        githubRepoFormat,
        'frontend',
        3000,
        isStaticLandingPage ? undefined : 'npx serve -s build -l 3000',
        frontendEnvVars,
        isStaticLandingPage ? undefined : 'npm run build',
        isStaticLandingPage ? 'docker' : 'buildpack',
      );

      if (!frontendResult) {
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED' },
        });
        throw new Error('Frontend deployment failed');
      }

      const frontendPublicUrl = frontendResult.url;
      const frontendAppId = frontendResult.appId;
      this.logger.log(`Frontend deployed at: ${frontendPublicUrl}`);
      if (job) await job.progress(70);

      // Attach custom domain via SaaS Custom Domains (required for all deployments)
      this.logger.log(
        `Attaching custom domain "${dto.customDomain}" via SaaS Custom Domains`,
      );
      try {
        await this.attachCustomDomain(
          frontendPublicUrl,
          dto.customDomain,
          deploymentId,
        );
        this.logger.log(
          `Custom domain "${dto.customDomain}" attached successfully`,
        );
      } catch (domainError) {
        this.logger.error(
          `Failed to attach custom domain: ${domainError.message}`,
        );
        // Don't fail the entire deployment - domain can be retried later
      }

      this.logger.log(
        `Capturing screenshot for frontend: ${frontendPublicUrl}`,
      );
      const screenshotUrl = await this.captureAndStoreScreenshot(
        frontendPublicUrl,
        projectId,
        frontendAppName,
      );
      if (job) await job.progress(95);

      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          frontendUrl: frontendPublicUrl,
          frontendKoyebAppId: frontendAppId,
          status: 'ACTIVE',
          screenshotUrl: screenshotUrl || '',
          deployedAt: new Date(),
          // The initial upfront charge covers the first 30 days.
          // The billing cron will pick this up on nextBillingAt and charge monthly thereafter.
          lastBilledAt: new Date(),
          nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      if (job) await job.progress(100);

      // Invalidate community showcase cache if this is a public deployment
      if (isPublic) {
        this.logger.log(
          'Public deployment completed — invalidating community showcase cache',
        );
        try {
          await this.showcaseService.invalidateCache();
        } catch (cacheErr) {
          this.logger.warn(
            `Failed to invalidate showcase cache: ${cacheErr.message}`,
          );
        }
      }

      try {
        if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
        if (fs.existsSync(unzipDir))
          fs.rmSync(unzipDir, { recursive: true, force: true });
      } catch (err) {
        this.logger.warn(`Cleanup failed: ${err.message}`);
      }

      this.logger.log(`Deployment job ${deploymentId} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Deployment error for ${deploymentId}: ${error?.message || error}`,
      );

      try {
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED' },
        });
      } catch (e) {
        this.logger.warn(`Failed to set deployment FAILED in DB: ${e.message}`);
      }

      try {
        if (fs.existsSync(unzipDir))
          fs.rmSync(unzipDir, { recursive: true, force: true });
        if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
      } catch (err) {
        // ignore
      }

      throw error;
    }
  }

  async streamDeploymentLogs(
    deploymentId: string,
    requestingUserId: string,
    which: 'all' | 'backend' | 'frontend',
    typesQuery: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        userId: true,
        backendAppName: true,
        backendServiceName: true,
        frontendAppName: true,
        frontendServiceName: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment ${deploymentId} not found`);
    }
    if (deployment.userId !== requestingUserId) {
      throw new UnauthorizedException(
        `You are not allowed to view logs for this deployment`,
      );
    }

    const requestedTypes = typesQuery
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as Array<'runtime' | 'build'>;

    if (requestedTypes.length === 0) {
      requestedTypes.push('runtime', 'build');
    }

    const streams: Array<{
      appName: string;
      serviceName: string;
      type: 'runtime' | 'build';
      prefix: string;
    }> = [];

    const addIf = (role: 'backend' | 'frontend') => {
      if (which !== 'all' && which !== role) return;
      if (role === 'backend') {
        if (!deployment.backendAppName || !deployment.backendServiceName)
          return;
        for (const t of requestedTypes) {
          streams.push({
            appName: deployment.backendAppName,
            serviceName: deployment.backendServiceName,
            type: t,
            prefix: `backend-${t}`,
          });
        }
      } else {
        if (!deployment.frontendAppName || !deployment.frontendServiceName)
          return;
        for (const t of requestedTypes) {
          streams.push({
            appName: deployment.frontendAppName,
            serviceName: deployment.frontendServiceName,
            type: t,
            prefix: `frontend-${t}`,
          });
        }
      }
    };

    addIf('backend');
    addIf('frontend');

    if (streams.length === 0) {
      throw new BadRequestException(
        'No log streams available for this deployment',
      );
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    } else {
      res.write('\n');
    }

    const writeSSE = (payload: string) => {
      try {
        const safe = payload.replace(/\r?\n/g, ' ');
        res.write(`data: ${safe}\n\n`);
      } catch (err) {
        // ignore
      }
    };

    const children: Array<ReturnType<typeof spawn>> = [];

    const spawnLogProcess = (
      appName: string,
      serviceName: string,
      type: string,
      prefix: string,
    ) => {
      const args = [
        'service',
        'logs',
        `${appName}/${serviceName}`,
        '-t',
        type,
        '--token',
        this.koyebApiToken,
      ];

      this.logger.debug(`Spawning koyeb logs: koyeb ${args.join(' ')}`);

      const child = spawn('koyeb', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        writeSSE(`[${prefix}] ${text.trim()}`);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        writeSSE(`[${prefix}-ERR] ${text.trim()}`);
      });

      child.on('error', (err) => {
        writeSSE(`[${prefix}-ERR] spawn error: ${err.message}`);
      });

      child.on('close', (code, signal) => {
        writeSSE(`[${prefix}] process closed (code=${code}, signal=${signal})`);
      });

      return child;
    };

    for (const s of streams) {
      try {
        const child = spawnLogProcess(
          s.appName,
          s.serviceName,
          s.type,
          s.prefix,
        );
        children.push(child);
      } catch (err) {
        writeSSE(
          `[${s.prefix}-ERR] failed to start: ${err?.message || String(err)}`,
        );
      }
    }

    const cleanup = () => {
      for (const c of children) {
        try {
          c.kill();
        } catch (e) {
          // ignore
        }
      }
      try {
        res.end();
      } catch (e) {
        // ignore
      }
    };

    req.on('close', () => {
      cleanup();
    });
    res.on('close', () => {
      cleanup();
    });
  }

  private async createZipFile(
    projectId: string,
    appName: string,
    zipFilePath: string,
    userId: string,
  ): Promise<void> {
    // Endpoint: POST /api/projects/download  (project_id goes in the BODY, not the path)
    // This matches the Python backend contract used by DownloadService.createDownload().
    const downloadEndpoint = `${this.projectApiUrl}/api/projects/download`;

    this.logger.log(
      `Requesting ZIP download from: ${downloadEndpoint} for project ${projectId}`,
    );

    try {
      const response = await fetch(downloadEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          project_id: projectId,
          use_defaults: true, // apply standard exclusions (node_modules, .git, etc.)
          source_path: null, // zip the entire project
          zip_name: null, // let the Python backend name it
          exclude_patterns: null,
          url_expiration: null, // use default presigned-URL TTL
        }),
        signal: (global as any).AbortSignal?.timeout
          ? (global as any).AbortSignal.timeout(60000)
          : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `ZIP creation API failed with status ${response.status}: ${errorText}`,
        );
      }

      const downloadData = await response.json();

      if (!downloadData.success || !downloadData.download_url) {
        throw new Error(
          `Invalid response from ZIP API: ${JSON.stringify(downloadData)}`,
        );
      }

      this.logger.log(
        `ZIP created successfully: ${downloadData.filename} (${downloadData.size_mb ?? '?'} MB)`,
      );

      const downloadResponse = await fetch(downloadData.download_url, {
        method: 'GET',
        headers: {
          Accept: 'application/zip, application/octet-stream, */*',
        },
        redirect: 'follow',
        signal: (global as any).AbortSignal?.timeout
          ? (global as any).AbortSignal.timeout(120000)
          : undefined,
      });

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        throw new Error(
          `Failed to download ZIP file: ${downloadResponse.status} ${downloadResponse.statusText} - ${errorText}`,
        );
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        throw new Error('Downloaded ZIP file is empty');
      }

      // Sanity-check: first two bytes of a ZIP archive must be 0x50 0x4B ("PK")
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        throw new Error(
          `Downloaded file is not a valid ZIP archive (bad magic bytes: 0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)})`,
        );
      }

      fs.writeFileSync(zipFilePath, buffer);
      this.logger.log(
        `ZIP file saved successfully: ${zipFilePath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
      );
    } catch (error) {
      this.logger.error(`Failed to create/download ZIP file: ${error.message}`);
      throw new Error(`ZIP file creation failed: ${error.message}`);
    }
  }

  private extractZipFile(zipFilePath: string, unzipDir: string) {
    if (fs.existsSync(unzipDir)) {
      fs.rmSync(unzipDir, { recursive: true, force: true });
    }
    fs.mkdirSync(unzipDir, { recursive: true });

    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(unzipDir, true);

    const items = fs.readdirSync(unzipDir);
    if (
      items.length === 1 &&
      fs.statSync(path.join(unzipDir, items[0])).isDirectory()
    ) {
      const nestedDir = path.join(unzipDir, items[0]);
      const nestedItems = fs.readdirSync(nestedDir);
      nestedItems.forEach((item) => {
        fs.renameSync(path.join(nestedDir, item), path.join(unzipDir, item));
      });
      fs.rmdirSync(nestedDir);
    }

    this.logger.log(`Zip extracted successfully to: ${unzipDir}`);
  }

  private ensurePackageJson(frontendDir: string) {
    const frontendPkg = path.join(frontendDir, 'package.json');
    if (!fs.existsSync(frontendPkg)) {
      // Fallback package.json uses react-scripts (CRA) so `npm run build` outputs
      // to the `build/` directory — consistent with the deploy run_command
      // `npx serve -s build -l 3000` used in deployKoyebService().
      const pkg = {
        name: 'frontend',
        version: '0.1.0',
        private: true,
        scripts: {
          start: 'react-scripts start',
          build: 'react-scripts build',
          test: 'react-scripts test',
          eject: 'react-scripts eject',
        },
        dependencies: {
          react: '^18',
          'react-dom': '^18',
          'react-scripts': '5.0.1',
        },
        engines: { node: '>=18.0.0' },
        browserslist: {
          production: ['>0.2%', 'not dead', 'not op_mini all'],
          development: [
            'last 1 chrome version',
            'last 1 firefox version',
            'last 1 safari version',
          ],
        },
      };
      fs.writeFileSync(frontendPkg, JSON.stringify(pkg, null, 2));
      this.logger.warn(
        `No package.json found in frontend dir — wrote CRA fallback. ` +
          `This may indicate an issue with the generated project ZIP.`,
      );
    }
  }

  private pushToGitHub(unzipDir: string, tokenRepoUrl: string) {
    if (fs.existsSync(path.join(unzipDir, '.git'))) {
      fs.rmSync(path.join(unzipDir, '.git'), {
        recursive: true,
        force: true,
      });
    }

    execSync('git init', { cwd: unzipDir });

    // Configure git identity (required for commits in Docker containers)
    execSync('git config user.email "deploy-bot@koyeb.com"', {
      cwd: unzipDir,
    });
    execSync('git config user.name "Koyeb Deploy Bot"', { cwd: unzipDir });

    execSync('git add .', { cwd: unzipDir });
    execSync('git commit -m "Initial commit"', { cwd: unzipDir });
    execSync('git branch -M main', { cwd: unzipDir });
    execSync(`git remote add origin ${tokenRepoUrl}`, { cwd: unzipDir });
    execSync('git push -u origin main', { cwd: unzipDir });

    this.logger.log('Code pushed to GitHub');
  }

  private async deployKoyebService(
    appName: string,
    serviceName: string,
    repository: string,
    workdir: string,
    port: number,
    runCommand: string | undefined,
    envVars: Record<string, string>,
    buildCommand?: string,
    builder: 'buildpack' | 'docker' = 'buildpack',
  ): Promise<{ url: string; appId: string } | null> {
    let appData: any;

    // Try to create the Koyeb app
    const appRes = await fetch(`${this.koyebApiBaseUrl}/apps`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.koyebApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: appName }),
    });

    appData = await appRes.json();

    // If the app name already exists (e.g. from a previous failed attempt),
    // delete it and recreate so we get a clean deployment.
    if (appRes.status === 400 && appData?.message?.includes('already exists')) {
      this.logger.warn(
        `Koyeb app "${appName}" already exists — deleting and recreating...`,
      );

      // List apps to find the existing app ID
      try {
        const listRes = await fetch(
          `${this.koyebApiBaseUrl}/apps?name=${encodeURIComponent(appName)}&limit=1`,
          {
            headers: {
              Authorization: `Bearer ${this.koyebApiToken}`,
            },
          },
        );
        const listData = await listRes.json();
        const existingAppId = listData?.apps?.[0]?.id;

        if (existingAppId) {
          const deleteRes = await fetch(
            `${this.koyebApiBaseUrl}/apps/${existingAppId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${this.koyebApiToken}`,
              },
            },
          );

          if (deleteRes.ok) {
            this.logger.log(`Deleted existing Koyeb app: ${appName}`);
          } else {
            this.logger.warn(
              `Failed to delete existing Koyeb app: ${deleteRes.status} ${deleteRes.statusText}`,
            );
          }

          // Wait for deletion to propagate
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      } catch (deleteErr) {
        this.logger.warn(
          `Error deleting existing Koyeb app: ${deleteErr.message}`,
        );
      }

      // Retry app creation
      const retryRes = await fetch(`${this.koyebApiBaseUrl}/apps`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.koyebApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: appName }),
      });

      appData = await retryRes.json();
    }

    if (!appData.app?.id) {
      throw new Error(`Failed to create app: ${JSON.stringify(appData)}`);
    }

    const appId = appData.app.id;

    // Build the git config based on the builder type.
    // The Koyeb REST API uses nested objects to select the builder:
    //   - git.docker: { dockerfile: "Dockerfile" }   → Docker build
    //   - git.buildpack: { build_command, run_command } → Buildpack build
    // A flat "builder" field does NOT work in the REST API.
    const gitConfig: Record<string, any> = {
      repository,
      branch: 'main',
      workdir,
    };

    if (builder === 'docker') {
      // Tell Koyeb to use the Dockerfile found in the workdir
      gitConfig.docker = { dockerfile: 'Dockerfile' };
    } else {
      // Buildpack: pass build/run commands inside the buildpack object
      const buildpackConfig: Record<string, any> = {};
      if (buildCommand) buildpackConfig.build_command = buildCommand;
      if (runCommand) buildpackConfig.run_command = runCommand;
      gitConfig.buildpack = buildpackConfig;
    }

    const serviceReq = {
      app_id: appId,
      definition: {
        name: serviceName,
        regions: ['was'],
        git: gitConfig,
        instance_types: [{ type: 'nano' }],
        routes: [{ path: '/', port }],
        ports: [{ port, protocol: 'http' }],
        scalings: [{ min: 1, max: 1 }],
        env: this.buildEnvArray(envVars),
      },
    };

    const serviceRes = await fetch(`${this.koyebApiBaseUrl}/services`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.koyebApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serviceReq),
    });

    const serviceData = await serviceRes.json();
    if (!serviceRes.ok || !serviceData.service?.id) {
      throw new Error(
        `Failed to create service: ${JSON.stringify(serviceData)}`,
      );
    }

    this.logger.log(`Service created, waiting for health check...`);

    const url = await this.waitForHealthy(appName, serviceName);
    if (!url) return null;

    return { url, appId };
  }

  private async waitForHealthy(
    appName: string,
    serviceName: string,
    maxAttempts = 40,
    intervalSec = 15,
  ): Promise<string | null> {
    this.logger.log(`Waiting for ${serviceName} to become HEALTHY...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const raw = execSync(
          `koyeb service get ${appName}/${serviceName} --output json --token ${this.koyebApiToken}`,
          { encoding: 'utf-8' },
        );

        const serviceInfo = JSON.parse(raw);
        const status = (serviceInfo.status || '').toUpperCase() || 'UNKNOWN';

        this.logger.log(
          `[Attempt ${attempt}/${maxAttempts}] ${serviceName} status: ${status}`,
        );

        if (status === 'HEALTHY') {
          this.logger.log(`${serviceName} is HEALTHY`);

          const appRaw = execSync(
            `koyeb app get ${appName} --token ${this.koyebApiToken}`,
            { encoding: 'utf-8' },
          );

          const appLines = appRaw.trim().split('\n');
          let domainUrl: string | null = null;

          for (let i = 0; i < appLines.length; i++) {
            const line = appLines[i];
            if (line.includes('STATUS') && line.includes('DOMAINS')) continue;
            if (!line.trim()) continue;

            const match =
              line.match(/\["([^"]+)"\]/) ||
              line.match(/([a-zA-Z0-9\-]+\.koyeb\.app)/);

            if (match && (match[1] || match[0])) {
              const domain = match[1] || match[0];
              domainUrl = `https://${domain}`;
              break;
            }
          }

          return domainUrl || `https://${serviceName}-${appName}.koyeb.app`;
        } else if (['UNHEALTHY', 'ERROR'].includes(status)) {
          this.logger.error(
            `${serviceName} deployment failed with status: ${status}`,
          );
          return null;
        }
      } catch (err) {
        this.logger.error(`Error checking status: ${err?.message || err}`);
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
      }
    }

    this.logger.error(
      `${serviceName} did not become HEALTHY after ${maxAttempts} attempts`,
    );
    return null;
  }

  private formatRepoForKoyeb(cloneUrl: string): string {
    // Strip protocol prefix and trailing .git suffix (anchored to end of string)
    return cloneUrl.replace('https://', '').replace(/\.git$/, '');
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private buildEnvArray(
    envVars: Record<string, string>,
  ): Array<{ key: string; value: string }> {
    if (!envVars || typeof envVars !== 'object') return [];
    return Object.entries(envVars).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }

  private async captureAndStoreScreenshot(
    url: string,
    projectId: string,
    appName: string,
    retries = 3,
  ): Promise<string | undefined> {
    // Skip entirely if no API key is configured (avoids 3 failing API calls per deployment)
    if (!this.pagespeedApiKey) {
      this.logger.debug(
        'Skipping screenshot — GOOGLE_PAGESPEED_API_KEY is not set',
      );
      return undefined;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.logger.debug(
          `Screenshot capture attempt ${attempt}/${retries} for: ${url}`,
        );

        const pagespeedUrl = `${this.pagespeedApiUrl}?url=${encodeURIComponent(url)}&key=${this.pagespeedApiKey}&strategy=desktop`;

        const response = await fetch(pagespeedUrl);

        if (response.status === 403) {
          this.logger.error(
            `PageSpeed API 403 - API key may be invalid or rate limited`,
          );
          return undefined;
        }

        if (response.status === 429) {
          this.logger.warn(
            `PageSpeed API rate limit hit (429), waiting before retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        if (!response.ok) {
          this.logger.warn(
            `PageSpeed API failed for ${url}: ${response.status}`,
          );
          const errorBody = await response.text();
          this.logger.debug(`Error response: ${errorBody}`);
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          return undefined;
        }

        const data = await response.json();
        const screenshotData =
          data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;

        if (!screenshotData) {
          this.logger.warn(`No screenshot data available for ${url}`);
          return undefined;
        }

        const base64Data = screenshotData.replace(
          /^data:image\/[a-z]+;base64,/,
          '',
        );
        const fileKey = `deployments/screenshots/${projectId}-${Date.now()}.jpg`;

        await this.s3Service.uploadFromBase64(
          fileKey,
          base64Data,
          'image/jpeg',
          `${appName}-screenshot.jpg`,
        );

        const publicUrl = this.s3Service.getPublicUrl(fileKey);
        this.logger.log(`Screenshot captured and stored: ${publicUrl}`);

        return publicUrl;
      } catch (error) {
        this.logger.error(
          `Screenshot capture error (attempt ${attempt}/${retries}): ${error?.message || error}`,
        );
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    this.logger.error(`Failed to capture screenshot after ${retries} attempts`);
    return undefined;
  }

  async getDeploymentStatus(deploymentId: string, requestingUserId: string) {
    try {
      this.logger.log(`Fetching status for deployment: ${deploymentId}`);

      const deployment = await this.prisma.deployment.findUnique({
        where: { id: deploymentId },
      });

      if (!deployment) {
        throw new NotFoundException(
          `Deployment with ID ${deploymentId} not found`,
        );
      }

      if (deployment.userId !== requestingUserId) {
        throw new UnauthorizedException(
          'You are not authorized to view this deployment',
        );
      }

      let progress = 0;
      let message = '';
      let hasError = false;
      let isComplete = false;
      let step = '';

      if (deployment.status === 'PROCESSING') {
        try {
          const job = await this.deployQueue.getJob(`deploy-${deploymentId}`);
          if (job) {
            const state = await job.getState();
            this.logger.log(
              `Job state for deployment ${deploymentId}: ${state}`,
            );

            const jobProgress = await job.progress();
            progress = typeof jobProgress === 'number' ? jobProgress : 10;

            if (progress < 15) step = 'Creating project bundle...';
            else if (progress < 25) step = 'Extracting files...';
            else if (progress < 40) step = 'Setting up GitHub repository...';
            else if (progress < 60) step = 'Deploying backend service...';
            else if (progress < 85) step = 'Deploying frontend application...';
            else if (progress < 100) step = 'Capturing screenshot...';
            else step = 'Finalizing deployment...';
          } else {
            this.logger.warn(
              `Job not found for deployment ${deploymentId}, using database status`,
            );
            progress = 10;
            step = 'Processing deployment...';
          }
        } catch (jobError) {
          this.logger.warn(
            `Could not fetch job for deployment ${deploymentId}: ${jobError.message}`,
          );
          progress = 10;
          step = 'Processing deployment...';
        }
      }

      switch (deployment.status) {
        case 'PROCESSING':
          progress = progress || 10;
          message = step || 'Deployment is in progress.';
          break;
        case 'ACTIVE':
          progress = 100;
          message = 'Deployment is active and healthy.';
          isComplete = true;
          break;
        case 'FAILED':
          progress = 0;
          message = 'Deployment failed';
          hasError = true;
          isComplete = true;
          break;
        case 'PAUSED':
          progress = 0;
          message = 'Deployment paused';
          break;
        case 'DELETED':
          progress = 0;
          message = 'Deployment deleted';
          isComplete = true;
          break;
        default:
          progress = 0;
          message = 'Unknown status';
      }

      return {
        id: deployment.id,
        projectId: deployment.projectId,
        status: deployment.status,
        progress,
        message,
        isComplete,
        hasError,
        backendUrl: deployment.backendUrl || null,
        frontendUrl: deployment.frontendUrl || null,
        githubRepoUrl: deployment.githubRepoUrl || null,
        screenshotUrl: deployment.screenshotUrl || null,
        visibility: deployment.visibility,
        projectType: deployment.projectType,
        backendAppName: deployment.backendAppName,
        frontendAppName: deployment.frontendAppName,
        customDomain: deployment.customDomain || null,
        customDomainCname: deployment.customDomainCname || null,
        domainStatus: deployment.domainStatus || null,
        saascdDomainUuid: deployment.saascdDomainUuid || null,
        saascdUpstreamUuid: deployment.saascdUpstreamUuid || null,
        domains: deployment.frontendUrl
          ? {
              frontend: this.extractDomainFromUrl(deployment.frontendUrl),
            }
          : null,
        createdAt: deployment.createdAt,
        deployedAt: deployment.deployedAt,
        updatedAt: deployment.updatedAt,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      this.logger.error(`Error fetching deployment status: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to fetch deployment status: ${error.message}`,
      );
    }
  }

  async getUserDeployments(userId: string) {
    try {
      this.logger.log(`Fetching deployments for user: ${userId}`);

      const deployments = await this.prisma.deployment.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          projectId: true,
          backendUrl: true,
          frontendUrl: true,
          githubRepoUrl: true,
          visibility: true,
          projectType: true,
          status: true,
          createdAt: true,
          deployedAt: true,
          screenshotUrl: true,
          customDomain: true,
          customDomainCname: true,
          domainStatus: true,
          saascdDomainUuid: true,
          saascdUpstreamUuid: true,
        },
      });

      this.logger.log(
        `Found ${deployments.length} deployments for user ${userId}`,
      );

      const deploymentsWithScreenshots = await Promise.all(
        deployments.map(async (deployment) => {
          let screenshotUrl = deployment.screenshotUrl;

          if (
            !screenshotUrl &&
            deployment.frontendUrl &&
            deployment.status === 'ACTIVE'
          ) {
            this.logger.log(
              `Capturing missing screenshot for deployment ${deployment.id}`,
            );
            screenshotUrl =
              (await this.captureAndStoreScreenshot(
                deployment.frontendUrl,
                deployment.projectId,
                `deployment-${deployment.id}`,
              )) || '';

            if (screenshotUrl) {
              await this.prisma.deployment.update({
                where: { id: deployment.id },
                data: { screenshotUrl },
              });
            }
          }

          return {
            id: deployment.id,
            projectId: deployment.projectId,
            backendUrl: deployment.backendUrl,
            frontendUrl: deployment.frontendUrl,
            githubRepoUrl: deployment.githubRepoUrl,
            visibility: deployment.visibility,
            projectType: deployment.projectType,
            status: deployment.status,
            createdAt: deployment.createdAt,
            deployedAt: deployment.deployedAt,
            screenshotUrl,
            customDomain: deployment.customDomain || null,
            customDomainCname: deployment.customDomainCname || null,
            domainStatus: deployment.domainStatus || null,
            saascdDomainUuid: deployment.saascdDomainUuid || null,
            saascdUpstreamUuid: deployment.saascdUpstreamUuid || null,
            domains: {
              frontend: deployment.frontendUrl
                ? this.extractDomainFromUrl(deployment.frontendUrl)
                : '',
            },
          };
        }),
      );

      return {
        userId,
        totalDeployments: deploymentsWithScreenshots.length,
        deployments: deploymentsWithScreenshots,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching deployments for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        `Failed to fetch deployments: ${error.message}`,
      );
    }
  }

  /**
   * Helper to make authenticated requests to SaaS Custom Domains API.
   * Path should start with / and will be appended after /accounts/:uuid
   */
  private async saascdFetch(
    path: string,
    method: string,
    body?: any,
  ): Promise<globalThis.Response> {
    if (!this.saascdApiToken || !this.saascdAccountUuid) {
      throw new Error(
        'SaaS Custom Domains credentials not configured. Set SAAS_CD_API_TOKEN and SAAS_CD_ACCOUNT_UUID environment variables.',
      );
    }
    const url = `${this.saascdApiBaseUrl}/accounts/${this.saascdAccountUuid}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.saascdApiToken}`,
        'Content-Type': 'application/json',
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    return res;
  }

  /**
   * Attach a custom domain via SaaS Custom Domains.
   * 1. Create an upstream pointing to the Koyeb frontend URL
   * 2. Create a custom domain on that upstream
   * 3. Store both UUIDs in the deployment record
   */
  private async attachCustomDomain(
    frontendUrl: string,
    customDomain: string,
    deploymentId: string,
  ): Promise<{
    upstreamUuid: string;
    domainUuid: string;
    cnameTarget: string;
  }> {
    // Extract hostname from the Koyeb frontend URL (e.g., "myapp.koyeb.app")
    const upstreamHost = new URL(frontendUrl).hostname;

    // Step 1: Create upstream pointing to the Koyeb app
    this.logger.log(`Creating SaaS CD upstream for host: ${upstreamHost}`);
    const upstreamRes = await this.saascdFetch('/upstreams', 'POST', {
      host: upstreamHost,
      port: 443,
      tls: true,
      compression_enabled: true,
      geocoding_enabled: false,
    });

    const upstreamData = await upstreamRes.json();

    if (!upstreamRes.ok || !upstreamData.uuid) {
      throw new Error(
        `Failed to create SaaS CD upstream: ${JSON.stringify(upstreamData)}`,
      );
    }

    const upstreamUuid = upstreamData.uuid;
    this.logger.log(
      `SaaS CD upstream created: ${upstreamUuid} → ${upstreamHost}`,
    );

    // Step 2: Create custom domain on the upstream
    this.logger.log(
      `Creating SaaS CD custom domain: ${customDomain} on upstream ${upstreamUuid}`,
    );
    const domainRes = await this.saascdFetch(
      `/upstreams/${upstreamUuid}/custom_domains`,
      'POST',
      {
        host: customDomain,
        challenge_type: 'http01',
        redirect_to_www: false,
      },
    );

    const domainData = await domainRes.json();

    if (!domainRes.ok || !domainData.uuid) {
      // Clean up the upstream if domain creation fails
      this.logger.error(
        `Failed to create domain, cleaning up upstream ${upstreamUuid}`,
      );
      await this.saascdFetch(`/upstreams/${upstreamUuid}`, 'DELETE').catch(
        () => {},
      );
      throw new Error(
        `Failed to create SaaS CD custom domain: ${JSON.stringify(domainData)}`,
      );
    }

    const domainUuid = domainData.uuid;
    const cnameTarget = 'in.saascustomdomains.com';

    this.logger.log(
      `SaaS CD custom domain created: ${customDomain} → CNAME: ${cnameTarget} (domain: ${domainUuid}, upstream: ${upstreamUuid})`,
    );

    // Step 3: Update deployment record with SaaS CD identifiers
    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        saascdUpstreamUuid: upstreamUuid,
        saascdDomainUuid: domainUuid,
        customDomainCname: cnameTarget,
        domainStatus: 'PENDING',
      },
    });

    return { upstreamUuid, domainUuid, cnameTarget };
  }

  /**
   * Fully tears down a deployment:
   *   1. Deletes the SaaS Custom Domains upstream (cascades to all domains on it)
   *   2. Deletes the Koyeb frontend application (stops hosting)
   *   3. Deletes the GitHub repository (cleanup)
   *   4. Marks the deployment as DELETED in the database (preserved for user history)
   *
   * Custom domain is mandatory for every deployment, so deleting the domain
   * is equivalent to deleting the entire deployment.
   */
  async deleteDeployment(
    deploymentId: string,
    requestingUserId: string,
  ): Promise<{ message: string }> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
    });

    if (!deployment) {
      throw new NotFoundException(
        `Deployment with ID ${deploymentId} not found`,
      );
    }

    if (deployment.userId !== requestingUserId) {
      throw new UnauthorizedException(
        'You are not authorized to manage this deployment',
      );
    }

    this.logger.log(
      `Deleting deployment ${deploymentId} — tearing down all resources`,
    );

    // 1. Delete SaaS Custom Domains upstream (cascades to all custom domains on it)
    if (deployment.saascdUpstreamUuid) {
      try {
        const deleteRes = await this.saascdFetch(
          `/upstreams/${deployment.saascdUpstreamUuid}`,
          'DELETE',
        );
        if (deleteRes.ok || deleteRes.status === 404) {
          this.logger.log(
            `SaaS CD upstream ${deployment.saascdUpstreamUuid} deleted`,
          );
        } else {
          const errBody = await deleteRes.text().catch(() => '');
          this.logger.warn(
            `SaaS CD upstream delete failed: ${deleteRes.status} ${errBody}`,
          );
        }
      } catch (err) {
        this.logger.warn(`SaaS CD upstream delete error: ${err.message}`);
      }
    }

    // 2. Delete the Koyeb frontend application (stops the running service)
    if (deployment.frontendAppName) {
      try {
        execSync(
          `koyeb apps delete ${deployment.frontendAppName} --token ${this.koyebApiToken}`,
          { encoding: 'utf-8' },
        );
        this.logger.log(`Koyeb app ${deployment.frontendAppName} deleted`);
      } catch (err) {
        this.logger.warn(
          `Failed to delete Koyeb app ${deployment.frontendAppName}: ${err.message}`,
        );
      }
    }

    // 3. Delete the GitHub repository (cleanup source code)
    if (deployment.githubRepoUrl) {
      try {
        const octokit = new Octokit({ auth: this.githubToken });
        // Extract owner/repo from URL like "https://github.com/owner/repo"
        const urlParts = deployment.githubRepoUrl
          .replace(/\.git$/, '')
          .split('/');
        const repo = urlParts.pop();
        const owner = urlParts.pop();
        if (owner && repo) {
          await octokit.request('DELETE /repos/{owner}/{repo}', {
            owner,
            repo,
          });
          this.logger.log(`GitHub repo ${owner}/${repo} deleted`);
        }
      } catch (err) {
        this.logger.warn(`Failed to delete GitHub repo: ${err.message}`);
      }
    }

    // 4. Mark deployment as DELETED in the database (preserves record for user history)
    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'DELETED',
        customDomain: null,
        customDomainCname: null,
        domainStatus: null,
        saascdUpstreamUuid: null,
        saascdDomainUuid: null,
      },
    });

    // 5. Invalidate community showcase cache (deployment may have been public)
    if (deployment.visibility === 'pb') {
      try {
        await this.showcaseService.invalidateCache();
        this.logger.log(
          'Community showcase cache invalidated after deployment deletion',
        );
      } catch (err) {
        this.logger.warn(`Failed to invalidate showcase cache: ${err.message}`);
      }
    }

    this.logger.log(
      `Deployment ${deploymentId} fully deleted (SaaS CD + Koyeb + GitHub + DB marked DELETED)`,
    );

    return { message: 'Deployment deleted successfully' };
  }

  async verifyCustomDomain(
    deploymentId: string,
    requestingUserId: string,
  ): Promise<{
    domain: string;
    status: string;
    verified: boolean;
    cnameTarget: string;
    instructions: string;
  }> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
    });

    if (!deployment) {
      throw new NotFoundException(
        `Deployment with ID ${deploymentId} not found`,
      );
    }

    if (deployment.userId !== requestingUserId) {
      throw new UnauthorizedException(
        'You are not authorized to manage this deployment',
      );
    }

    if (
      !deployment.customDomain ||
      !deployment.saascdDomainUuid ||
      !deployment.saascdUpstreamUuid
    ) {
      throw new BadRequestException(
        'No custom domain is configured for this deployment',
      );
    }

    // Call SaaS Custom Domains verify_dns_records endpoint
    const verifyRes = await this.saascdFetch(
      `/upstreams/${deployment.saascdUpstreamUuid}/custom_domains/${deployment.saascdDomainUuid}/verify_dns_records`,
      'POST',
    );

    if (!verifyRes.ok) {
      const errorData = await verifyRes.json().catch(() => ({}));
      this.logger.error(
        `SaaS CD DNS verification failed: ${JSON.stringify(errorData)}`,
      );
      throw new InternalServerErrorException(
        `Failed to verify domain: ${(errorData as any).message || verifyRes.statusText}`,
      );
    }

    const verifyData = await verifyRes.json();
    const dnsStatus = (verifyData as any).dns_status || 'pending';

    // Map SaaS CD dns_status to our internal statuses
    // dns_status: "valid" | "pending" | "invalid"
    let mappedStatus: string;
    let verified = false;
    switch (dnsStatus) {
      case 'valid':
        mappedStatus = 'ACTIVE';
        verified = true;
        break;
      case 'invalid':
        // DNS record exists but points to wrong target, or propagation failed
        mappedStatus = 'FAILED_DNS';
        break;
      case 'pending':
        // SaaS CD is still checking, no action needed yet
        mappedStatus = 'PENDING';
        break;
      default:
        // Unexpected status — log it and treat as still pending
        this.logger.warn(
          `Unexpected SaaS CD dns_status: "${dnsStatus}" for deployment ${deploymentId}`,
        );
        mappedStatus = 'PENDING';
    }

    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: { domainStatus: mappedStatus },
    });

    const cnameTarget = 'in.saascustomdomains.com';
    const instructions = verified
      ? `Your custom domain "${deployment.customDomain}" is active and serving traffic with TLS.`
      : mappedStatus === 'FAILED_DNS'
        ? `DNS verification failed for "${deployment.customDomain}". Ensure your CNAME record points to "${cnameTarget}" and has fully propagated, then verify again.`
        : `Add a CNAME record pointing "${deployment.customDomain}" to "${cnameTarget}" at your DNS provider, then verify again.`;

    return {
      domain: deployment.customDomain,
      status: mappedStatus,
      verified,
      cnameTarget,
      instructions,
    };
  }

  async getCustomDomainStatus(
    deploymentId: string,
    requestingUserId: string,
  ): Promise<{
    customDomain: string | null;
    customDomainCname: string | null;
    domainStatus: string | null;
    saascdDomainUuid: string | null;
    saascdUpstreamUuid: string | null;
    frontendUrl: string | null;
  }> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        userId: true,
        customDomain: true,
        customDomainCname: true,
        domainStatus: true,
        saascdDomainUuid: true,
        saascdUpstreamUuid: true,
        frontendUrl: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(
        `Deployment with ID ${deploymentId} not found`,
      );
    }

    if (deployment.userId !== requestingUserId) {
      throw new UnauthorizedException(
        'You are not authorized to view this deployment',
      );
    }

    return {
      customDomain: deployment.customDomain || null,
      customDomainCname: deployment.customDomainCname || null,
      domainStatus: deployment.domainStatus || null,
      saascdDomainUuid: deployment.saascdDomainUuid || null,
      saascdUpstreamUuid: deployment.saascdUpstreamUuid || null,
      frontendUrl: deployment.frontendUrl || null,
    };
  }

  private extractDomainFromUrl(url: string): string | null {
    if (!url) return null;
    try {
      const hostname = new URL(url).hostname;
      return hostname;
    } catch (e) {
      this.logger.warn(`Could not parse URL to extract domain: ${url}`);
      return null;
    }
  }
}
