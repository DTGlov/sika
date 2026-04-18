import {
  addDays, addMonths, addWeeks, addYears,
  format, parse, getDate, getDay, getDaysInMonth, getMonth,
  parseISO, startOfDay, isAfter, isBefore, isEqual,
} from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecurringTransaction } from '@/types';

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export const DAY_OF_WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDate(str: string): Date {
  const d = parse(str, 'yyyy-MM-dd', new Date());
  return startOfDay(d);
}

function getMonthlyDate(year: number, month: number, schedDay: number): Date {
  if (schedDay === -1) {
    return new Date(year, month + 1, 0); // last day
  }
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));
  return new Date(year, month, Math.min(schedDay, daysInMonth));
}

/**
 * Compute the next occurrence of a recurring transaction on or after `fromDate`.
 * Returns null if past end_date or no future occurrence.
 */
export function getNextDueDate(
  recurring: Pick<RecurringTransaction, 'frequency' | 'start_date' | 'end_date' | 'schedule_day' | 'last_generated_date'>,
  fromDate: Date = new Date()
): Date | null {
  const start = parseDate(recurring.start_date);
  const from = startOfDay(fromDate);
  const effectiveFrom = isBefore(from, start) ? start : from;

  let candidate: Date;

  switch (recurring.frequency) {
    case 'daily': {
      candidate = new Date(effectiveFrom);
      break;
    }
    case 'weekly': {
      const targetDow = recurring.schedule_day ?? getDay(start);
      candidate = new Date(effectiveFrom);
      while (getDay(candidate) !== targetDow) {
        candidate = addDays(candidate, 1);
      }
      break;
    }
    case 'biweekly': {
      const targetDow = recurring.schedule_day ?? getDay(start);
      // Find first occurrence from start aligned to targetDow
      let anchor = new Date(start);
      while (getDay(anchor) !== targetDow) {
        anchor = addDays(anchor, 1);
      }
      // Advance in 2-week steps until >= effectiveFrom
      while (isBefore(anchor, effectiveFrom)) {
        anchor = addWeeks(anchor, 2);
      }
      candidate = anchor;
      break;
    }
    case 'monthly': {
      const schedDay = recurring.schedule_day ?? getDate(start);
      // Try current month
      const tryThis = getMonthlyDate(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), schedDay);
      if (!isBefore(tryThis, effectiveFrom)) {
        candidate = tryThis;
      } else {
        const next = addMonths(new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1), 1);
        candidate = getMonthlyDate(next.getFullYear(), next.getMonth(), schedDay);
      }
      break;
    }
    case 'yearly': {
      const schedMonth = getMonth(start);
      const schedDay = recurring.schedule_day ?? getDate(start);
      let tryDate = new Date(effectiveFrom.getFullYear(), schedMonth, Math.min(schedDay, 28));
      if (isBefore(tryDate, effectiveFrom)) {
        tryDate = addYears(tryDate, 1);
      }
      candidate = tryDate;
      break;
    }
    default:
      return null;
  }

  // Respect end_date
  if (recurring.end_date) {
    const end = parseDate(recurring.end_date);
    if (isAfter(candidate, end)) return null;
  }

  return candidate;
}

/**
 * Get all recurring transactions that have occurrences due today or earlier
 * that haven't been generated yet.
 */
export async function getDueRecurring(
  supabase: SupabaseClient,
  userId: string,
  today: Date = new Date()
): Promise<{ recurring: RecurringTransaction; dueDates: string[] }[]> {
  const { data } = await supabase
    .from('recurring_transactions')
    .select('*, account:accounts!account_id(id,name,type,color,icon), category:categories(*, bucket:budget_buckets(*))')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_paused', false);

  if (!data || data.length === 0) return [];

  const todayStart = startOfDay(today);
  const result: { recurring: RecurringTransaction; dueDates: string[] }[] = [];

  for (const rec of data as RecurringTransaction[]) {
    const fromDate = rec.last_generated_date
      ? addDays(parseDate(rec.last_generated_date), 1)
      : parseDate(rec.start_date);

    const dueDates: string[] = [];
    let cursor = fromDate;

    // Collect all missed occurrences up to today
    while (true) {
      const next = getNextDueDate(rec, cursor);
      if (!next || isAfter(next, todayStart)) break;
      dueDates.push(format(next, 'yyyy-MM-dd'));
      cursor = addDays(next, 1);
      // Safety: max 365 occurrences per sync
      if (dueDates.length >= 365) break;
    }

    if (dueDates.length > 0) {
      result.push({ recurring: rec, dueDates });
    }
  }

  return result;
}

