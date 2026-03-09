/**
 * Research Meme Coin Tool
 * Comprehensive deep dive using Sentiment Analysis (CoinGecko + DexCheck KOL)
 */

import { PrismaService } from '../../shared/services/prisma.service';
import { SentimentAnalysisService } from '../services/sentiment-analysis.service';
import { Logger } from '@nestjs/common';

export interface ResearchMemeCoinParams {
  coin_name: string;
  session_id: string;
}

const logger = new Logger('ResearchMemeCoinTool');

export const createResearchMemeCoinTool = (
  sentimentService: SentimentAnalysisService,
  prisma: PrismaService,
) => ({
  id: 'research_meme_coin',
  name: 'Research Meme Coin',
  description:
    'Deep research for a meme coin using CoinGecko market data + DexCheck KOL/influencer analysis. Accepts coin name or ticker symbol. Returns comprehensive report with price, market metrics, social accounts, KOL engagement, influencer analysis, sentiment breakdown, and trending data. ALWAYS use this for first-time research or when user requests "full analysis".',

  parameters: {
    type: 'object',
    properties: {
      coin_name: {
        type: 'string',
        description:
          'Name or ticker symbol of the meme coin (e.g., "PEPE", "pepe coin", "Bitcoin")',
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
    logger.log(`Starting sentiment research for ${params.coin_name}...`);

    try {
      const report = await sentimentService.researchCoin(params.coin_name);

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      const summary =
        (report.insights as string[]).join(' | ') ||
        `Sentiment analysis completed for ${params.coin_name}`;

      const savedReport = await prisma.memeReport.create({
        data: {
          sessionId: params.session_id,
          coinName:
            report.tokenInfo?.symbol ||
            report.tokenInfo?.name ||
            params.coin_name,
          coinSymbol: report.tokenInfo?.symbol,
          reportContent: report as any,
          summary,
          researchDurationSeconds: durationSeconds,
          researchStatus: 'COMPLETED',
        },
      });

      logger.log(
        `Sentiment research completed for ${params.coin_name} in ${durationSeconds}s (ID: ${savedReport.id})`,
      );

      const md = report.marketData ?? {};

      const result = {
        success: true,
        coinName: report.tokenInfo?.symbol || report.tokenInfo?.name || params.coin_name,
        reportId: savedReport.id,
        researchDuration: `${durationSeconds}s`,

        // ── Token identity ────────────────────────────────────────────
        tokenInfo: {
          name: report.tokenInfo?.name,
          symbol: report.tokenInfo?.symbol,
          coinGeckoId: report.tokenInfo?.coinGeckoId,
          genesisDate: md.genesis_date ?? null,
          marketCapRank: md.market_cap_rank ?? null,
          categories: md.categories ?? [],
        },

        // ── Market metrics ────────────────────────────────────────────
        marketDetails: {
          currentPrice: md.current_price ?? null,
          marketCap: md.market_cap ?? null,
          volume24h: md.total_volume ?? null,
          priceChange24h: md.price_change_24h ?? null,
          priceChange7d: md.price_change_7d ?? null,
          priceChange30d: md.price_change_30d ?? null,
          ath: md.ath ?? null,
          atl: md.atl ?? null,
          athDate: md.ath_date ?? null,
          atlDate: md.atl_date ?? null,
          circulatingSupply: md.circulating_supply ?? null,
          totalSupply: md.total_supply ?? null,
          maxSupply: md.max_supply ?? null,
          sentimentVotesUp: md.sentiment_votes_up_percentage ?? null,
          sentimentVotesDown: md.sentiment_votes_down_percentage ?? null,
        },

        // ── Social accounts ───────────────────────────────────────────
        socialAccounts: {
          twitter: report.socialAccounts?.twitter || null,
          telegram: report.socialAccounts?.telegram || null,
          reddit: report.socialAccounts?.reddit || null,
          website: report.socialAccounts?.website || null,
          github: report.socialAccounts?.github || null,
        },

        // ── Community & developer data ────────────────────────────────
        communityData: md.community_data ?? null,
        developerData: md.developer_data ?? null,

        // ── KOL engagement ────────────────────────────────────────────
        kolEngagement: report.kolEngagement ?? null,

        // ── Influencer analysis ───────────────────────────────────────
        influencerAnalysis: report.influencerAnalysis ?? null,

        // ── Sentiment breakdown ───────────────────────────────────────
        sentimentBreakdown: report.sentimentBreakdown ?? null,

        // ── Trending analysis ─────────────────────────────────────────
        trendingAnalysis: report.trendingAnalysis ?? null,

        // ── Community mood ────────────────────────────────────────────
        communityMood: report.communityMood ?? null,

        // ── Auto-generated insights ───────────────────────────────────
        insights: report.insights ?? [],
        analysisTimestamp: report.analysisTimestamp,
        fullReportAvailable: true,
      };

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      logger.error(`Sentiment research failed for ${params.coin_name}:`, error.message);

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
