/**
 * Refresh Coin Data Tool
 * Quick price update via CoinGecko (no KOL call)
 */

import { SentimentAnalysisService } from '../services/sentiment-analysis.service';
import { Logger } from '@nestjs/common';

export interface RefreshCoinDataParams {
  coin_name: string;
}

const logger = new Logger('RefreshCoinDataTool');

export const createRefreshCoinDataTool = (
  sentimentService: SentimentAnalysisService,
) => ({
  id: 'refresh_coin_data',
  name: 'Refresh Coin Data',
  description:
    'Quickly update price and market data for a meme coin via CoinGecko. Accepts coin name or ticker symbol. Faster than full research. Use when user asks for "latest price", "current status", or a quick update.',

  parameters: {
    type: 'object',
    properties: {
      coin_name: {
        type: 'string',
        description: 'Name or ticker symbol of the meme coin to refresh (e.g., "PEPE", "Bitcoin")',
      },
    },
    required: ['coin_name'],
  },

  execute: async (params: RefreshCoinDataParams): Promise<string> => {
    const startTime = Date.now();
    logger.log(`Quick refresh for ${params.coin_name}...`);

    try {
      const report = await sentimentService.refreshCoin(params.coin_name);

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const md = report.marketData ?? {};

      logger.log(
        `Quick refresh completed for ${params.coin_name} in ${durationSeconds}s`,
      );

      const result = {
        success: true,
        coinName: report.tokenInfo?.symbol || report.tokenInfo?.name || params.coin_name,
        updateDuration: `${durationSeconds}s`,
        timestamp: new Date().toISOString(),
        tokenInfo: {
          name: report.tokenInfo?.name,
          symbol: report.tokenInfo?.symbol,
          coinGeckoId: report.tokenInfo?.coinGeckoId,
          marketCapRank: md.market_cap_rank ?? null,
        },
        price: {
          currentPrice: md.current_price ?? null,
          priceChange24h: md.price_change_24h ?? null,
          priceChange7d: md.price_change_7d ?? null,
          volume24h: md.total_volume ?? null,
          marketCap: md.market_cap ?? null,
          ath: md.ath ?? null,
          atl: md.atl ?? null,
        },
        socialAccounts: {
          twitter: report.socialAccounts?.twitter || null,
          telegram: report.socialAccounts?.telegram || null,
          website: report.socialAccounts?.website || null,
        },
        quickSummary: `${report.tokenInfo?.symbol || params.coin_name} price: $${md.current_price ?? 'N/A'}. 24h change: ${md.price_change_24h ?? 'N/A'}%. 7d change: ${md.price_change_7d ?? 'N/A'}%.`,
        note: 'Quick update completed. For KOL analysis, influencer sentiment, and community data use research_meme_coin.',
      };

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      logger.error(
        `Quick refresh failed for ${params.coin_name}:`,
        error.message,
      );

      return JSON.stringify({
        success: false,
        coinName: params.coin_name,
        error: error.message,
        message: `Failed to refresh data for ${params.coin_name}. ${error.message}`,
      });
    }
  },
});
