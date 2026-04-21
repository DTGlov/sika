import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TIERS,
  MOMENTUM_AMOUNTS,
  type TierConfig,
  type TierId,
  type Momentum,
  type MomentumEventType,
  type MomentumUpdateResult,
} from '@/types/momentum';

export function calculateTier(points: number): TierConfig {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (points >= TIERS[i].minPoints) return TIERS[i];
  }
  return TIERS[0];
}

export function getNextTier(currentTierId: TierId): TierConfig | null {
  const idx = TIERS.findIndex(t => t.id === currentTierId);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
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
  const pointsInTier = totalPoints - tier.minPoints;
  const tierRange = nextTier.minPoints - tier.minPoints;
  const progressPercent = Math.min(100, (pointsInTier / tierRange) * 100);
  const pointsNeeded = nextTier.minPoints - totalPoints;
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
      .insert({ user_id: userId, total_points: 0, tier: 'seedling' })
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
    tier: newTier.id as TierId,
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
