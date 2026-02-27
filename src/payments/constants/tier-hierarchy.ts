/**
 * Subscription Tier Hierarchy
 * Defines the order of tiers for upgrade/downgrade validation
 */

export enum TierLevel {
  FREE = 0,
  STARTER_REALM = 1,
  INDIE_BUILDER = 2,
  MASTER_CREATOR = 3,
  DEV_STUDIO = 4,
  PRODUCTION_STUDIO = 5,
  WORLD_ARCHITECT = 6,
}

/**
 * Get the numeric level of a subscription tier
 */
export function getTierLevel(tier: string): number {
  return TierLevel[tier as keyof typeof TierLevel] ?? 0;
}

/**
 * Check if an upgrade from sourceTier to targetTier is valid
 * (target must be higher than source)
 */
export function isValidUpgrade(sourceTier: string, targetTier: string): boolean {
  const sourceLevel = getTierLevel(sourceTier);
  const targetLevel = getTierLevel(targetTier);
  
  return targetLevel > sourceLevel;
}

/**
 * Check if a downgrade from sourceTier to targetTier is valid
 * (target must be lower than source)
 */
export function isValidDowngrade(sourceTier: string, targetTier: string): boolean {
  const sourceLevel = getTierLevel(sourceTier);
  const targetLevel = getTierLevel(targetTier);
  
  return targetLevel < sourceLevel;
}

/**
 * Get the tier name from level
 */
export function getTierNameFromLevel(level: number): string | null {
  const entry = Object.entries(TierLevel).find(([_, value]) => value === level);
  return entry ? entry[0] : null;
}

/**
 * Get all tiers that are valid upgrade targets from the given tier
 */
export function getValidUpgradeTiers(currentTier: string): string[] {
  const currentLevel = getTierLevel(currentTier);
  const upgradeTiers: string[] = [];
  
  for (const [tier, level] of Object.entries(TierLevel)) {
    if (typeof level === 'number' && level > currentLevel) {
      upgradeTiers.push(tier);
    }
  }
  
  return upgradeTiers;
}

/**
 * Get the tier hierarchy as a sorted array
 */
export function getTierHierarchy(): Array<{ tier: string; level: number }> {
  return Object.entries(TierLevel)
    .filter(([_, value]) => typeof value === 'number')
    .map(([tier, level]) => ({ tier, level: level as number }))
    .sort((a, b) => a.level - b.level);
}
