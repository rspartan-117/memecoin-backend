import { Injectable, Logger } from '@nestjs/common';
import {
  searchCoinGecko,
  getCoinGeckoData,
  getDexCheckKOLMentions,
} from './sentiment-analysis/api-helpers';

/**
 * SentimentAnalysisService
 *
 * NestJS wrapper around CoinGecko (market data) + DexCheck (KOL data).
 * Replaces OnchainAnalysisService for the MemeGPT tool layer.
 */
@Injectable()
export class SentimentAnalysisService {
  private readonly logger = new Logger(SentimentAnalysisService.name);

  // ── Internal coin resolver ─────────────────────────────────────────────────
  private async resolveCoin(
    input: string,
  ): Promise<{ coinId: string; tokenName: string; tokenSymbol: string }> {
    const hits = await searchCoinGecko(input);

    if (!hits.length) {
      this.logger.warn(`No CoinGecko results for "${input}", using raw input`);
      return {
        coinId: input.toLowerCase(),
        tokenName: input,
        tokenSymbol: input.toUpperCase(),
      };
    }

    const exact =
      hits.find((c: any) => c.name.toLowerCase() === input.toLowerCase()) ||
      hits.find((c: any) => c.symbol.toLowerCase() === input.toLowerCase()) ||
      hits[0];

    return {
      coinId: exact.id,
      tokenName: exact.name,
      tokenSymbol: (exact.symbol as string).toUpperCase(),
    };
  }

  // ── Market data assembly ───────────────────────────────────────────────────
  private buildMarketData(coinData: any): any {
    if (!coinData) return {};

    const md = coinData.market_data ?? {};
    const usd = (field: any) => field?.usd ?? null;

    return {
      id: coinData.id,
      symbol: coinData.symbol,
      name: coinData.name,
      current_price: usd(md.current_price),
      market_cap: usd(md.market_cap),
      market_cap_rank: coinData.market_cap_rank ?? null,
      total_volume: usd(md.total_volume),
      price_change_24h: md.price_change_percentage_24h ?? null,
      price_change_7d: md.price_change_percentage_7d ?? null,
      price_change_14d: md.price_change_percentage_14d ?? null,
      price_change_30d: md.price_change_percentage_30d ?? null,
      price_change_60d: md.price_change_percentage_60d ?? null,
      price_change_200d: md.price_change_percentage_200d ?? null,
      price_change_1y: md.price_change_percentage_1y ?? null,
      ath: usd(md.ath),
      ath_change_percentage: usd(md.ath_change_percentage),
      ath_date: md.ath_date?.usd ?? null,
      atl: usd(md.atl),
      atl_change_percentage: usd(md.atl_change_percentage),
      atl_date: md.atl_date?.usd ?? null,
      circulating_supply: md.circulating_supply ?? null,
      total_supply: md.total_supply ?? null,
      max_supply: md.max_supply ?? null,
      sentiment_votes_up_percentage:
        coinData.sentiment_votes_up_percentage ?? null,
      sentiment_votes_down_percentage:
        coinData.sentiment_votes_down_percentage ?? null,
      community_data: coinData.community_data ?? null,
      developer_data: coinData.developer_data ?? null,
      genesis_date: coinData.genesis_date ?? null,
      categories: coinData.categories ?? [],
    };
  }

  private buildSocialAccounts(coinData: any): any {
    if (!coinData) return {};
    return {
      twitter: coinData.links?.twitter_screen_name || null,
      telegram: coinData.links?.telegram_channel_identifier || null,
      reddit: coinData.links?.subreddit_url || null,
      // CoinGecko often returns [''] for tokens with no website — filter it out
      website:
        coinData.links?.homepage?.find((u: string) => u?.startsWith('http')) ||
        null,
      github:
        coinData.links?.repos_url?.github?.find((u: string) =>
          u?.startsWith('http'),
        ) || null,
    };
  }

