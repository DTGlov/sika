import type { SupabaseClient } from '@supabase/supabase-js';
import type { Streaks, StreakUpdateResult } from '@/types/streak';

const LOGGING_MILESTONES = [7, 14, 30, 60, 100];
const SAVINGS_MILESTONES = [4, 12, 26, 52];
const MAX_FREEZES = 2;

// ── Date helpers ─────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

/** Returns the UTC Monday of the ISO week containing d (YYYY-MM-DD). */
function getMondayStr(d = new Date()): string {
  const day = d.getUTCDay(); // 0=Sunday
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().split('T')[0];
}

function weeksBetween(a: string, b: string): number {
  return Math.round(daysBetween(a, b) / 7);
}

// ── Helpers ──────────────────────────────────────────────────────

function emptyStreaks(userId: string): Streaks {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    logging_current: 0,
    logging_longest: 0,
    logging_last_date: null,
    savings_current: 0,
    savings_longest: 0,
    savings_last_week: null,
    freezes_banked: 0,
    freezes_earned_total: 0,
    logging_milestones_shown: [],
    savings_milestones_shown: [],
    created_at: now,
    updated_at: now,
  };
}

async function fetchOrCreateStreaks(
  supabase: SupabaseClient,
  userId: string
): Promise<Streaks> {
  const { data } = await supabase
    .from('streaks')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (data) return data as Streaks;

  // Row missing — create it (handles very early users)
  const { data: created } = await supabase
    .from('streaks')
    .insert({ user_id: userId })
    .select('*')
    .single();
  return (created as Streaks) ?? emptyStreaks(userId);
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Called after a user-initiated transaction insert (all types count).
 * NOT called for auto-generated recurring transactions.
 */
export async function updateLoggingStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<StreakUpdateResult> {
  const streaks = await fetchOrCreateStreaks(supabase, userId);
  const today = todayStr();

  const result: StreakUpdateResult = {
    streaks,
    logging_incremented: false,
    logging_broken: false,
    savings_incremented: false,
    savings_broken: false,
    freeze_used: false,
    freeze_earned: false,
    milestone_hit: null,
  };

  // Already logged today — no-op
  if (streaks.logging_last_date === today) return result;

  const updates: Partial<Streaks> = { logging_last_date: today };
  let newCurrent = streaks.logging_current;
  let newFreezesBanked = streaks.freezes_banked;
  let newFreezesEarned = streaks.freezes_earned_total;
  const newMilestonesShown = [...streaks.logging_milestones_shown];

  if (!streaks.logging_last_date) {
    // First ever log
    newCurrent = 1;
    result.logging_incremented = true;
  } else {
    const gap = daysBetween(streaks.logging_last_date, today);

    if (gap === 1) {
      // Consecutive day
      newCurrent += 1;
      result.logging_incremented = true;
    } else {
      // Gap ≥ 2: need (gap - 1) freezes to survive
      const freezesNeeded = gap - 1;
      if (streaks.freezes_banked >= freezesNeeded) {
        newFreezesBanked -= freezesNeeded;
        newCurrent += 1;
        result.logging_incremented = true;
        result.freeze_used = true;
      } else {
        // Streak broken — today starts a new 1-day streak
        newCurrent = 1;
        newFreezesBanked = 0;
        result.logging_broken = true;
        result.logging_incremented = true;
      }
    }
  }

  // Earn freeze at every 10-day milestone (max MAX_FREEZES banked)
  if (newCurrent > 0 && newCurrent % 10 === 0 && newFreezesBanked < MAX_FREEZES) {
    newFreezesBanked = Math.min(MAX_FREEZES, newFreezesBanked + 1);
    newFreezesEarned += 1;
    result.freeze_earned = true;
  }

  const newLongest = Math.max(streaks.logging_longest, newCurrent);

  // Check milestones
  const hitMilestone = LOGGING_MILESTONES.find(
    m => newCurrent === m && !newMilestonesShown.includes(m)
  );
  if (hitMilestone) {
    newMilestonesShown.push(hitMilestone);
    result.milestone_hit = hitMilestone;
  }

  Object.assign(updates, {
    logging_current: newCurrent,
    logging_longest: newLongest,
    freezes_banked: newFreezesBanked,
    freezes_earned_total: newFreezesEarned,
    logging_milestones_shown: newMilestonesShown,
  });

  const { data: updated } = await supabase
    .from('streaks')
    .update(updates)
    .eq('user_id', userId)
    .select('*')
    .single();

  result.streaks = (updated as Streaks) ?? { ...streaks, ...updates };
  return result;
}

/**
 * Called after a goal contribution is successfully inserted.
 */
export async function updateSavingsStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<StreakUpdateResult> {
  const streaks = await fetchOrCreateStreaks(supabase, userId);
  const thisMonday = getMondayStr();

  const result: StreakUpdateResult = {
    streaks,
    logging_incremented: false,
    logging_broken: false,
    savings_incremented: false,
    savings_broken: false,
    freeze_used: false,
    freeze_earned: false,
    milestone_hit: null,
  };

  // Already contributed this week — no-op
  if (streaks.savings_last_week === thisMonday) return result;

  const updates: Partial<Streaks> = { savings_last_week: thisMonday };
  let newCurrent = streaks.savings_current;
  let newFreezesBanked = streaks.freezes_banked;
  const newMilestonesShown = [...streaks.savings_milestones_shown];

  if (!streaks.savings_last_week) {
    newCurrent = 1;
    result.savings_incremented = true;
  } else {
    const gap = weeksBetween(streaks.savings_last_week, thisMonday);

    if (gap === 1) {
      newCurrent += 1;
      result.savings_incremented = true;
    } else {
      const freezesNeeded = gap - 1;
      if (streaks.freezes_banked >= freezesNeeded) {
        newFreezesBanked -= freezesNeeded;
        newCurrent += 1;
        result.savings_incremented = true;
        result.freeze_used = true;
      } else {
        newCurrent = 1;
        newFreezesBanked = 0;
        result.savings_broken = true;
        result.savings_incremented = true;
      }
    }
  }

  const newLongest = Math.max(streaks.savings_longest, newCurrent);

  const hitMilestone = SAVINGS_MILESTONES.find(
    m => newCurrent === m && !newMilestonesShown.includes(m)
  );
  if (hitMilestone) {
    newMilestonesShown.push(hitMilestone);
    result.milestone_hit = hitMilestone;
  }

  Object.assign(updates, {
    savings_current: newCurrent,
    savings_longest: newLongest,
    freezes_banked: newFreezesBanked,
    savings_milestones_shown: newMilestonesShown,
  });

  const { data: updated } = await supabase
    .from('streaks')
    .update(updates)
    .eq('user_id', userId)
    .select('*')
    .single();

  result.streaks = (updated as Streaks) ?? { ...streaks, ...updates };
  return result;
}

/**
 * Called on dashboard load. Passively detects and records breaks that
 * occurred while the user was away. Returns whether a break just happened
 * (to trigger a compassionate toast, once).
 */
export async function checkStreakHealth(
  supabase: SupabaseClient,
  userId: string
): Promise<{ streaks: Streaks; logging_just_broken: boolean; savings_just_broken: boolean }> {
  const streaks = await fetchOrCreateStreaks(supabase, userId);

  let logging_just_broken = false;
  let savings_just_broken = false;
  const updates: Partial<Streaks> = {};
  const today = todayStr();
  const thisMonday = getMondayStr();

  // Check logging streak
  if (streaks.logging_current > 0 && streaks.logging_last_date) {
    const gap = daysBetween(streaks.logging_last_date, today);
    if (gap > 1) {
      const freezesNeeded = gap - 1;
      if (streaks.freezes_banked < freezesNeeded) {
        logging_just_broken = true;
        updates.logging_current = 0;
        updates.logging_last_date = null;
        updates.freezes_banked = 0;
      }
    }
  }

  // Check savings streak
  if (streaks.savings_current > 0 && streaks.savings_last_week) {
    const weekGap = weeksBetween(streaks.savings_last_week, thisMonday);
    if (weekGap > 1) {
      const freezesNeeded = weekGap - 1;
      const availableFreezes = updates.freezes_banked ?? streaks.freezes_banked;
      if (availableFreezes < freezesNeeded) {
        savings_just_broken = true;
        updates.savings_current = 0;
        updates.savings_last_week = null;
        updates.freezes_banked = 0;
      }
    }
  }

  let updatedStreaks = streaks;
  if (Object.keys(updates).length > 0) {
    const { data } = await supabase
      .from('streaks')
      .update(updates)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (data) updatedStreaks = data as Streaks;
  }

  return { streaks: updatedStreaks, logging_just_broken, savings_just_broken };
}

/** Whether the user has already logged a transaction today. */
export function hasLoggedToday(streaks: Streaks): boolean {
  return streaks.logging_last_date === todayStr();
}

/** Whether the user has contributed to a goal this week. */
export function hasSavedThisWeek(streaks: Streaks): boolean {
  return streaks.savings_last_week === getMondayStr();
}

/** Human-readable milestone messages for logging streaks. */
export function loggingMilestoneMessage(days: number): string {
  if (days >= 100) return `💎 100-day streak. You're a Seeker through and through.`;
  if (days >= 60) return `🌟 60 days! You're on fire.`;
  if (days >= 30) return `🏆 30-day logging streak! Rare air.`;
  if (days >= 14) return `💪 14-day streak! Two weeks strong.`;
  return `🔥 7-day logging streak! You're building a habit.`;
}

/** Human-readable milestone messages for savings streaks. */
export function savingsMilestoneMessage(weeks: number): string {
  if (weeks >= 52) return `💎 52-week saving streak! An entire year of consistency.`;
  if (weeks >= 26) return `🌟 Half a year of saving every week!`;
  if (weeks >= 12) return `🎯 12-week saving streak! Three months strong.`;
  return `💰 4-week saving streak! One month strong.`;
}
