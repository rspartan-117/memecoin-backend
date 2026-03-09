/**
 * Web Search Tool (Parallel AI Search API)
 * Real-time web search for questions outside the stored report scope.
 * Fires for: coin history, founders, tokenomics, lore, recent news,
 * general DeFi/crypto concepts the stored report does not cover.
 */

import { Logger } from '@nestjs/common';

export interface WebSearchParams {
  query: string;
}

const logger = new Logger('WebSearchTool');

export const createWebSearchTool = (parallelApiKey: string) => ({
  id: 'search_web',
  name: 'Search Web',
  description:
    'Search the web for real-time or background information about a crypto token. Use ONLY when the stored report does not contain the answer AND the question is about: coin history, founders, tokenomics, lore, use case, recent news/events, or general crypto/DeFi concepts. Do NOT use for price, KOL, or sentiment data — those always come from the stored report.',

  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Natural language objective describing what to find. Always include the coin name. Examples: "Who created BONK meme coin and what is its origin story", "PEPE tokenomics and total supply explained", "recent DOGE news and developments 2025".',
      },
    },
    required: ['query'],
  },

  execute: async (params: WebSearchParams): Promise<string> => {
    if (!parallelApiKey) {
      logger.warn('PARALLEL_AI_API_KEY is not configured — web search unavailable');
      return JSON.stringify({
        success: false,
        error: 'Web search is not configured on this server.',
      });
    }

    logger.log(`Web search: "${params.query}"`);

    try {
      // Build 2 complementary search queries from the objective
      const searchQueries = [
        params.query,
        `${params.query} explained overview`,
      ];

      const response = await fetch('https://api.parallel.ai/v1beta/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': parallelApiKey,
          'parallel-beta': 'search-extract-2025-10-10',
        },
        body: JSON.stringify({
          objective: params.query,
          search_queries: searchQueries,
          max_results: 5,
          excerpts: {
            max_chars_per_result: 3000,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(
          `Parallel AI Search error: ${response.status} ${response.statusText} — ${errText}`,
        );
        return JSON.stringify({
          success: false,
          query: params.query,
          error: `Search API returned ${response.status}: ${response.statusText}`,
        });
      }

      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        logger.log(`No results found for: "${params.query}"`);
        return JSON.stringify({
          success: false,
          query: params.query,
          message: 'No web results found for this query.',
        });
      }

      const hits = data.results.map((r: any) => ({
        title: r.title ?? null,
        url: r.url ?? null,
        publishedDate: r.publish_date ?? null,
        // Parallel AI returns excerpts as an array — join them into one block
        snippet: Array.isArray(r.excerpts)
          ? r.excerpts.join('\n\n').slice(0, 3000)
          : (r.excerpts ?? null),
      }));

      logger.log(
        `Web search returned ${hits.length} result(s) for: "${params.query}"`,
      );

      return JSON.stringify(
        {
          success: true,
          query: params.query,
          resultCount: hits.length,
          results: hits,
        },
        null,
        2,
      );
    } catch (error: any) {
      logger.error(`Web search failed for "${params.query}":`, error.message);
      return JSON.stringify({
        success: false,
        query: params.query,
        error: error.message,
      });
    }
  },
});