  // ── KOL / influencer assembly ──────────────────────────────────────────────
  private buildKOLData(
    kolMentions: any[] | null,
    tokenSymbol: string,
  ): {
    kolEngagement: any;
    influencerAnalysis: any;
    sentimentBreakdown: any;
    trendingAnalysis: any;
    communityMood: any;
  } {
    if (!kolMentions || !kolMentions.length) {
      return {
        kolEngagement: null,
        influencerAnalysis: null,
        sentimentBreakdown: null,
        trendingAnalysis: null,
        communityMood: null,
      };
    }

    const totalKOLs = kolMentions.length;
    const totalReach = kolMentions.reduce((s, k) => s + (k.followers ?? 0), 0);
    const totalViews = kolMentions.reduce(
      (s, k) => s + (k.total_views ?? 0),
      0,
    );
    const totalSmartFollowers = kolMentions.reduce(
      (s, k) => s + (k.smart_follower_count ?? 0),
      0,
    );
    const avgMindshare =
      kolMentions.reduce(
        (s, k) => s + parseFloat(k.mindshare_percentage ?? '0'),
        0,
      ) / totalKOLs;

    // Sentiment distribution
    const positiveKOLs = kolMentions.filter(
      (k) => parseFloat(k.mindshare_change ?? '0') > 0,
    ).length;
    const negativeKOLs = kolMentions.filter(
      (k) => parseFloat(k.mindshare_change ?? '0') < 0,
    ).length;
    const neutralKOLs = totalKOLs - positiveKOLs - negativeKOLs;

    const kolEngagement = {
      totalKOLs,
      topKOLs: kolMentions.slice(0, 10).map((k: any) => ({
        username: k.username,
        followers: k.followers,
        smartFollowers: k.smart_follower_count,
        postCount: k.post_count,
        mindshare: parseFloat(k.mindshare_percentage ?? '0'),
        mindshareChange: parseFloat(k.mindshare_change ?? '0'),
        totalViews: k.total_views,
        influence:
          k.followers > 1_000_000
            ? 'High'
            : k.followers > 100_000
              ? 'Medium'
              : 'Low',
      })),
      totalReach,
      totalViews,
      totalSmartFollowers,
      averageMindshare: avgMindshare,
      mindshareTrend:
        avgMindshare > 5
          ? 'Positive'
          : avgMindshare > 2
            ? 'Neutral'
            : 'Negative',
      kolSentiment: 'Neutral',
    };

    const influencerAnalysis = {
      topInfluencers: kolMentions.slice(0, 10).map((k: any) => ({
        username: k.username,
        followers: k.followers,
        smartFollowers: k.smart_follower_count,
        engagement:
          k.followers > 1_000_000
            ? 'High'
            : k.followers > 100_000
              ? 'Medium'
              : 'Low',
        sentiment:
          parseFloat(k.mindshare_change ?? '0') > 0
            ? 'positive'
            : parseFloat(k.mindshare_change ?? '0') < 0
              ? 'negative'
              : 'neutral',
        recentActivity: `${k.post_count} posts · ${k.total_views} total views`,
        influence:
          k.followers > 1_000_000
            ? 'High'
            : k.followers > 100_000
              ? 'Medium'
              : 'Low',
      })),
      influencerSentimentDistribution: {
        positive: (positiveKOLs / totalKOLs) * 100,
        negative: (negativeKOLs / totalKOLs) * 100,
        neutral: (neutralKOLs / totalKOLs) * 100,
      },
      keyInfluencerNarratives: [],
    };

    const sentimentScore =
      (positiveKOLs / totalKOLs) * 100 - (negativeKOLs / totalKOLs) * 100;
    const sentimentBreakdown = {
      overallSentiment:
        sentimentScore > 20
          ? 'Very Positive'
          : sentimentScore > 5
            ? 'Positive'
            : sentimentScore < -20
              ? 'Very Negative'
              : sentimentScore < -5
                ? 'Negative'
                : 'Neutral',
      sentimentScore,
      positivePercentage: (positiveKOLs / totalKOLs) * 100,
      negativePercentage: (negativeKOLs / totalKOLs) * 100,
      neutralPercentage: (neutralKOLs / totalKOLs) * 100,
      sentimentVolatility:
        Math.abs(sentimentScore) > 30
          ? 'High'
          : Math.abs(sentimentScore) > 15
            ? 'Medium'
            : 'Low',
      sentimentMomentum:
        avgMindshare > 5
          ? 'Positive'
          : avgMindshare > 2
            ? 'Neutral'
            : 'Negative',
    };

    const trendingAnalysis = {
      isTrending: totalKOLs > 10 && avgMindshare > 3,
      trendingScore: Math.min(100, totalKOLs * 2 + avgMindshare * 5),
      trendDirection:
        avgMindshare > 5
          ? 'Positive'
          : avgMindshare > 2
            ? 'Neutral'
            : 'Negative',
      trendFactors: [],
      viralPotential:
        totalKOLs > 50
          ? 'Very High'
          : totalKOLs > 20
            ? 'High'
            : totalKOLs > 10
              ? 'Medium'
              : 'Low',
      socialMomentum: `${totalKOLs} influencers actively discussing with ${avgMindshare.toFixed(2)}% average mindshare`,
    };

    const communityMood = {
      overallMood:
        sentimentScore > 20
          ? 'Highly optimistic with strong KOL engagement'
          : sentimentScore > 5
            ? 'Optimistic with growing influencer interest'
            : sentimentScore < -20
              ? 'Cautious — KOLs predominantly bearish'
              : sentimentScore < -5
                ? 'Mixed sentiment with uncertainty'
                : 'Neutral',
      communityStrength:
        totalKOLs > 30 ? 'High' : totalKOLs > 15 ? 'Medium' : 'Low',
      priceSentiment:
        sentimentScore > 5
          ? 'Bullish'
          : sentimentScore < -5
            ? 'Bearish'
            : 'Neutral',
      keyThemes: [],
      communityNickname: null,
    };

    return {
      kolEngagement,
      influencerAnalysis,
      sentimentBreakdown,
      trendingAnalysis,
      communityMood,
    };
  }

