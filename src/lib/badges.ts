import type { SupabaseClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { getCycleForDate, getCycleAtOffset } from '@/lib/cycle';
import { fetchGoalAmounts } from '@/lib/goals';
import type { UserBadge, BadgeId } from '@/types/badge';

export type BadgeTrigger =
  | 'transaction_logged'
  | 'streak_updated'
  | 'goal_completed'
  | 'contribution_made'
  | 'account_reconciled'
  | 'cycle_ended';

const TRIGGER_BADGES: Record<BadgeTrigger, BadgeId[]> = {
  transaction_logged:  ['first_steps', 'century_club'],
  streak_updated:      ['week_warrior', 'consistent_saver', 'month_of_discipline'],
  goal_completed:      ['goal_getter', 'seeker'],
  contribution_made:   ['safety_net'],
  account_reconciled:  [],
  cycle_ended:         ['safety_net'],
};

async function checkBadgeCondition(
  supabase: SupabaseClient,
  userId: string,
  badgeId: BadgeId
): Promise<boolean> {
  switch (badgeId) {
    case 'first_steps': {
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      return (count ?? 0) >= 1;
    }

    case 'century_club': {
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      return (count ?? 0) >= 100;
    }

    case 'week_warrior': {
      const { data } = await supabase
        .from('streaks')
        .select('logging_current')
        .eq('user_id', userId)
        .single();
      return (data?.logging_current ?? 0) >= 7;
    }

    case 'consistent_saver': {
      const { data } = await supabase
        .from('streaks')
        .select('savings_current')
        .eq('user_id', userId)
        .single();
      return (data?.savings_current ?? 0) >= 4;
    }

    case 'month_of_discipline': {
      const { data } = await supabase
        .from('streaks')
        .select('logging_current')
        .eq('user_id', userId)
        .single();
      return (data?.logging_current ?? 0) >= 30;
    }

    case 'goal_getter': {
      const { count } = await supabase
        .from('goals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('goal_type', 'target')
        .not('completed_at', 'is', null);
      return (count ?? 0) >= 1;
    }

    case 'seeker': {
      const { count } = await supabase
        .from('goals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('goal_type', 'target')
        .not('completed_at', 'is', null);
      return (count ?? 0) >= 5;
    }

    case 'safety_net':
      return checkSafetyNet(supabase, userId);

    default:
      return false;
  }
}

async function checkSafetyNet(supabase: SupabaseClient, userId: string): Promise<boolean> {
  // Find Life Savings perpetual goal
  const { data: goals } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId)
    .eq('goal_type', 'perpetual')
    .ilike('name', 'life savings')
    .limit(1);

  const lifeSavingsGoal = goals?.[0];
  if (!lifeSavingsGoal) return false;

  const { net: lifeSavingsBalance } = await fetchGoalAmounts(supabase, lifeSavingsGoal.id);
  if (lifeSavingsBalance <= 0) return false;

  // Get user profile for cycle_start_day
  const { data: profile } = await supabase
    .from('profiles')
    .select('cycle_start_day')
    .eq('id', userId)
    .single();

  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const today = new Date();

  // Collect up to 3 completed cycles' Needs spending
  const needsAmounts: number[] = [];
  for (let offset = -1; offset >= -3; offset--) {
    const cycle = getCycleAtOffset(today, cycleStartDay, offset);
    const { data: txns } = await supabase
      .from('transactions')
      .select('amount, category:categories!category_id(bucket:budget_buckets(name))')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('transaction_date', format(cycle.start, 'yyyy-MM-dd'))
      .lte('transaction_date', format(cycle.end, 'yyyy-MM-dd'));

    if (txns && txns.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const needsTotal = (txns as any[])
        .filter((t: any) => t.category?.bucket?.name === 'needs')
        .reduce((s: number, t: any) => s + t.amount, 0);
      needsAmounts.push(needsTotal);
    }
  }

  if (needsAmounts.length === 0) return false;

  const avgNeeds = needsAmounts.reduce((s, n) => s + n, 0) / needsAmounts.length;
  if (avgNeeds <= 0) return false;

  return lifeSavingsBalance >= 3 * avgNeeds;
}

/**
 * Check badge conditions for a given trigger and unlock any newly earned badges.
 * Idempotent — already-unlocked badges are ignored via DB unique constraint.
 */
export async function checkAndUnlockBadges(
  supabase: SupabaseClient,
  userId: string,
  trigger: BadgeTrigger
): Promise<{ newlyUnlocked: UserBadge[] }> {
  const badgesToCheck = TRIGGER_BADGES[trigger];
  if (badgesToCheck.length === 0) return { newlyUnlocked: [] };

  // Fetch already-unlocked badge IDs
  const { data: existing } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', userId);

  const unlockedIds = new Set((existing ?? []).map((r: { badge_id: string }) => r.badge_id));

  // Check conditions for not-yet-unlocked badges
  const candidates = badgesToCheck.filter(id => !unlockedIds.has(id));
  if (candidates.length === 0) return { newlyUnlocked: [] };

  const results = await Promise.all(
    candidates.map(async badgeId => ({
      badgeId,
      earned: await checkBadgeCondition(supabase, userId, badgeId),
    }))
  );

  const toUnlock = results.filter(r => r.earned).map(r => r.badgeId);
  if (toUnlock.length === 0) return { newlyUnlocked: [] };

  const { data: inserted } = await supabase
    .from('user_badges')
    .insert(toUnlock.map(badge_id => ({ user_id: userId, badge_id })))
    .select('*');

  return { newlyUnlocked: (inserted as UserBadge[]) ?? [] };
}

/** Fetch any user_badges where celebration_shown = false. */
export async function fetchPendingCelebrations(
  supabase: SupabaseClient,
  userId: string
): Promise<UserBadge[]> {
  const { data } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .eq('celebration_shown', false)
    .order('unlocked_at', { ascending: true });
  return (data as UserBadge[]) ?? [];
}

/** Mark a user_badge celebration as shown so it doesn't re-fire. */
export async function markCelebrationShown(
  supabase: SupabaseClient,
  userBadgeId: string
): Promise<void> {
  await supabase
    .from('user_badges')
    .update({ celebration_shown: true })
    .eq('id', userBadgeId);
}
