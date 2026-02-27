/**
 * Refresh Coin Data Tool
 * Quick price & sentiment update (faster than full research)
 */

import { ParallelAIService } from '../services/parallel-ai.service';
import { Logger } from '@nestjs/common';

export interface RefreshCoinDataParams {
  coin_name: string;
}

const logger = new Logger('RefreshCoinDataTool');

export const createRefreshCoinDataTool = (parallelAI: ParallelAIService) => ({
  id: 'refresh_coin_data',
  name: 'Refresh Coin Data',
  description:
    'Quickly update price and sentiment data for a meme coin (30-60s). Faster than full research. Use when user asks for "latest price", "current status", or when existing report is > 24 hours old.',

  parameters: {
    type: 'object',
    properties: {
      coin_name: {
        type: 'string',
        description: 'Name of the meme coin to refresh data for',
      },
    },
    required: ['coin_name'],
  },

  execute: async (params: RefreshCoinDataParams): Promise<string> => {
    const startTime = Date.now();
    logger.log(`Quick refresh for ${params.coin_name}...`);

    try {
      const report = await parallelAI.researchCoin({
        coinName: params.coin_name,
      });

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      logger.log(
        `Quick refresh completed for ${params.coin_name} in ${durationSeconds}s`,
      );

      // Return lightweight response focused on price and sentiment
      const result = {
        success: true,
        coinName: params.coin_name,
        updateDuration: `${durationSeconds}s`,
        timestamp: new Date().toISOString(),
        price: report.price_analysis,
        sentiment: report.sentiment_analysis,
        quickSummary: `${params.coin_name} price: ${report.price_analysis?.current_price || 'N/A'}. Change 24h: ${report.price_analysis?.price_change_24h || 'N/A'}. Sentiment: ${report.sentiment_analysis?.overall_sentiment || 'NEUTRAL'}.`,
        note: 'Quick update completed. For comprehensive analysis with whale metrics and social data, use research_meme_coin.',
      };

      return JSON.stringify(result, null, 2);
    } catch (error) {
      logger.error(
        `Quick refresh failed for ${params.coin_name}:`,
        error.message,
      );

      const errorResult = {
        success: false,
        coinName: params.coin_name,
        error: error.message,
        message: `Failed to refresh data for ${params.coin_name}. API may be unavailable.`,
      };

      return JSON.stringify(errorResult, null, 2);
    }
  },
});