  // ── Fallback: derive sentiment/trending/mood from CoinGecko when DexCheck returns nothing ──
  private buildFallbackSentimentData(
    coinData: any,
    marketData: any,
  ): { sentimentBreakdown: any; trendingAnalysis: any; communityMood: any } {
    // sentimentBreakdown from CoinGecko community votes
    let sentimentBreakdown: any = null;
    const votesUp = coinData?.sentiment_votes_up_percentage ?? null;
    const votesDown = coinData?.sentiment_votes_down_percentage ?? null;

    if (votesUp !== null && votesDown !== null) {
      const overallSentiment =
        votesUp >= 60 ? 'Bullish' : votesUp >= 45 ? 'Neutral' : 'Bearish';
      sentimentBreakdown = {
        overallSentiment,
        sentimentScore: Math.round(votesUp),
        positivePercentage: parseFloat(votesUp.toFixed(2)),
        negativePercentage: parseFloat(votesDown.toFixed(2)),
        neutralPercentage: 0,
        sentimentVolatility: 'Low',
        sentimentMomentum:
          votesUp >= 60 ? 'Positive' : votesUp >= 45 ? 'Neutral' : 'Negative',
      };
      this.logger.log(
        `[Fallback] sentimentBreakdown derived from community votes: ${votesUp}% up / ${votesDown}% down`,
      );
    }

    // trendingAnalysis from price momentum
    let trendingAnalysis: any = null;
    const p24h = marketData?.price_change_24h ?? null;
    const p7d = marketData?.price_change_7d ?? null;

    if (p24h !== null || p7d !== null) {
      const score = Math.min(
        100,
        Math.max(0, Math.round(50 + (p24h ?? 0) * 2 + (p7d ?? 0) * 0.5)),
      );
      trendingAnalysis = {
        isTrending: score >= 55,
        trendingScore: score,
        trendDirection:
          (p7d ?? 0) > 5 ? 'Upward' : (p7d ?? 0) < -5 ? 'Downward' : 'Sideways',
        viralPotential: score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low',
        socialMomentum:
          (p24h ?? 0) > 5
            ? 'Accelerating'
            : (p24h ?? 0) > 0
              ? 'Stable'
              : 'Declining',
      };
      this.logger.log(
        `[Fallback] trendingAnalysis derived: score=${score}, direction=${trendingAnalysis.trendDirection}`,
      );
    }

    // communityMood from sentiment + community follower counts
    let communityMood: any = null;
    if (sentimentBreakdown) {
      const twitterFollowers = coinData?.community_data?.twitter_followers ?? 0;
      const redditSubs = coinData?.community_data?.reddit_subscribers ?? 0;
      const strength =
        twitterFollowers > 100_000 || redditSubs > 50_000
          ? 'Strong'
          : twitterFollowers > 10_000 || redditSubs > 5_000
            ? 'Moderate'
            : 'Weak';
      communityMood = {
        overallMood: sentimentBreakdown.overallSentiment,
        communityStrength: strength,
        priceSentiment: sentimentBreakdown.sentimentMomentum,
        keyThemes: [],
      };
    }

    return { sentimentBreakdown, trendingAnalysis, communityMood };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Full research: CoinGecko market data + DexCheck KOL mentions.
   * Called by the research_meme_coin tool.
   */
  async researchCoin(input: string): Promise<any> {
    this.logger.log(`Starting full sentiment research for: ${input}`);

    const { coinId, tokenName, tokenSymbol } = await this.resolveCoin(input);
    this.logger.log(
      `Resolved "${input}" → ${coinId} (${tokenName} / ${tokenSymbol})`,
    );

    const [coinData, kolMentions] = await Promise.all([
      getCoinGeckoData(coinId),
      getDexCheckKOLMentions(tokenSymbol, '7d'),
    ]);

    // If neither data source returned anything, the coin likely doesn't exist
    if (!coinData && (!kolMentions || kolMentions.length === 0)) {
      throw new Error(
        `Could not find any data for "${input}". Verify the coin name or ticker symbol is correct.`,
      );
    }

    const marketData = this.buildMarketData(coinData);
    const socialAccounts = this.buildSocialAccounts(coinData);
    let {
      kolEngagement,
      influencerAnalysis,
      sentimentBreakdown,
      trendingAnalysis,
      communityMood,
    } = this.buildKOLData(kolMentions, tokenSymbol);

    // When DexCheck returns nothing, derive sentiment/trending/mood from CoinGecko data
    if (!sentimentBreakdown || !trendingAnalysis || !communityMood) {
      const fallback = this.buildFallbackSentimentData(coinData, marketData);
      if (!sentimentBreakdown) sentimentBreakdown = fallback.sentimentBreakdown;
      if (!trendingAnalysis) trendingAnalysis = fallback.trendingAnalysis;
      if (!communityMood) communityMood = fallback.communityMood;
    }

    const insights: string[] = [];
    if (coinData) {
      const price = marketData.current_price;
      const mcap = marketData.market_cap;
      if (price) {
        // For tiny prices (meme coins), toLocaleString() rounds to "0".
        // Use toPrecision for sub-cent prices, toLocaleString for normal prices.
        const priceStr =
          price < 0.01
            ? `$${price.toPrecision(4)}`
            : `$${price.toLocaleString()}`;
        insights.push(`${tokenName} (${tokenSymbol}) trading at ${priceStr}`);
      }
      if (mcap) {
        const mcapStr =
          mcap >= 1e9
            ? `$${(mcap / 1e9).toFixed(2)}B`
            : mcap >= 1e6
              ? `$${(mcap / 1e6).toFixed(2)}M`
              : `$${mcap.toLocaleString()}`;
        insights.push(`Market cap: ${mcapStr}`);
      }
    }
    if (kolEngagement) {
      insights.push(
        `${kolEngagement.totalKOLs} influencers mentioned ${tokenSymbol} with ${kolEngagement.totalReach.toLocaleString()} total reach`,
      );
    }

    this.logger.log(`Full research completed for ${tokenName}`);

    return {
      tokenInfo: { name: tokenName, symbol: tokenSymbol, coinGeckoId: coinId },
      marketData,
      socialAccounts,
      kolEngagement,
      influencerAnalysis,
      sentimentBreakdown,
      trendingAnalysis,
      communityMood,
      insights,
      analysisTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Quick refresh: CoinGecko market data only (no DexCheck call).
   * Called by the refresh_coin_data tool.
   */
  async refreshCoin(input: string): Promise<any> {
    this.logger.log(`Quick refresh for: ${input}`);

    const { coinId, tokenName, tokenSymbol } = await this.resolveCoin(input);
    const coinData = await getCoinGeckoData(coinId);

    if (!coinData) {
      throw new Error(
        `Could not find data for "${input}" on CoinGecko. Verify the coin name or ticker symbol.`,
      );
    }

    const marketData = this.buildMarketData(coinData);
    const socialAccounts = this.buildSocialAccounts(coinData);

    return {
      tokenInfo: { name: tokenName, symbol: tokenSymbol, coinGeckoId: coinId },
      marketData,
      socialAccounts,
      insights: [],
      analysisTimestamp: new Date().toISOString(),
    };
  }
}
