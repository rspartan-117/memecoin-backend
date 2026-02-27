/**
 * Research Meme Coin Tool
 * Comprehensive deep dive using Parallel AI
 */

import { ParallelAIService } from '../services/parallel-ai.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { Logger } from '@nestjs/common';

export interface ResearchMemeCoinParams {
  coin_name: string;
  session_id: string;
}

const logger = new Logger('ResearchMemeCoinTool');

export const createResearchMemeCoinTool = (
  parallelAI: ParallelAIService,
  prisma: PrismaService,
) => ({
  id: 'research_meme_coin',
  name: 'Research Meme Coin',
  description:
    'Launch deep meme coin research using Parallel AI (60-180s). Returns comprehensive report with price, sentiment, social metrics, whale activity, and risk assessment. ALWAYS use this for first-time research or when user explicitly requests "full analysis".',

  parameters: {
    type: 'object',
    properties: {
      coin_name: {
        type: 'string',
        description: 'Name or symbol of the meme coin (e.g., DOGE, SHIB, PEPE)',
      },
      session_id: {
        type: 'string',
        description: 'Current conversation session ID',
      },
    },
    required: ['coin_name', 'session_id'],
  },

  execute: async (params: ResearchMemeCoinParams): Promise<string> => {
    const startTime = Date.now();
    logger.log(`Starting deep research for ${params.coin_name}...`);

    try {
      // Call Parallel AI for comprehensive research
      const report = await parallelAI.researchCoin({
        coinName: params.coin_name,
      });

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      // Save report to database
      const savedReport = await prisma.memeReport.create({
        data: {
          sessionId: params.session_id,
          coinName: params.coin_name,
          reportContent: report as any, // JSON field
          summary: report.recommendation,
          researchDurationSeconds: durationSeconds,
          researchStatus: 'COMPLETED',
        },
      });

      logger.log(
        `Research completed for ${params.coin_name} in ${durationSeconds}s (ID: ${savedReport.id})`,
      );

      // Return formatted response for agent
      const result = {
        success: true,
        coinName: params.coin_name,
        reportId: savedReport.id,
        researchDuration: `${durationSeconds}s`,
        recommendation: report.recommendation,
        riskAssessment: report.risk_assessment,
        keyFindings: {
          priceChange24h: report.price_analysis.price_change_24h,
          currentPrice: report.price_analysis.current_price,
          sentimentScore: report.sentiment_analysis.sentiment_score,
          whaleConcentration: report.whale_activity.top_10_holders_percentage,
          communityActivity: report.social_metrics.community_activity,
        },
        fullReportAvailable: true,
      };

      return JSON.stringify(result, null, 2);
    } catch (error) {
      logger.error(`Research failed for ${params.coin_name}:`, error.message);

      // Save failed attempt to database
      // Guard against undefined coin_name — if the LLM omitted it the field would
      // be undefined and Prisma would throw a second error inside this catch block.
      await prisma.memeReport.create({
        data: {
          sessionId: params.session_id,
          coinName: params.coin_name || 'UNKNOWN',
          reportContent: { error: error.message } as any,
          summary: `Research failed: ${error.message}`,
          researchDurationSeconds: Math.floor((Date.now() - startTime) / 1000),
          researchStatus: 'FAILED',
        },
      });

      const errorResult = {
        success: false,
        coinName: params.coin_name,
        error: error.message,
        message: `Failed to complete research for ${params.coin_name}. Please try again or check API connectivity.`,
      };

      return JSON.stringify(errorResult, null, 2);
    }
  },
});
