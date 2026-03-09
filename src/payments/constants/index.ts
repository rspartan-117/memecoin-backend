// Re-export subscription plans and utilities
export * from './subscription-plans';

// Re-export tier hierarchy utilities
// export * from './tier-hierarchy';

// Re-export blockchain utilities
export * from './blockchains';

export const FREE_CREDITS = 100;

// Credit conversion rates
export const CREDIT_PER_DOLLAR = 200;
export const CREDIT_PER_DOLLAR_TOP_UP = 240;
export const CREDIT_PER_DOLLAR_PAY_AS_YOU_GO = 200;

// Pay-as-you-go and Top-up pricing
export const PAY_AS_YOU_GO_PRICE = 1;
export const TOP_UP_PRICE = 1;

/**
 * Plan pricing quick-reference (USD/month)
 */
export const PLAN_PRICES = {
  STARTER: 19,
  CREATOR: 29,
  PRO: 49,
  STUDIO: 99,
} as const;
