import type { SupabaseClient } from '@supabase/supabase-js';
import type { Goal, GoalProgress } from '@/types/goal';
import type { Account } from '@/types/account';
import { differenceInDays } from 'date-fns';

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
    // On track: current amount >= what we should have saved linearly by now
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

  // Mark goal completed if target reached
  if (
    goal.goal_type !== 'perpetual' &&
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

export async function fetchGoalContributions(
  supabase: SupabaseClient,
  goalId: string
): Promise<number> {
  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .eq('goal_id', goalId)
    .eq('type', 'transfer');
  return (data ?? []).reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);
}
