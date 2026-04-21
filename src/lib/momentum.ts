import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TIERS,
  TIER_ORDER,
  MOMENTUM_AMOUNTS,
  type Tier,
  type TierConfig,
  type Momentum,
  type MomentumEventType,
  type MomentumUpdateResult,
} from '@/types/momentum';

const TIERS_LIST = TIER_ORDER.map(id => TIERS[id]);

export function calculateTier(points: number): TierConfig {
  for (let i = TIERS_LIST.length - 1; i >= 0; i--) {
    if (points >= TIERS_LIST[i].threshold) return TIERS_LIST[i];
  }
  return TIERS_LIST[0];
}

export function getNextTier(currentTierId: Tier): TierConfig | null {
  const idx = TIER_ORDER.indexOf(currentTierId);
  return idx < TIER_ORDER.length - 1 ? TIERS[TIER_ORDER[idx + 1]] : null;
}

export function getTierProgress(totalPoints: number): {
  tier: TierConfig;
  nextTier: TierConfig | null;
  progressPercent: number;
  pointsInTier: number;
  pointsNeeded: number;
} {
  const tier = calculateTier(totalPoints);
  const nextTier = getNextTier(tier.id);
  if (!nextTier) {
    return { tier, nextTier: null, progressPercent: 100, pointsInTier: 0, pointsNeeded: 0 };
  }
  const pointsInTier = totalPoints - tier.threshold;
  const tierRange = nextTier.threshold - tier.threshold;
  const progressPercent = Math.min(100, (pointsInTier / tierRange) * 100);
  const pointsNeeded = nextTier.threshold - totalPoints;
  return { tier, nextTier, progressPercent, pointsInTier, pointsNeeded };
}

export async function awardMomentum(
  supabase: SupabaseClient,
  userId: string,
  eventType: MomentumEventType
): Promise<MomentumUpdateResult> {
  const points = MOMENTUM_AMOUNTS[eventType];

  // Fetch or create momentum row
  let { data: existing } = await supabase
    .from('momentum')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!existing) {
    const { data: created } = await supabase
      .from('momentum')
      .insert({ user_id: userId, total_points: 0, tier: 'bronze' })
      .select('*')
      .single();
    existing = created;
  }

  const previousTotal = existing?.total_points ?? 0;
  const previousTier = calculateTier(previousTotal);
  const newTotal = previousTotal + points;
  const newTier = calculateTier(newTotal);
  const tierChanged = newTier.id !== previousTier.id;

  const [momentumRes] = await Promise.all([
    supabase
      .from('momentum')
      .upsert({ user_id: userId, total_points: newTotal, tier: newTier.id, updated_at: new Date().toISOString() })
      .select('*')
      .single(),
    supabase
      .from('momentum_events')
      .insert({ user_id: userId, event_type: eventType, points }),
  ]);

  const momentum: Momentum = (momentumRes.data as Momentum) ?? {
    user_id: userId,
    total_points: newTotal,
    tier: newTier.id as Tier,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    momentum,
    points_awarded: points,
    previous_total: previousTotal,
    tier_changed: tierChanged,
    new_tier: newTier,
    previous_tier: previousTier,
  };
}
