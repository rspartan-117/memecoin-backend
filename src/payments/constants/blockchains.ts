import {
  getNetworkByName,
  validateAndNormalizeNetwork,
} from '../../shared/config/network.config';

// ============================================
// PAYMENT-SPECIFIC BLOCKCHAIN ENUMS
// ============================================

/**
 * Legacy blockchain codes - kept for backward compatibility
 * New code should use network.config.ts
 */
export enum SupportedBlockchainCode {
  ETHEREUM = 'eth',
  BINANCE_SMART_CHAIN = 'bsc',
  POLYGON = 'pgn',
  ARBITRUM_ONE = 'arb',
  BASE = 'base',
  SOLANA = 'sol',
}

export const SUPPORTED_BLOCKCHAIN_CODES = Object.values(
  SupportedBlockchainCode,
);

export interface BlockchainConfig {
  code: SupportedBlockchainCode;
  name: string;
  chainId: number | null;
  isEvm: boolean;
  decimals: number;
}

export const BLOCKCHAIN_CONFIGS: Record<
  SupportedBlockchainCode,
  BlockchainConfig
> = {
  [SupportedBlockchainCode.ETHEREUM]: {
    code: SupportedBlockchainCode.ETHEREUM,
    name: 'Ethereum',
    chainId: 1,
    isEvm: true,
    decimals: 6,
  },
  [SupportedBlockchainCode.BINANCE_SMART_CHAIN]: {
    code: SupportedBlockchainCode.BINANCE_SMART_CHAIN,
    name: 'Binance Smart Chain',
    chainId: 56,
    isEvm: true,
    decimals: 18,
  },
  [SupportedBlockchainCode.POLYGON]: {
    code: SupportedBlockchainCode.POLYGON,
    name: 'Polygon',
    chainId: 137,
    isEvm: true,
    decimals: 6,
  },
  [SupportedBlockchainCode.ARBITRUM_ONE]: {
    code: SupportedBlockchainCode.ARBITRUM_ONE,
    name: 'Arbitrum One',
    chainId: 42161,
    isEvm: true,
    decimals: 6,
  },
  [SupportedBlockchainCode.BASE]: {
    code: SupportedBlockchainCode.BASE,
    name: 'Base',
    chainId: 8453,
    isEvm: true,
    decimals: 6,
  },
  [SupportedBlockchainCode.SOLANA]: {
    code: SupportedBlockchainCode.SOLANA,
    name: 'Solana',
    chainId: null,
    isEvm: false,
    decimals: 6,
  },
};

export const isValidBlockchainCode = (
  code: string,
): code is SupportedBlockchainCode => {
  return SUPPORTED_BLOCKCHAIN_CODES.includes(code as SupportedBlockchainCode);
};

export const getBlockchainConfig = (
  code: SupportedBlockchainCode,
): BlockchainConfig => {
  return BLOCKCHAIN_CONFIGS[code];
};

// ============================================
// TRANSACTION FIELD UTILITIES (using network.config.ts)
// ============================================

/**
 * Normalize blockchain identifier from various sources (Atlos, X402, etc.)
 * Leverages network.config.ts for consistency
 */
export function normalizeBlockchainName(blockchain: string): string {
  if (!blockchain) return 'unknown';

  // Map common variations to network.config.ts names
  const mappings: Record<string, string> = {
    sol: 'solana',
    eth: 'ethereum',
    arb: 'arbitrum',
    pgn: 'polygon',
    matic: 'polygon',
    bnb: 'bsc',
  };

  const normalized = blockchain.toLowerCase().trim();
  const mapped = mappings[normalized] || normalized;

  // Use network.config.ts validation
  return validateAndNormalizeNetwork(mapped);
}

/**
 * Get numeric chain ID for EVM chains, or blockchain name for non-EVM
 * Returns string representation for storage in chainId field
 * Uses network.config.ts as source of truth
 */
export function getStandardChainId(blockchain: string): string {
  const normalized = normalizeBlockchainName(blockchain);
  const network = getNetworkByName(normalized);

  if (!network) {
    // Fallback for unknown networks
    return normalized;
  }

  // Return numeric chainId for EVM chains, blockchain name for others
  if (network.type === 'evm' && network.chainId) {
    return network.chainId.toString();
  }

  // For Solana and other non-EVM chains, return the blockchain name
  return normalized;
}

/**
 * Get chain type (ETHEREUM or SOLANA)
 * Uses network.config.ts network type
 */
export function getChainType(blockchain: string): 'ETHEREUM' | 'SOLANA' {
  const normalized = normalizeBlockchainName(blockchain);
  const network = getNetworkByName(normalized);

  if (!network) {
    // Fallback: assume Solana if name contains 'solana'
    return normalized.includes('solana') ? 'SOLANA' : 'ETHEREUM';
  }

  return network.type === 'solana' ? 'SOLANA' : 'ETHEREUM';
}

/**
 * Get USDC token address for a blockchain
 * Uses network.config.ts configuration
 */
export function getUSDCTokenAddress(blockchain: string): string {
  const normalized = normalizeBlockchainName(blockchain);
  const network = getNetworkByName(normalized);

  return network?.usdcTokenAddress || '';
}

/**
 * Get blockchain network name in standard format
 * Uses network.config.ts displayName
 */
export function getBlockchainDisplayName(blockchain: string): string {
  const normalized = normalizeBlockchainName(blockchain);
  const network = getNetworkByName(normalized);

  return network?.displayName || normalized;
}

/**
 * Create standardized transaction blockchain data
 * This ensures consistency across all payment methods (X402, ATLOS, etc.)
 */
export interface StandardizedBlockchainData {
  chainId: string; // Numeric chainId for EVM (as string), blockchain name for non-EVM
  chainType: 'ETHEREUM' | 'SOLANA';
  blockchainNetwork: string; // Standard lowercase name (e.g., 'base', 'solana')
  tokenAddress: string; // Actual USDC contract address or empty
  tokenDecimals: number; // Usually 6 for USDC
  tokenSymbol: string; // Usually 'USDC'
}

export function getStandardizedBlockchainData(
  blockchain: string,
  tokenSymbol: string = 'USDC',
): StandardizedBlockchainData {
  const normalized = normalizeBlockchainName(blockchain);

  return {
    chainId: getStandardChainId(blockchain),
    chainType: getChainType(blockchain),
    blockchainNetwork: normalized,
    tokenAddress: getUSDCTokenAddress(blockchain),
    tokenDecimals: 6, // USDC standard
    tokenSymbol: tokenSymbol || 'USDC',
  };
}
