import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreditService } from './credit.service';

interface E2bWebhook {
  id: string;
  teamID: string;
  name: string;
  createdAt: string;
  enabled: boolean;
  url: string;
  events: string[];
  signatureSecret?: string;
}

interface E2bWebhookPayload {
  version: string;
  id: string;
  type: string;
  event_data: {
    sandbox_metadata?: {
      project_id?: string;
      user_id?: string;
      created_at?: string;
      restore_session?: string;
      [key: string]: any;
    };
  };
  sandboxBuildId: string;
  sandboxExecutionId: string;
  sandboxId: string;
  sandboxTeamId: string;
  sandboxTemplateId: string;
  timestamp: string;
  event_category?: string;
  event_label?: string;
  sandbox_id?: string;
  sandbox_execution_id?: string;
  sandbox_template_id?: string;
  sandbox_build_id?: string;
  sandbox_team_id?: string;
}

interface E2bLifecycleEvent {
  version: string;
  id: string;
  type: string;
  eventData?: any;
  sandboxBuildId: string;
  sandboxExecutionId: string;
  sandboxId: string;
  sandboxTeamId: string;
  sandboxTemplateId: string;
  timestamp: string;
}

@Injectable()
export class E2bWebhookService implements OnModuleInit {
  private readonly logger = new Logger(E2bWebhookService.name);
  private readonly e2bApiKey: string;
  private readonly selfDomain: string;
  private readonly webhookSecret: string;
  private readonly e2bApiBaseUrl = 'https://api.e2b.app';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
  ) {
    this.e2bApiKey = this.configService.getOrThrow<string>('E2B_API_KEY');
    this.selfDomain = this.configService.getOrThrow<string>('SELF_DOMAIN', '');
    this.webhookSecret =
      this.configService.getOrThrow<string>('E2B_WEBHOOK_SECRET');

    if (!this.e2bApiKey) {
      this.logger.warn('E2B_API_KEY not found in environment variables');
    }
  }

  /**
   * Called when the module is initialized
   * Register webhooks if they don't already exist
   */
  async onModuleInit() {
    if (!this.e2bApiKey) {
      this.logger.warn('Skipping E2B webhook registration - no API key');
      return;
    }

    try {
      await this.registerWebhooksIfNeeded();
    } catch (error) {
      this.logger.error(
        `Failed to register E2B webhooks: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Register webhooks if they don't exist for this domain
   */
  async registerWebhooksIfNeeded(): Promise<void> {
    // Skip webhook registration if self domain is not configured
    if (!this.selfDomain || this.selfDomain.trim() === '') {
      this.logger.warn(
        'Skipping E2B webhook registration - SELF_DOMAIN is not configured',
      );
      return;
    }

    this.logger.log('Checking E2B webhook registration...');

    try {
      // List existing webhooks
      const existingWebhooks = await this.listWebhooks();

      // Check if webhook already exists for this domain
      const webhookUrl = `${this.selfDomain}/webhooks/e2b`;
      const existingWebhook = existingWebhooks.find(
        (wh) => wh.url === webhookUrl,
      );

      if (existingWebhook) {
        this.logger.log(
          `E2B webhook already registered for ${webhookUrl} (ID: ${existingWebhook.id})`,
        );
        return;
      }

      // Register new webhook
      this.logger.log(`Registering new E2B webhook for ${webhookUrl}`);
      await this.registerWebhook();

      this.logger.log('E2B webhook registered successfully');
    } catch (error) {
      this.logger.error(
        `Error checking/registering webhooks: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * List all registered webhooks
   */
  async listWebhooks(): Promise<E2bWebhook[]> {
    const url = `${this.e2bApiBaseUrl}/events/webhooks`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'X-API-Key': this.e2bApiKey,
          },
        }),
      );

      return response.data || [];
    } catch (error) {
      this.logger.error(
        `Error listing webhooks: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Register a new webhook
   */
  async registerWebhook(): Promise<E2bWebhook> {
    const url = `${this.e2bApiBaseUrl}/events/webhooks`;
    const webhookUrl = `${this.selfDomain}/webhooks/e2b`;

    const payload = {
      name: 'Meme Coin Game Development Sandbox Events',
      url: webhookUrl,
      enabled: true,
      events: [
        'sandbox.lifecycle.created',
        'sandbox.lifecycle.updated',
        'sandbox.lifecycle.paused',
        'sandbox.lifecycle.resumed',
      ],
      signatureSecret: this.webhookSecret,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'X-API-Key': this.e2bApiKey,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(`Webhook registered: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error registering webhook: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const expectedSignatureRaw = crypto
        .createHash('sha256')
        .update(this.webhookSecret + payload)
        .digest('base64');

      const expectedSignature = expectedSignatureRaw
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const givenSignature = signature
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      return expectedSignature === givenSignature;
    } catch (error) {
      this.logger.error(
        `Error verifying signature: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Get lifecycle events for a specific sandbox from E2B API
   */
  async getSandboxLifecycleEvents(
    sandboxId: string,
  ): Promise<E2bLifecycleEvent[]> {
    const url = `${this.e2bApiBaseUrl}/events/sandboxes/${sandboxId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'X-API-Key': this.e2bApiKey,
          },
        }),
      );

      return response.data || [];
    } catch (error) {
      this.logger.error(
        `Error fetching lifecycle events for sandbox ${sandboxId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Calculate session duration in seconds between two events
   * Returns the duration between the start event and the pause event
   */
  private calculateSessionDuration(
    startTimestamp: string,
    pauseTimestamp: string,
  ): number {
    try {
      const startTime = new Date(startTimestamp).getTime();
      const pauseTime = new Date(pauseTimestamp).getTime();

      if (isNaN(startTime) || isNaN(pauseTime)) {
        this.logger.error(
          `Invalid timestamps: start=${startTimestamp}, pause=${pauseTimestamp}`,
        );
        return 0;
      }

      const durationMs = pauseTime - startTime;
      const durationSeconds = Math.floor(durationMs / 1000);

      // Ensure non-negative duration
      return Math.max(0, durationSeconds);
    } catch (error) {
      this.logger.error(
        `Error calculating duration: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Calculate the cost in dollars for sandbox usage
   * Based on E2B pricing:
   * - RAM: $0.0000045/GiB/s (for 2 GiB = 2GB)
   * - vCPUs: $0.000028/s (for 2 cores)
   *
   * @param durationSeconds - Duration of sandbox usage in seconds
   * @returns Cost in dollars (USD)
   */
  private calculateSandboxCost(durationSeconds: number): number {
    if (durationSeconds <= 0) {
      return 0;
    }

    // E2B pricing constants
    const RAM_COST_PER_GIB_PER_SECOND = 0.0000045; // $0.0000045/GiB/s
    const VCPU_COST_PER_SECOND = 0.000028; // $0.000028/s for 2 vCPUs

    // Our configuration
    const RAM_IN_GIB = 2; // 2 GB = 2 GiB

    // Calculate costs
    const ramCost = RAM_COST_PER_GIB_PER_SECOND * RAM_IN_GIB * durationSeconds;
    const cpuCost = VCPU_COST_PER_SECOND * durationSeconds;

    // Total cost
    const totalCost = ramCost + cpuCost;

    return totalCost;
  }

  /**
   * Convert dollar amount to credits
   * Uses CREDITS_PER_DOLLAR from environment configuration
   *
   * @param dollars - Cost in USD
   * @returns Number of credits (rounded up)
   */
  private convertDollarsToCredits(dollars: number): number {
    if (dollars <= 0) {
      return 0;
    }

    const CREDITS_PER_DOLLAR = this.configService.get<number>(
      'CREDITS_PER_DOLLAR',
      200,
    );

    // Round up to ensure we never undercharge
    return Math.ceil(dollars * CREDITS_PER_DOLLAR);
  }

  /**
   * Process sandbox usage charge for a user
   * Deducts credits based on sandbox session duration
   *
   * @param userId - User ID
   * @param projectId - Project ID
   * @param sandboxId - Sandbox ID
   * @param durationSeconds - Session duration in seconds
   * @param costInDollars - Cost in USD
   */
  async processSandboxCharge(
    userId: string,
    projectId: string,
    sandboxId: string,
    durationSeconds: number,
    creditsToDeduct: number,
  ): Promise<void> {
    try {
      // Convert dollars to credits

      if (creditsToDeduct === 0) {
        this.logger.log('No credits to deduct (duration too short)');
        return;
      }

      this.logger.log(
        `Processing sandbox charge: ${creditsToDeduct} credits for user ${userId}`,
      );

      await this.creditService.processSandboxCharge({
        userId,
        projectId,
        sandboxId,
        creditsToDeduct,
      });

      this.logger.log(
        `Successfully charged ${creditsToDeduct} credits to user ${userId} for sandbox ${sandboxId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing sandbox charge: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Calculate total session duration for a sandbox session
   * Handles both creation->pause and resume->pause scenarios
   */
  async calculateSandboxSessionDuration(
    sandboxId: string,
    currentPauseTimestamp: string,
  ): Promise<number> {
    try {
      // Fetch all lifecycle events for this sandbox
      const events = await this.getSandboxLifecycleEvents(sandboxId);

      if (!events || events.length === 0) {
        this.logger.warn(`No lifecycle events found for sandbox ${sandboxId}`);
        return 0;
      }

      // Sort events by timestamp (oldest first)
      events.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // Find the most recent resume or created event before this pause
      let startEvent: E2bLifecycleEvent | null = null;

      // Iterate through events in reverse to find the last resume or created event
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];

        // Stop if we've gone past the current pause event
        if (new Date(event.timestamp) > new Date(currentPauseTimestamp)) {
          continue;
        }

        // If this is the current pause event, skip it
        if (
          event.type === 'sandbox.lifecycle.paused' &&
          event.timestamp === currentPauseTimestamp
        ) {
          continue;
        }

        // Found the start event (either created or resumed)
        if (
          event.type === 'sandbox.lifecycle.created' ||
          event.type === 'sandbox.lifecycle.resumed'
        ) {
          startEvent = event;
          break;
        }
      }

      if (!startEvent) {
        this.logger.warn(
          `No start event (created/resumed) found before pause for sandbox ${sandboxId}`,
        );
        return 0;
      }

      // Calculate duration
      const duration = this.calculateSessionDuration(
        startEvent.timestamp,
        currentPauseTimestamp,
      );

      this.logger.log(
        `Session duration calculated for sandbox ${sandboxId}: ${duration} seconds (${startEvent.type} -> pause)`,
      );

      return duration;
    } catch (error) {
      this.logger.error(
        `Error calculating sandbox session duration: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Handle webhook event
   */
  async handleWebhookEvent(payload: E2bWebhookPayload): Promise<void> {
    if (payload.type === 'sandbox.lifecycle.paused') {
      await this.handleSandboxPaused(payload);
    } else {
      this.logger.warn(`Unknown event type: ${payload.type}`);
    }
  }

  /**
   * Handle sandbox paused event
   */
  private async handleSandboxPaused(payload: E2bWebhookPayload): Promise<void> {
    try {
      // Extract metadata
      const metadata = payload.event_data?.sandbox_metadata;
      const projectId = metadata?.project_id;
      const userId = metadata?.user_id;
      const sandboxId = payload.sandboxId || payload.sandbox_id;
      if (!sandboxId) {
        this.logger.error('No sandbox ID found in pause event');
        return;
      }

      if (!projectId || !userId) {
        this.logger.warn(
          `Missing project_id or user_id in metadata for sandbox ${sandboxId}`,
        );
      }

      // Calculate session duration
      const durationSeconds = await this.calculateSandboxSessionDuration(
        sandboxId,
        payload.timestamp,
      );

      // Calculate cost in dollars
      const costInDollars = this.calculateSandboxCost(durationSeconds);
      const creditsToDeduct = this.convertDollarsToCredits(costInDollars);

      console.log(`Session Duration: ${durationSeconds} seconds`);
      console.log(
        `Session Duration: ${(durationSeconds / 60).toFixed(2)} minutes`,
      );
      console.log(
        `Session Duration: ${(durationSeconds / 3600).toFixed(4)} hours`,
      );

      // Process the charge if user and project IDs are available
      if (userId && projectId && creditsToDeduct > 0) {
        await this.processSandboxCharge(
          userId,
          projectId,
          sandboxId,
          durationSeconds,
          creditsToDeduct,
        );
        this.logger.log(
          `✅ Successfully charged ${creditsToDeduct} credits to user ${userId}`,
        );
      } else {
        this.logger.warn(
          `Skipping charge: userId=${userId}, projectId=${projectId}, credits=${creditsToDeduct}`,
        );
      }

      // Update project status to paused in database
      if (projectId) {
        await this.prisma.project.update({
          where: { id: projectId },
          data: {
            sandbox_state: 'PAUSED',
            status: 'PAUSED',
            last_active: new Date(),
          },
        });
        this.logger.log(`Updated project ${projectId} status to PAUSED`);
      }
    } catch (error) {
      this.logger.error(
        `Error handling sandbox paused event: ${error.message}`,
        error.stack,
      );
    }
  }
}
