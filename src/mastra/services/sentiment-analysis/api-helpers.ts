import axios from 'axios';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENOTFOUND',
]);

function isRetryable(err: any): boolean {
  return RETRYABLE_CODES.has(err?.code);
}

// ── CoinGecko ────────────────────────────────────────────────────────────────

async function makeCoinGeckoRequest(
  endpoint: string,
  params: Record<string, any> = {},
  attempt = 0,
): Promise<any> {
  const apiKey = process.env.COIN_GECKO_API_KEY;
  const url = `https://api.coingecko.com/api/v3${endpoint}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  try {
    const response = await axios.get(url, {
      params,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (err: any) {
    if (attempt < MAX_RETRIES && isRetryable(err)) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 600));
      return makeCoinGeckoRequest(endpoint, params, attempt + 1);
    }
    throw err;
  }
}

// ── Coins list cache ──────────────────────────────────────────────────────────
// CoinGecko docs recommend /coins/list as the reliable way to resolve coin IDs.
// The /search endpoint uses different CDN rules and can be blocked/rate-limited;
// /coins/list is a plain data feed with no bot-protection filtering.
interface CoinListEntry {
  id: string;
  symbol: string;
  name: string;
}
let coinsListCache: { coins: CoinListEntry[]; cachedAt: number } | null = null;
const COINS_LIST_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

async function getFullCoinsList(): Promise<CoinListEntry[]> {
  const now = Date.now();
  if (coinsListCache && now - coinsListCache.cachedAt < COINS_LIST_TTL_MS) {
    return coinsListCache.coins;
  }
  const coins = await makeCoinGeckoRequest('/coins/list');
  coinsListCache = { coins, cachedAt: now };
  return coins;
}

/**
 * Search CoinGecko for a coin by name or symbol.
 *
 * Strategy (per CoinGecko docs — "obtain coin id via /coins/list"):
 *   1. Try /search first (fast, market-cap sorted, but CDN-filtered).
 *   2. On failure, fall back to scanning the full /coins/list (cached 2h).
 */
export async function searchCoinGecko(query: string): Promise<any[]> {
  // 1. Try /search
  try {
    const data = await makeCoinGeckoRequest('/search', { query });
    if (data.coins?.length) return data.coins;
  } catch (err: any) {
    console.warn(
      `[api-helpers] CoinGecko /search failed for "${query}" (${err?.code}) — falling back to /coins/list`,
    );
  }

  // 2. Fallback: scan the full coins list (cached in-process for 2h)
  try {
    const list = await getFullCoinsList();
    const q = query.toLowerCase();
    const matches = list.filter(
      (c) => c.name.toLowerCase() === q || c.symbol.toLowerCase() === q,
    );
    return matches; // same shape used by resolveCoin: {id, symbol, name}
  } catch (listErr: any) {
    console.warn(
      `[api-helpers] CoinGecko /coins/list fallback failed for "${query}" (${listErr?.code})`,
    );
    return [];
  }
}

/** Fetch full coin data from CoinGecko by coin ID. */
export async function getCoinGeckoData(coinId: string): Promise<any | null> {
  try {
    return await makeCoinGeckoRequest(`/coins/${coinId}`, {
      localization: false,
      tickers: false,
      market_data: true,
      community_data: true,
      developer_data: true,
      sparkline: false,
    });
  } catch (err) {
    console.warn(`[api-helpers] CoinGecko data failed for "${coinId}":`, err);
    return null;
  }
}

// ── DexCheck ─────────────────────────────────────────────────────────────────

async function makeDexCheckRequest(
  endpoint: string,
  params: Record<string, any> = {},
  attempt = 0,
): Promise<any> {
  const apiKey = process.env.DEXCHECK_API_KEY;
  const url = `https://api.dexcheck.ai/api/v1${endpoint}`;

  const headers: Record<string, string> = { Accept: '*/*' };
  if (apiKey) headers['x-api-key'] = apiKey;

  try {
    const response = await axios.get(url, {
      params,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (err: any) {
    if (attempt < MAX_RETRIES && isRetryable(err)) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 600));
      return makeDexCheckRequest(endpoint, params, attempt + 1);
    }
    throw err;
  }
}

/** Fetch KOL token mentions from DexCheck by token symbol. */
export async function getDexCheckKOLMentions(
  tokenSymbol: string,
  duration: '1d' | '7d' | '30d' = '7d',
): Promise<any[] | null> {
  try {
    const data = await makeDexCheckRequest('/twitter/token-mentions', {
      token_symbol: tokenSymbol,
      duration,
      page: 1,
    });
    // DexCheck may return the array directly OR wrapped in { data: [...] }
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.mentions)) return data.mentions;
    return null;
  } catch (err) {
    console.warn(
      `[api-helpers] DexCheck KOL mentions failed for "${tokenSymbol}":`,
      err,
    );
    return null;
  }
}