/**
 * Auto-generate transactions for all due recurring entries.
 * For auto_log=true: inserts transactions + updates last_generated_date.
 * For auto_log=false: returns as pending (no side effects).
 * Does NOT bump mutationCount to avoid feedback loops.
 */
export async function generateDueTransactions(
  supabase: SupabaseClient,
  userId: string,
  today: Date = new Date()
): Promise<{ pending: { recurring: RecurringTransaction; dueDates: string[] }[] }> {
  const due = await getDueRecurring(supabase, userId, today);
  const pending: { recurring: RecurringTransaction; dueDates: string[] }[] = [];

  for (const { recurring, dueDates } of due) {
    if (!recurring.auto_log) {
      pending.push({ recurring, dueDates });
      continue;
    }

    // Insert one transaction per missed occurrence
    for (const dueDate of dueDates) {
      await supabase.from('transactions').insert({
        user_id: userId,
        account_id: recurring.account_id,
        category_id: recurring.category_id,
        amount: recurring.amount,
        type: recurring.type,
        note: recurring.note,
        transaction_date: dueDate,
        generated_from_recurring: recurring.id,
      });
    }

    // Update last_generated_date to the last generated date
    const lastDate = dueDates[dueDates.length - 1];
    await supabase
      .from('recurring_transactions')
      .update({ last_generated_date: lastDate })
      .eq('id', recurring.id);
  }

  return { pending };
}

/**
 * Confirm a pending recurring occurrence (auto_log=false).
 * Inserts the transaction and updates last_generated_date.
 */
export async function confirmPendingRecurring(
  supabase: SupabaseClient,
  userId: string,
  recurring: RecurringTransaction,
  dueDate: string
): Promise<void> {
  await supabase.from('transactions').insert({
    user_id: userId,
    account_id: recurring.account_id,
    category_id: recurring.category_id,
    amount: recurring.amount,
    type: recurring.type,
    note: recurring.note,
    transaction_date: dueDate,
    generated_from_recurring: recurring.id,
  });
  await supabase
    .from('recurring_transactions')
    .update({ last_generated_date: dueDate })
    .eq('id', recurring.id);
}

/**
 * Skip a pending recurring occurrence without logging a transaction.
 * Updates last_generated_date so it won't prompt again for this period.
 */
export async function skipPendingRecurring(
  supabase: SupabaseClient,
  recurringId: string,
  dueDate: string
): Promise<void> {
  await supabase
    .from('recurring_transactions')
    .update({ last_generated_date: dueDate })
    .eq('id', recurringId);
}

export function formatScheduleSummary(rec: RecurringTransaction): string {
  switch (rec.frequency) {
    case 'daily':
      return 'Every day';
    case 'weekly': {
      const day = rec.schedule_day != null ? DAY_OF_WEEK_LABELS[rec.schedule_day] : 'weekly';
      return `Every ${day}`;
    }
    case 'biweekly': {
      const day = rec.schedule_day != null ? DAY_OF_WEEK_LABELS[rec.schedule_day] : 'bi-weekly';
      return `Every other ${day}`;
    }
    case 'monthly': {
      if (rec.schedule_day === -1) return 'Last day of month';
      const d = rec.schedule_day ?? getDate(parseISO(rec.start_date));
      const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
      return `${d}${suffix} of each month`;
    }
    case 'yearly':
      return `Yearly from ${format(parseISO(rec.start_date), 'MMM d')}`;
    default:
      return rec.frequency;
  }
}
