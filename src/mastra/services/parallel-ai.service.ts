/**
 * Parallel AI Service
 * Handles deep research tasks via Parallel AI Task API
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface ParallelAITaskParams {
  coinName: string;
  coinSymbol?: string;
}

export interface ParallelAITaskResponse {
  task_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface MemeResearchReport {
  coin_name: string;
  coin_symbol?: string;
  timestamp: string;
  research_duration_seconds: number;
  price_analysis: {
    current_price: string;
    market_cap: string;
    volume_24h: string;
    price_change_24h: string;
    price_change_7d: string;
    ath: string;
    ath_date: string;
    atl: string;
    atl_date: string;
    circulating_supply: string;
    max_supply: string;
    key_support_levels: string[];
    key_resistance_levels: string[];
  };
  sentiment_analysis: {
    overall_sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
    sentiment_score: number; // 0-100
    twitter_mentions_24h: number;
    reddit_posts_24h: number;
    trending_hashtags: string[];
    influencer_sentiment: string;
    news_sentiment: string;
  };
  social_metrics: {
    twitter_followers: number;
    reddit_subscribers: number;
    telegram_members: number;
    discord_members: number;
    community_activity: 'High' | 'Medium' | 'Low';
    developer_activity: 'High' | 'Medium' | 'Low';
    github_commits_30d: number;
    active_developers: number;
  };
  whale_activity: {
    top_10_holders_percentage: string;
    top_50_holders_percentage: string;
    recent_large_transactions: Array<{
      amount: string;
      direction: 'accumulation' | 'distribution';
      timestamp: string;
      tx_hash?: string;
    }>;
    whale_sentiment: string;
    concentration_risk: 'High' | 'Medium' | 'Low';
  };
  risk_assessment: {
    risk_score: number; // 0-100 (higher = more risky)
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    risk_factors: string[];
    strengths: string[];
    weaknesses: string[];
  };
  recommendation: string;
  data_sources: string[];
}

@Injectable()
export class ParallelAIService {
  private readonly logger = new Logger(ParallelAIService.name);
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('PARALLEL_AI_API_KEY');
    this.baseUrl =
      this.config.get<string>('PARALLEL_AI_BASE_URL') ||
      'https://api.parallel.ai/v1';

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 800000, // ~13 minutes for deep research tasks
    });

    this.logger.log(`✅ Parallel AI configured — base URL: ${this.baseUrl}`);
  }

  /**
   * Launch deep research task for comprehensive meme coin analysis
   */
  async researchCoin(
    params: ParallelAITaskParams,
  ): Promise<MemeResearchReport> {
    const startTime = Date.now();
    this.logger.log(`Starting deep research for ${params.coinName}`);

    try {
      // core-fast supports ~10 fields max. We pick the 10 most critical fields;
      // all others fall back to N/A gracefully in transformToMemeReport.
      const processor = 'core-fast';
      const symbol = params.coinSymbol || params.coinName;

      // Focused query matching the 10-field schema
      const researchInput = `Research the meme cryptocurrency ${params.coinName} (ticker: ${symbol}). Find: current USD price, market cap, 24h trading volume, 24h price change percentage, overall market sentiment (BULLISH/NEUTRAL/BEARISH), sentiment score 0-100, risk score 0-100, top risk factors, key strengths, and a 2-3 sentence investment recommendation with DYOR disclaimer.`;

      const taskRun = await this.client.post('/tasks/runs', {
        input: researchInput,
        processor: processor,
        task_spec: {
          output_schema: {
            type: 'json',
            json_schema: {
              type: 'object',
              properties: {
                current_price: { type: 'string' },
                market_cap: { type: 'string' },
                volume_24h: { type: 'string' },
                price_change_24h: { type: 'string' },
                sentiment: { type: 'string' },
                sentiment_score: { type: 'number' },
                risk_score: { type: 'number' },
                risk_factors: { type: 'array', items: { type: 'string' } },
                strengths: { type: 'array', items: { type: 'string' } },
                recommendation: { type: 'string' },
              },
            },
          },
        },
      });

      const runId = taskRun.data.run_id;
      this.logger.log(
        `Task created with run_id: ${runId}, processor: ${processor}`,
      );

      // Poll for completion and get result
      const result = await this.pollForResult(runId);

      if (result === null || result === undefined) {
        throw new Error(
          `Parallel AI task ${runId} completed but returned no output. ` +
            `The processor may have returned an unsupported response shape.`,
        );
      }

      // Transform Parallel AI output to our MemeResearchReport format
      const report = this.transformToMemeReport(
        result,
        params.coinName,
        params.coinSymbol,
        Date.now() - startTime,
      );

      this.logger.log(
        `Research completed for ${params.coinName} in ${report.research_duration_seconds}s`,
      );

      return report;
    } catch (error) {
      this.logger.error(
        `Research failed for ${params.coinName}:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Poll for task result with timeout
   */
  private async pollForResult(runId: string, maxWaitMs = 300000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    let consecutiveNetworkErrors = 0;
    const maxNetworkRetries = 3;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await this.client.get(`/tasks/runs/${runId}`);
        consecutiveNetworkErrors = 0; // Reset on success
        const status = response.data.status;

        if (status === 'completed') {
          this.logger.log(`Task ${runId} completed successfully`);
          // The status endpoint does NOT include the output payload.
          // Fetch output from the dedicated result endpoint.
          const resultUrl =
            response.data.result_url || `/tasks/runs/${runId}/result`;
          this.logger.debug(`Task ${runId} fetching result from: ${resultUrl}`);
          const resultResponse = await this.client.get(resultUrl);
          this.logger.debug(
            `Task ${runId} result response: ${JSON.stringify(resultResponse.data)?.slice(0, 1000)}`,
          );
          // Result endpoint returns { output: { content: {...}, basis: [...] } }
          // or { output: <string> } for text schema responses
          const output =
            resultResponse.data.output ??
            resultResponse.data.result ??
            resultResponse.data.content ??
            null;
          if (output === null || output === undefined) {
            this.logger.warn(
              `Task ${runId} result endpoint returned no output. Full data: ${JSON.stringify(resultResponse.data)?.slice(0, 500)}`,
            );
          }
          return output;
        } else if (status === 'failed') {
          throw new Error(
            `Task failed: ${response.data.errors?.[0]?.message || response.data.error || 'Unknown error'}`,
          );
        }

        // Still running, wait and retry
        this.logger.debug(`Task ${runId} status: ${status}, polling...`);
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        // Permanent errors: 404 (task not found) or task-level failures — throw immediately
        if (error.response?.status === 404) {
          throw new Error(`Task ${runId} not found`);
        }
        // If the error message starts with 'Task failed:' it's a task-level failure,
        // not a network glitch — let it propagate.
        if (error.message?.startsWith('Task failed:')) {
          throw error;
        }

        // Transient network errors (DNS, ECONNRESET, 5xx, etc.) — retry up to N times
        consecutiveNetworkErrors++;
        if (consecutiveNetworkErrors >= maxNetworkRetries) {
          this.logger.error(
            `Task ${runId}: ${maxNetworkRetries} consecutive network errors, giving up. Last error: ${error.message}`,
          );
          throw error;
        }
        this.logger.warn(
          `Task ${runId}: transient error (${consecutiveNetworkErrors}/${maxNetworkRetries}), retrying in ${pollInterval}ms — ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Task ${runId} timed out after ${maxWaitMs}ms`);
  }

  /**
   * Transform Parallel AI output to MemeResearchReport format
   */
  private transformToMemeReport(
    output: any,
    coinName: string,
    coinSymbol: string | undefined,
    durationMs: number,
  ): MemeResearchReport {
    // Parallel AI auto-schema response shape (pro/pro-fast):
    //   output = { content: { ...fields... }, basis: [...citations...] }
    // Other possible shapes:
    //   output = a plain string
    //   output = { content: "<json string>", basis: [...] }
    let content: Record<string, any> = {};
    try {
      if (
        output &&
        typeof output === 'object' &&
        output.content !== undefined
      ) {
        // Standard auto-schema shape: unwrap content
        if (typeof output.content === 'string') {
          // content is a JSON string — strip fences and parse
          const jsonStr = output.content
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/i, '')
            .trim();
          content = JSON.parse(jsonStr);
        } else if (
          typeof output.content === 'object' &&
          output.content !== null
        ) {
          // content is already a plain object
          content = output.content;
        }
      } else if (typeof output === 'string') {
        // Raw string response — strip fences and parse as JSON
        const jsonStr = output
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
        content = JSON.parse(jsonStr);
      } else if (output && typeof output === 'object') {
        // Flat object with fields directly
        content = output;
      }
    } catch {
      // Non-JSON response — log raw output to aid debugging
      this.logger.warn(
        `Could not parse Parallel AI output as JSON. Raw output: ${JSON.stringify(output)?.slice(0, 500)}`,
      );
    }

    return {
      coin_name: coinName,
      coin_symbol: coinSymbol || coinName.toUpperCase(),
      timestamp: new Date().toISOString(),
      research_duration_seconds: Math.floor(durationMs / 1000),
      price_analysis: {
        current_price: content.current_price || content.price || 'N/A',
        market_cap:
          content.market_cap || content.market_capitalization || 'N/A',
        volume_24h: content.volume_24h || content.trading_volume || 'N/A',
        price_change_24h:
          content.price_change_24h || content.price_change || 'N/A',
        price_change_7d:
          content.price_change_7d || content.weekly_change || 'N/A',
        ath: content.ath || content.all_time_high || 'N/A',
        ath_date: content.ath_date || 'N/A',
        atl: content.atl || content.all_time_low || 'N/A',
        atl_date: content.atl_date || 'N/A',
        circulating_supply: content.circulating_supply || 'N/A',
        max_supply: content.max_supply || 'Unlimited',
        key_support_levels: content.support_levels || [],
        key_resistance_levels: content.resistance_levels || [],
      },
      sentiment_analysis: {
        overall_sentiment:
          content.sentiment || content.market_sentiment || 'NEUTRAL',
        sentiment_score: content.sentiment_score || 50,
        twitter_mentions_24h: content.twitter_mentions || 0,
        reddit_posts_24h: content.reddit_posts || 0,
        trending_hashtags: content.trending_hashtags || [],
        influencer_sentiment: content.influencer_sentiment || 'Mixed signals',
        news_sentiment: content.news_sentiment || 'Neutral',
      },
      social_metrics: {
        twitter_followers: content.twitter_followers || 0,
        reddit_subscribers: content.reddit_subscribers || 0,
        telegram_members: content.telegram_members || 0,
        discord_members: content.discord_members || 0,
        community_activity: content.community_activity || 'Medium',
        developer_activity: content.developer_activity || 'Low',
        github_commits_30d: content.github_commits || 0,
        active_developers: content.active_developers || 0,
      },
      whale_activity: {
        top_10_holders_percentage:
          content.top_10_holders || content.whale_concentration || 'N/A',
        top_50_holders_percentage: content.top_50_holders || 'N/A',
        recent_large_transactions: content.large_transactions || [],
        whale_sentiment: content.whale_sentiment || 'Mixed activity observed',
        concentration_risk: content.concentration_risk || 'Medium',
      },
      risk_assessment: {
        risk_score: content.risk_score || 50,
        risk_level: content.risk_level || 'MEDIUM',
        risk_factors: content.risk_factors || [
          'High volatility',
          'Speculative asset',
        ],
        strengths: content.strengths || ['Community support'],
        weaknesses: content.weaknesses || ['Limited utility'],
      },
      recommendation:
        content.recommendation ||
        content.summary ||
        'Research completed. DYOR before investing.',
      // basis lives at output.basis (same level as output.content)
      data_sources: output?.basis
        ?.map((b: any) => b.citations?.[0]?.title || b.field || 'Web Research')
        .slice(0, 5) || ['Parallel AI Deep Research'],
    };
  }
}
