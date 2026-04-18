import type { SupabaseClient } from '@supabase/supabase-js';
import type { Goal, GoalProgress } from '@/types/goal';
import type { Account } from '@/types/account';
import { differenceInDays, addMonths, format } from 'date-fns';

export const GOAL_COLORS = [
  '#00D9A3',
  '#60A5FA',
  '#FBBF24',
  '#F97316',
  '#A78BFA',
  '#F43F5E',
];

export const GOAL_ICONS = [
  'target',
  'star',
  'home',
  'car',
  'plane',
  'briefcase',
  'heart',
  'shield',
  'zap',
  'gift',
  'book',
  'music',
];

export function computeGoalProgress(
  goal: Goal,
  currentAmount: number,
  fundingAccount: Account
): GoalProgress {
  const isPerpetual = goal.goal_type === 'perpetual';

  let progress_percent: number | null = null;
  let days_remaining: number | null = null;
  let required_monthly_pace: number | null = null;
  let required_weekly_pace: number | null = null;
  let is_on_track: boolean | null = null;

  if (!isPerpetual && goal.target_amount != null && goal.deadline != null) {
    progress_percent = Math.min(100, (currentAmount / goal.target_amount) * 100);
    const today = new Date();
    const deadline = new Date(goal.deadline);
    days_remaining = Math.max(0, differenceInDays(deadline, today));
    const remaining = Math.max(0, goal.target_amount - currentAmount);
    if (days_remaining > 0) {
      required_monthly_pace = remaining / (days_remaining / 30);
      required_weekly_pace = remaining / (days_remaining / 7);
    }
    const totalDays = differenceInDays(deadline, new Date(goal.created_at));
    if (totalDays > 0) {
      const elapsed = totalDays - days_remaining;
      const expectedByNow = (elapsed / totalDays) * goal.target_amount;
      is_on_track = currentAmount >= expectedByNow;
    }
  }

  return {
    goal,
    current_amount: currentAmount,
    progress_percent,
    days_remaining,
    required_monthly_pace,
    required_weekly_pace,
    is_on_track,
    funding_account: fundingAccount,
  };
}

interface ContributeParams {
  goal: Goal;
  fromAccountId: string;
  amount: number;
  note: string;
  transactionDate: string;
  currentAmount: number;
}

export async function contributeToGoal(
  supabase: SupabaseClient,
  userId: string,
  { goal, fromAccountId, amount, note, transactionDate, currentAmount }: ContributeParams
): Promise<void> {
  await supabase.from('transactions').insert({
    user_id: userId,
    account_id: fromAccountId,
    to_account_id: goal.funding_account_id,
    amount,
    type: 'transfer',
    note: note || `Contribution to ${goal.name}`,
    transaction_date: transactionDate,
    goal_id: goal.id,
  });

  // For savings goals, mark complete when target is reached via contributions
  if (
    goal.goal_type === 'savings' &&
    goal.target_amount != null &&
    !goal.completed_at &&
    currentAmount + amount >= goal.target_amount
  ) {
    await supabase
      .from('goals')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', goal.id);
  }
}

export async function fetchGoals(
  supabase: SupabaseClient,
  userId: string
): Promise<Goal[]> {
  const { data } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  return data ?? [];
}

/** Returns contribution sum (transfers in with goal_id) and payment sum (expenses with paid_from_goal_id). */
export async function fetchGoalAmounts(
  supabase: SupabaseClient,
  goalId: string
): Promise<{ contributions: number; payments: number; net: number }> {
  const [contribRes, paymentRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount')
      .eq('goal_id', goalId)
      .eq('type', 'transfer'),
    supabase
      .from('transactions')
      .select('amount')
      .eq('paid_from_goal_id', goalId)
      .eq('type', 'expense'),
  ]);
  const contributions = (contribRes.data ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
  const payments = (paymentRes.data ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
  return { contributions, payments, net: contributions - payments };
}

/** Legacy helper — returns net effective balance (contributions - payments). */
export async function fetchGoalContributions(
  supabase: SupabaseClient,
  goalId: string
): Promise<number> {
  const { net } = await fetchGoalAmounts(supabase, goalId);
  return net;
}

interface NextCycleOptions {
  name: string;
  targetAmount: number;
  deadline: string;
  priority: number;
}

/** Creates the next cycle goal linked to the completed sinking fund. */
export async function createNextCycle(
  supabase: SupabaseClient,
  userId: string,
  completedGoal: Goal,
  opts: NextCycleOptions
): Promise<Goal | null> {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      name: opts.name,
      description: completedGoal.description,
      icon: completedGoal.icon,
      color: completedGoal.color,
      goal_type: 'sinking_fund',
      target_amount: opts.targetAmount,
      deadline: opts.deadline,
      funding_account_id: completedGoal.funding_account_id,
      priority: opts.priority,
      previous_goal_id: completedGoal.id,
      cycle_count: (completedGoal.cycle_count ?? 1) + 1,
    })
    .select('*')
    .single();

  if (error) return null;
  return data as Goal;
}

/** Suggest the next cycle name based on pattern, e.g. "Rent 2026 H1" → "Rent 2026 H2" or "Rent 2027 H1". */
export function suggestNextCycleName(currentName: string, completionDate: Date): string {
  // Try to increment a trailing year or cycle marker
  const match = currentName.match(/^(.*?)(\s+\d{4}.*)?$/);
  if (!match) return currentName;
  const base = match[1].trim();
  const nextYear = format(addMonths(completionDate, 6), 'yyyy');
  const month = completionDate.getMonth();
  const half = month < 6 ? 'H2' : 'H1';
  return `${base} ${nextYear} ${half}`;
}

/** Suggest deadline for next cycle: 6 months from completion date. */
export function suggestNextDeadline(completionDate: Date): string {
  return format(addMonths(completionDate, 6), 'yyyy-MM-dd');
}
