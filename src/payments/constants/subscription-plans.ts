/**
 * Subscription Plans Configuration
 * Based on the new pricing structure for Individual Creators and Teams & Studios
 */

export interface SubscriptionPlanConfig {
  name: string;
  segment: 'Individual Creators' | 'Teams & Studios';
  monthlyPrice: number;
  monthlyCredits: number;
  yearlyPrice: number;
  yearlyCredits: number;
  idealUser: string;
}

/**
 * All subscription plans with their pricing and credit allocations
 */
export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanConfig> = {
  // Individual Creators Segment
  STARTER_REALM: {
    name: 'Starter Realm',
    segment: 'Individual Creators',
    monthlyPrice: 29,
    monthlyCredits: 2_500,
    yearlyPrice: 290,
    yearlyCredits: 30_000,
    idealUser: 'Students, hobbyists exploring 3D & game dev',
  },
  INDIE_BUILDER: {
    name: 'Indie Builder',
    segment: 'Individual Creators',
    monthlyPrice: 59,
    monthlyCredits: 7_500,
    yearlyPrice: 590,
    yearlyCredits: 90_000,
    idealUser: 'Indie developers, solo creators',
  },
  MASTER_CREATOR: {
    name: 'Master Creator',
    segment: 'Individual Creators',
    monthlyPrice: 99,
    monthlyCredits: 18_000,
    yearlyPrice: 990,
    yearlyCredits: 216_000,
    idealUser: 'Professional 3D artists, serious indie devs',
  },

  // Teams & Studios Segment
  DEV_STUDIO: {
    name: 'Dev Studio',
    segment: 'Teams & Studios',
    monthlyPrice: 149,
    monthlyCredits: 30_000,
    yearlyPrice: 1_490,
    yearlyCredits: 360_000,
    idealUser: 'Small studios, collaborative teams',
  },
  PRODUCTION_STUDIO: {
    name: 'Production Studio',
    segment: 'Teams & Studios',
    monthlyPrice: 219,
    monthlyCredits: 60_000,
    yearlyPrice: 2_190,
    yearlyCredits: 720_000,
    idealUser: 'Mid-size studios, production teams',
  },
  WORLD_ARCHITECT: {
    name: 'World Architect',
    segment: 'Teams & Studios',
    monthlyPrice: 299,
    monthlyCredits: 95_000,
    yearlyPrice: 2_990,
    yearlyCredits: 1_140_000,
    idealUser: 'Large studios, expansive game worlds',
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
 * Get credits for a subscription tier and billing period
 */
export function getSubscriptionCredits(
  tier: string,
  billingPeriod: 'MONTHLY' | 'YEARLY',
): number {
  const plan = SUBSCRIPTION_PLANS[tier];
  if (!plan) return 0;

  return billingPeriod === 'YEARLY' ? plan.yearlyCredits : plan.monthlyCredits;
}

/**
 * Get price for a subscription tier and billing period
 */
export function getSubscriptionPrice(
  tier: string,
  billingPeriod: 'MONTHLY' | 'YEARLY',
): number {
  const plan = SUBSCRIPTION_PLANS[tier];
  if (!plan) return 0;

  return billingPeriod === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
}

/**
 * Get all plans for a specific segment
 */
export function getPlansBySegment(
  segment: 'Individual Creators' | 'Teams & Studios',
): Record<string, SubscriptionPlanConfig> {
  return Object.entries(SUBSCRIPTION_PLANS)
    .filter(([_, plan]) => plan.segment === segment)
    .reduce((acc, [key, plan]) => ({ ...acc, [key]: plan }), {});
}

/**
 * Legacy constants for backward compatibility
 * @deprecated Use SUBSCRIPTION_PLANS instead
 */
export const MONTHLY_SUBSCRIPTION_BUILDER = 59; // INDIE_BUILDER
export const MONTHLY_BUILDER_CREDITS = 7_500;

export const YEARLY_SUBSCRIPTION_BUILDER = 590;
export const YEARLY_BUILDER_CREDITS = 90_000;

export const MONTHLY_SUBSCRIPTION_ARCHITECT = 299; // WORLD_ARCHITECT
export const MONTHLY_ARCHITECT_CREDITS = 95_000;

export const YEARLY_SUBSCRIPTION_ARCHITECT = 2_990;
export const YEARLY_ARCHITECT_CREDITS = 1_140_000;
