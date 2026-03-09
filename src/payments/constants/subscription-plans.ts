/**
 * Subscription Plans Configuration
 *
 * 4 tiers: Starter ($19) · Creator ($29) · Pro ($49) · Studio ($99)
 * Credit-per-dollar ratio increases at higher tiers to reward commitment.
 * Yearly pricing = 10× monthly price (≈ 2 months free).
 */

export interface SubscriptionPlanConfig {
  name: string;
  monthlyPrice: number;
  monthlyCredits: number;
  yearlyPrice: number;
  yearlyCredits: number;
  idealUser: string;
}

/**
 * All subscription plans with their pricing and credit allocations
 *
 * | Tier    | $/mo | Credits/mo | Credits/$ | $/yr | Credits/yr |
 * |---------|------|-----------|-----------|------|------------|
 * | STARTER |  19  |   2,000   |   ~105    | 190  |   20,000   |
 * | CREATOR |  29  |   4,000   |   ~138    | 290  |   40,000   |
 * | PRO     |  49  |   8,000   |   ~163    | 490  |   80,000   |
 * | STUDIO  |  99  |  20,000   |   ~202    | 990  |  200,000   |
 */
export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
  STARTER: {
    name: 'Starter',
    monthlyPrice: 19,
    monthlyCredits: 2_000,
    yearlyPrice: 190,
    yearlyCredits: 20_000,
    idealUser: 'Students, hobbyists exploring game dev',
  },
  CREATOR: {
    name: 'Creator',
    monthlyPrice: 29,
    monthlyCredits: 4_000,
    yearlyPrice: 290,
    yearlyCredits: 40_000,
    idealUser: 'Indie developers, solo creators',
  },
  PRO: {
    name: 'Pro',
    monthlyPrice: 49,
    monthlyCredits: 8_000,
    yearlyPrice: 490,
    yearlyCredits: 80_000,
    idealUser: 'Professional creators, serious indie devs',
  },
  STUDIO: {
    name: 'Studio',
    monthlyPrice: 99,
    monthlyCredits: 20_000,
    yearlyPrice: 990,
    yearlyCredits: 200_000,
    idealUser: 'Teams, studios, production workloads',
  },
};

/**
 * Get subscription plan configuration by tier
 */
export function getSubscriptionPlanConfig(
  tier: string,
): SubscriptionPlanConfig | null {
  return SUBSCRIPTION_PLANS[tier] || null;
}

/**
 * Get subscription credits based on tier and billing period
 */
export function getSubscriptionCredits(
  tier: string | { toString(): string },
  billingPeriod: string | { toString(): string },
): number {
  const tierStr = typeof tier === 'string' ? tier : tier.toString();
  const periodStr =
    typeof billingPeriod === 'string'
      ? billingPeriod
      : billingPeriod.toString();

  const plan = SUBSCRIPTION_PLANS[tierStr.toUpperCase()];
  if (!plan) {
    throw new Error(`Unknown subscription tier: ${tierStr}`);
  }

  const isYearly = periodStr.toUpperCase() === 'YEARLY';
  return isYearly ? plan.yearlyCredits : plan.monthlyCredits;
}
/**
 * Get subscription price based on tier and billing period
 */
export function getSubscriptionPrice(
  tier: string | { toString(): string },
  billingPeriod: string | { toString(): string },
): number {
  const tierStr = typeof tier === 'string' ? tier : tier.toString();
  const periodStr =
    typeof billingPeriod === 'string'
      ? billingPeriod
      : billingPeriod.toString();

  const plan = SUBSCRIPTION_PLANS[tierStr.toUpperCase()];
  if (!plan) {
    throw new Error(`Unknown subscription tier: ${tierStr}`);
  }

  const isYearly = periodStr.toUpperCase() === 'YEARLY';
  return isYearly ? plan.yearlyPrice : plan.monthlyPrice;
}
/**
 * Get all available subscription plans
 */
export function getAllSubscriptionPlans(): SubscriptionPlanConfig[] {
  return Object.values(SUBSCRIPTION_PLANS);
}

/**
 * Check if a tier exists
 */
export function isValidSubscriptionTier(tier: string): boolean {
  return tier.toUpperCase() in SUBSCRIPTION_PLANS;
}
