import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';

export interface SandboxChargeParams {
  userId: string;
  projectId: string;
  sandboxId: string;
  creditsToDeduct: number;
}

export interface AIModelChargeParams {
  userId: string;
  projectId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface DeploymentChargeParams {
  /** The user being charged */
  userId: string;
  /** Project being deployed (used as billing identifier) */
  projectId: string;
  /** Number of credits to deduct — use DEPLOYMENT_CREDIT_COST constant */
  creditsToDeduct: number;
}

/**
 * Thrown exclusively when a user has insufficient credits to cover a charge.
 * Distinguishable from transient infrastructure errors (DB down, network, etc.)
 * so callers — especially the billing cron — can safely terminate a deployment
 * only when the user genuinely has no credits, not on intermittent failures.
 */
export class InsufficientCreditsError extends Error {
  constructor(available: number, required: number) {
    super(
      `Insufficient credits. Available: ${available}, Required: ${required}`,
    );
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Deployment credit cost — charged once upfront when a user triggers a deploy.
 *
 * Cost breakdown (monthly, per active deployment):
 *   Koyeb nano instance (1 vCPU, 256 MB, was region, min=1 max=1) … $2.68/mo
 *   DigitalOcean Spaces (screenshot + ZIP storage) ……………………… ~$0.01/mo
 *   GitHub public repo hosting ………………………………………………… $0.00
 *   Google PageSpeed screenshot API …………………………………………… $0.00
 *   ──────────────────────────────────────────────────────────
 *   Total at cost ……………………………………………………… ~$2.69/mo
 *   At CREDITS_PER_DOLLAR = 200 ……………………………………… ~538 credits
 *   ×2 profit margin ………………………………………………… ~1,076 credits
 *   Rounded to clean number ………………………………………… 1,100 credits
 */
export const DEPLOYMENT_CREDIT_COST = 1_100;

/**
 * Additional credit surcharge when a custom domain is attached via SaaS Custom Domains.
 *
 * SaaS Custom Domains pricing: $0.20/domain/month (usage-based)
 *   $0.20 × 200 credits/$ = 40 credits at cost
 *   ×2 profit margin      = 80 credits
 *   Rounded               = 100 credits
 *
 * Total for a custom domain deployment: 1,100 + 100 = 1,200 credits ($6.00)
 */
export const CUSTOM_DOMAIN_CREDIT_SURCHARGE = 100;

/**
 * Per-tool credit costs for external API calls made by the agent during
 * landing page generation. Charged when a tool_complete SSE event is
 * received for a billable tool.
 *
 * Pricing methodology: API cost × CREDITS_PER_DOLLAR (200) × 2 (margin),
 * rounded to nearest integer.
 */
export const TOOL_CREDIT_COSTS: Record<string, number> = {
  // ── Fal.ai image generation ────────────────────────────────────────
  // flux/schnell (default): ~$0.003/image → 0.003 × 200 × 2 = 1.2 → 2
  // flux/dev:               ~$0.025/image → 0.025 × 200 × 2 = 10
  // flux-pro:               ~$0.050/image → 0.050 × 200 × 2 = 20
  // Flat rate per call covers the default model with margin for upgrades.
  generate_image_text_to_image: 2,
  generate_image_img_to_img: 2,
  remove_background_from_image: 1,

  // ── Web search (Parallel AI) ──────────────────────────────────────
  // ~$0.005/search → 0.005 × 200 × 2 = 2
  search_web: 2,

  // ── Brand.dev API ─────────────────────────────────────────────────
  // ~$0.002/call → 0.002 × 200 × 2 = 0.8 → 1
  get_brand_data: 1,
  ai_query_brand_website: 1,
};

/**
 * Minimum credit balance required to start a chat session.
 * Prevents 0-credit users from consuming resources for free.
 * A single agent turn with the default model costs ~2-5 credits.
 */
export const MINIMUM_CHAT_CREDITS = 5;

/**
 * MemeGPT credit costs — charged after a successful Parallel AI tool call.
 *
 * Pricing methodology (cost × CREDIT_PER_DOLLAR 200 × 2× margin, rounded):
 *   research_meme_coin : Parallel AI pro-fast deep-research task ~$0.10/call
 *                        → 0.10 × 200 × 2 = 40 → rounded to 50 credits
 *   refresh_coin_data  : Parallel AI lite-fast quick-refresh task ~$0.005/call
 *                        → 0.005 × 200 × 2 = 2 → rounded to 5 credits
 *   get_stored_report  : Pure DB read, minimal cost; 2-credit courtesy floor
 *   MEMEGPT_MIN_CREDITS: Minimum balance needed to start any MemeGPT session
 *                        (covers at least one stored-report query)
 */
export const MEMEGPT_MIN_CREDITS = 10;
export const MEMEGPT_RESEARCH_CREDIT_COST = 50;
export const MEMEGPT_REFRESH_CREDIT_COST = 5;
export const MEMEGPT_STORED_REPORT_CREDIT_COST = 2;

export interface ToolChargeParams {
  userId: string;
  projectId: string;
  toolName: string;
  creditsToDeduct: number;
}

@Injectable()
export class GameGenCreditService {
  private readonly logger = new Logger(GameGenCreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Process sandbox usage charge for a user
   * Deducts credits based on sandbox session duration
   */
  async processSandboxCharge(params: SandboxChargeParams): Promise<void> {
    const { userId, projectId, sandboxId, creditsToDeduct } = params;

    try {
      await this.deductCredits(userId, creditsToDeduct, 'SANDBOX', sandboxId);

      // Send usage data to OpenMeter
      await this.sendToOpenMeter({
        userId,
        projectId,
        identifier: sandboxId,
        credits: creditsToDeduct,
        type: 'game-gen-sandbox',
      });

      this.logger.log(
        `✅ Successfully charged ${creditsToDeduct} credits to user ${userId} for sandbox ${sandboxId}`,
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
   * Charge credits for a Koyeb deployment action.
   *
   * Cost: DEPLOYMENT_CREDIT_COST (1,100 credits = $5.50) per trigger.
   * Covers: 1 month of Koyeb nano hosting ($2.68) + DO Spaces storage (~$0.01)
   *         at 2× profit margin. See constant definition for full breakdown.
   * No refund on failure — Koyeb/GitHub resources are consumed regardless.
   *
   * @throws BadRequestException when user has insufficient credits
   */
  async chargeForDeployment(
    params: DeploymentChargeParams,
  ): Promise<{ creditsDeducted: number; creditsRemaining: number }> {
    const { userId, projectId, creditsToDeduct } = params;

    this.logger.log(
      `Charging ${creditsToDeduct} credits for deployment by user ${userId} (project: ${projectId})`,
    );

    // Deduct atomically — throws BadRequestException if insufficient
    await this.deductCredits(userId, creditsToDeduct, 'DEPLOYMENT', projectId);

    // Fire-and-forget OpenMeter analytics (never blocks the deploy)
    this.sendToOpenMeter({
      userId,
      projectId,
      identifier: `deployment-${projectId}`,
      credits: creditsToDeduct,
      type: 'game-gen-sandbox', // reuse existing event type for analytics
      metadata: {
        model: 'koyeb-deployment',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    }).catch((err) => {
      this.logger.warn(
        `OpenMeter analytics failed (non-fatal): ${err.message}`,
      );
    });

    this.logger.log(
      `✅ Charged ${creditsToDeduct} credits for deployment — user: ${userId}, project: ${projectId}`,
    );

    const creditsRemaining = await this.getUserRemainingCredits(userId);
    return { creditsDeducted: creditsToDeduct, creditsRemaining };
  }

  /**
   * Charge credits for an external API tool call made by the agent.
   *
   * Called when a `tool_complete` SSE event is received for a tool listed
   * in TOOL_CREDIT_COSTS (e.g. Fal.ai image generation, web search).
   * Fire-and-forget from the caller — failures are logged but do not
   * block the SSE stream.
   */
  async chargeForToolUsage(params: ToolChargeParams): Promise<void> {
    const { userId, projectId, toolName, creditsToDeduct } = params;

    if (creditsToDeduct <= 0) {
      return;
    }

    try {
      this.logger.log(
        `Charging ${creditsToDeduct} credits for tool ${toolName} — user: ${userId}, project: ${projectId}`,
      );

      await this.deductCredits(userId, creditsToDeduct, 'TOOL', toolName);

      // Fire-and-forget OpenMeter analytics
      this.sendToOpenMeter({
        userId,
        projectId,
        identifier: toolName,
        credits: creditsToDeduct,
        type: 'game-gen-ai-model',
        metadata: { model: toolName },
      }).catch((err) => {
        this.logger.warn(
          `OpenMeter analytics failed (non-fatal): ${err.message}`,
        );
      });

      this.logger.log(
        `✅ Charged ${creditsToDeduct} credits for tool ${toolName} — user: ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error charging for tool ${toolName}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Unified method to deduct credits from user's plan
   * Uses atomic transactions to prevent race conditions
   */
  private async deductCredits(
    userId: string,
    credits: number,
    chargeType: 'SANDBOX' | 'AI_MODEL' | 'DEPLOYMENT' | 'TOOL',
    identifier: string,
  ): Promise<void> {
    // Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx) => {
      // Fetch user with plan details
      const user = await tx.users.findUnique({
        where: { id: userId },
        include: {
          Credits: true,
          TopUp: true,
          Subscription: true,
        },
      });

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Process based on plan type
      switch (user.currentPlan) {
        case 'FREE':
          await this.deductFromFreeCredits(tx, user, credits);
          break;

        case 'TOP_UP':
          await this.deductFromTopUp(tx, user, credits);
          break;

        case 'SUBSCRIPTION':
          await this.deductFromSubscription(tx, user, credits);
          break;

        default:
          throw new Error(`Unknown payment plan: ${user.currentPlan}`);
      }

      this.logger.log(
        `${user.currentPlan} user ${userId} charged ${credits} credits for ${chargeType}`,
      );
    });
  }

  /**
   * Deduct credits from FREE plan
   */
  private async deductFromFreeCredits(tx: any, user: any, credits: number) {
    const userCredits = user.Credits;
    if (!userCredits) {
      throw new Error(`No credits record found for user: ${user.id}`);
    }

    const currentUsage = userCredits.creditUsage || 0;
    const newUsage = currentUsage + credits;
    const available = userCredits.availableCredits;

    // Check limit
    if (newUsage > available) {
      // Cap at available and mark as DONE
      await tx.credits.update({
        where: { id: userCredits.id },
        data: {
          creditUsage: available,
          status: 'DONE',
        },
      });

      throw new InsufficientCreditsError(available - currentUsage, credits);
    }

    // Update usage
    await tx.credits.update({
      where: { id: userCredits.id },
      data: { creditUsage: newUsage },
    });

    this.logger.log(
      `FREE plan usage: ${newUsage}/${available} (charged ${credits})`,
    );
  }

  /**
   * Deduct credits from TOP_UP plan
   */
  private async deductFromTopUp(tx: any, user: any, credits: number) {
    const topUp = user.TopUp;
    if (!topUp) {
      throw new Error(`No top-up record found for user: ${user.id}`);
    }

    const currentUsage = topUp.creditUsage || 0;
    const newUsage = currentUsage + credits;
    const total = topUp.totalCredits;

    // Check limit
    if (newUsage > total) {
      // Cap at total and mark as DONE
      await tx.topUp.update({
        where: { id: topUp.id },
        data: {
          creditUsage: total,
          status: 'DONE',
        },
      });

      throw new InsufficientCreditsError(total - currentUsage, credits);
    }

    // Update usage
    await tx.topUp.update({
      where: { id: topUp.id },
      data: { creditUsage: newUsage },
    });

    this.logger.log(
      `TOP_UP plan usage: ${newUsage}/${total} (charged ${credits})`,
    );
  }

  /**
   * Deduct credits from SUBSCRIPTION plan
   */
  private async deductFromSubscription(tx: any, user: any, credits: number) {
    const subscription = user.Subscription?.[0];
    if (!subscription) {
      throw new Error(`No subscription record found for user: ${user.id}`);
    }

    const currentUsage = subscription.creditUsage || 0;
    const newUsage = currentUsage + credits;
    const total = subscription.totalCredits;

    // Check limit
    if (newUsage > total) {
      // Cap at total
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { creditUsage: total },
      });

      throw new InsufficientCreditsError(total - currentUsage, credits);
    }

    // Update usage
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { creditUsage: newUsage },
    });

    this.logger.log(
      `SUBSCRIPTION plan usage: ${newUsage}/${total} (charged ${credits})`,
    );
  }

  /**
   * AI Model pricing per 1M tokens (in USD)
   * Based on common model pricing
   */
  private readonly AI_MODEL_PRICING: Record<
    string,
    { input: number; output: number }
  > = {
    // OpenAI Models
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    'gpt-4': { input: 30.0, output: 60.0 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    'o1-preview': { input: 15.0, output: 60.0 },
    'o1-mini': { input: 3.0, output: 12.0 },

    // Anthropic Models
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
    'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

    // X.AI Models
    'x-ai/grok-4-fast': { input: 0.2, output: 0.5 },
    'x-ai/grok-beta': { input: 5.0, output: 15.0 },

    // Default fallback pricing
    default: { input: 1.0, output: 3.0 },
  };

  /**
   * Calculate cost in USD for AI model usage
   */
  private calculateAIModelCost(
    modelName: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    // Get pricing for the model, fallback to default
    const pricing =
      this.AI_MODEL_PRICING[modelName] || this.AI_MODEL_PRICING.default;

    // Calculate cost (pricing is per 1M tokens)
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Convert dollar amount to credits
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
   * Process AI model usage charge
   * Called when AI agent completes a response
   */
  async processAIModelCharge(params: AIModelChargeParams): Promise<void> {
    const {
      userId,
      projectId,
      modelName,
      inputTokens,
      outputTokens,
      totalTokens,
    } = params;

    try {
      // Calculate cost in dollars
      const costInDollars = this.calculateAIModelCost(
        modelName,
        inputTokens,
        outputTokens,
      );

      // Convert to credits
      const creditsToDeduct = this.convertDollarsToCredits(costInDollars);

      if (creditsToDeduct === 0) {
        this.logger.log('No credits to deduct (cost too low)');
        return;
      }

      this.logger.log(
        `Processing AI model charge for user ${userId}: ${creditsToDeduct} credits ` +
          `(${totalTokens} tokens, $${costInDollars.toFixed(6)}, model: ${modelName})`,
      );

      await this.deductCredits(userId, creditsToDeduct, 'AI_MODEL', modelName);

      // Send usage data to OpenMeter
      await this.sendToOpenMeter({
        userId,
        projectId,
        identifier: modelName,
        credits: creditsToDeduct,
        type: 'game-gen-ai-model',
        metadata: {
          model: modelName,
          inputTokens,
          outputTokens,
          totalTokens,
        },
      });

      this.logger.log(
        `✅ Successfully charged ${creditsToDeduct} credits to user ${userId} for AI model usage (${modelName})`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing AI model charge: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get user's remaining credits
   * Useful for pre-flight checks before starting a sandbox
   */
  async getUserRemainingCredits(userId: string): Promise<number> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: {
        Credits: true,
        TopUp: true,
        Subscription: true,
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    switch (user.currentPlan) {
      case 'FREE':
        const credits = user.Credits;
        return credits
          ? credits.availableCredits - (credits.creditUsage || 0)
          : 0;

      case 'TOP_UP':
        const topUp = user.TopUp;
        return topUp ? topUp.totalCredits - topUp.creditUsage : 0;

      case 'SUBSCRIPTION':
        const subscription = user.Subscription?.[0];
        return subscription
          ? subscription.totalCredits - subscription.creditUsage
          : 0;

      default:
        return 0;
    }
  }

  /**
   * Check if user has sufficient credits for estimated sandbox duration
   * Returns true if user can afford the session
   */
  async canAffordSandboxSession(
    userId: string,
    estimatedDurationSeconds: number,
  ): Promise<boolean> {
    const COST_PER_SECOND = 0.000037; // $0.000037/second
    const CREDITS_PER_DOLLAR = this.configService.get<number>(
      'CREDITS_PER_DOLLAR',
      200,
    );

    const estimatedCost = COST_PER_SECOND * estimatedDurationSeconds;
    const estimatedCredits = Math.ceil(estimatedCost * CREDITS_PER_DOLLAR);

    const remainingCredits = await this.getUserRemainingCredits(userId);

    return remainingCredits >= estimatedCredits;
  }

  /**
   * Send usage data to OpenMeter for analytics and billing
   */
  private async sendToOpenMeter(params: {
    userId: string;
    projectId: string;
    identifier: string;
    credits: number;
    type: 'game-gen-sandbox' | 'game-gen-ai-model';
    metadata?: {
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  }): Promise<void> {
    const openMeterApiKey = this.configService.get('OPENMETER_API_KEY');
    const openMeterBaseUrl = this.configService.get('OPENMETER_BASE_URL');

    if (!openMeterApiKey || !openMeterBaseUrl) {
      this.logger.debug('OpenMeter not configured, skipping analytics');
      return;
    }

    try {
      // CloudEvents v1.0 specification compliant payload
      const openMeterPayload = {
        specversion: '1.0',
        type: params.type, // Event type: game-gen-sandbox, game-gen-ai-model
        source: 'meme-coin-backend',
        subject: params.userId,
        id: `${params.type}-${params.identifier}-${Date.now()}`,
        time: new Date().toISOString(),
        data: {
          userId: params.userId,
          projectId: params.projectId,
          identifier: params.identifier,
          credits: params.credits,
          type: params.type,
          ...params.metadata,
        },
      };

      this.logger.debug(
        `Sending event to OpenMeter: ${JSON.stringify(openMeterPayload)}`,
      );

      const response = await axios.post(
        `${openMeterBaseUrl}/api/v1/events`,
        openMeterPayload,
        {
          headers: {
            'Content-Type': 'application/cloudevents+json',
            Authorization: `Bearer ${openMeterApiKey}`,
          },
          // Force IPv4 to avoid IPv6 connectivity issues in K8s
          httpAgent: new http.Agent({
            family: 4,
            timeout: 30000,
          }),
          httpsAgent: new https.Agent({
            family: 4,
            timeout: 30000,
          }),
          timeout: 10000, // 10 second timeout
          validateStatus: (status) => status >= 200 && status < 300,
        },
      );

      this.logger.debug(
        `OpenMeter response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
      this.logger.log(
        `Successfully sent usage data to OpenMeter for user: ${params.userId}`,
      );
    } catch (error: any) {
      if (error.response) {
        this.logger.error(
          `OpenMeter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
        );
      } else if (error.request) {
        this.logger.error(
          `OpenMeter request failed: No response received - ${error.message}`,
        );
      } else {
        this.logger.error(`Failed to send data to OpenMeter: ${error.message}`);
      }
      // Don't throw error - analytics failure shouldn't break generation
    }
  }
}
