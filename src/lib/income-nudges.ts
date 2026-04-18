import { format, getDate, getDay } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IncomeSource, IncomeNudge } from '@/types';

/**
 * Determine if an income source is "due" today based on its frequency and expected_day.
 * Returns the due date string if due, null if not.
 */
function getIncomeDueDate(source: IncomeSource, today: Date): string | null {
  if (!source.is_active || source.expected_day === null) return null;

  const todayStr = format(today, 'yyyy-MM-dd');

  switch (source.frequency) {
    case 'monthly':
      // Due on the expected day of each month
      if (getDate(today) === source.expected_day) return todayStr;
      break;
    case 'weekly':
      // expected_day is day of week (0=Sun, 6=Sat)
      if (getDay(today) === source.expected_day) return todayStr;
      break;
    case 'biweekly':
      // Approximate: same day of week (exact phase tracking would require reference date)
      if (getDay(today) === source.expected_day) return todayStr;
      break;
    case 'irregular':
      return null;
  }

  return null;
}

/**
 * Fetch all income nudges that are due today and haven't been dismissed.
 */
export async function getDueIncomeNudges(
  supabase: SupabaseClient,
  userId: string,
  incomeSources: IncomeSource[],
  today: Date = new Date()
): Promise<IncomeNudge[]> {
  // Find which sources are due today
  const dueSourcesWithDates = incomeSources
    .map(s => ({ source: s, dueDate: getIncomeDueDate(s, today) }))
    .filter(({ dueDate }) => dueDate !== null) as { source: IncomeSource; dueDate: string }[];

  if (dueSourcesWithDates.length === 0) return [];

  // Fetch dismissals for today's due sources
  const sourceIds = dueSourcesWithDates.map(({ source }) => source.id);
  const todayStr = format(today, 'yyyy-MM-dd');

  const { data: dismissals } = await supabase
    .from('income_nudge_dismissals')
    .select('income_source_id, action')
    .eq('user_id', userId)
    .eq('due_date', todayStr)
    .in('income_source_id', sourceIds);

  const dismissedIds = new Set(
    (dismissals ?? []).map((d: { income_source_id: string; action: string }) => d.income_source_id)
  );

  return dueSourcesWithDates
    .filter(({ source }) => !dismissedIds.has(source.id))
    .map(({ source, dueDate }) => ({ incomeSource: source, dueDate }));
}

/**
 * Record a user response to an income nudge.
 * Uses upsert to handle re-actions (e.g., snooze → logged).
 */
export async function recordNudgeDismissal(
  supabase: SupabaseClient,
  userId: string,
  incomeSourceId: string,
  dueDate: string,
  action: 'logged' | 'snoozed' | 'dismissed'
): Promise<void> {
  await supabase.from('income_nudge_dismissals').upsert(
    { user_id: userId, income_source_id: incomeSourceId, due_date: dueDate, action },
    { onConflict: 'user_id,income_source_id,due_date' }
  );
}
