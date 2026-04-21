import type { SupabaseClient } from '@supabase/supabase-js';
import { format, differenceInDays } from 'date-fns';
import { getCycleAtOffset } from '@/lib/cycle';
import { fetchGoalAmounts } from '@/lib/goals';
import { totalMonthlyIncome } from '@/lib/income';
import { getLabelConfig, FACTOR_NAMES, FACTOR_WEIGHTS } from '@/types/health';
import type { HealthScore, HealthFactor } from '@/types/health';
import type { IncomeSource } from '@/types';

const BUCKET_NAMES = ['needs', 'wants', 'future'] as const;
type BucketKey = typeof BUCKET_NAMES[number];

/**
 * Compute the user's Financial Health Score from current data.
 * Pure computation — no storage, no side effects.
 */
export async function computeHealthScore(
  supabase: SupabaseClient,
  userId: string
): Promise<HealthScore> {
  // ── Parallel base fetch ──────────────────────────────────────────
  const [profileRes, streaksRes, activeGoalsRes, accountsRes, incomeSourcesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('cycle_start_day, monthly_income, needs_percent, wants_percent, future_percent')
      .eq('id', userId)
      .single(),
    supabase
      .from('streaks')
      .select('logging_current, savings_current, logging_last_date')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('goals')
      .select('id, name, target_amount, deadline, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_archived', false)
      .eq('goal_type', 'target')
      .is('completed_at', null)
      .not('deadline', 'is', null),
    supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase
      .from('income_sources')
      .select('id, amount, frequency, is_active')
      .eq('user_id', userId)
      .eq('is_active', true),
  ]);

  const profile = profileRes.data;
  const streaksData = streaksRes.data;
  const activeGoals = activeGoalsRes.data ?? [];
  const accountCount = accountsRes.count ?? 0;
  const incomeSources = (incomeSourcesRes.data ?? []) as IncomeSource[];

  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const needsPct = profile?.needs_percent ?? 50;
  const wantsPct = profile?.wants_percent ?? 30;
  const futurePct = profile?.future_percent ?? 20;
  const monthlyIncome = incomeSources.length > 0
    ? totalMonthlyIncome(incomeSources)
    : (profile?.monthly_income ?? 0);

  // ── Last 3 completed cycles ──────────────────────────────────────
  const today = new Date();
  const completedCycles = ([-1, -2, -3] as const).map(offset =>
    getCycleAtOffset(today, cycleStartDay, offset)
  );
  const oldestStart = format(completedCycles[2].start, 'yyyy-MM-dd');
  const newestEnd = format(completedCycles[0].end, 'yyyy-MM-dd');

  // Single query for all cycle expense transactions
  const { data: cycleExpenses } = await supabase
    .from('transactions')
    .select('amount, transaction_date, category:categories!category_id(bucket:budget_buckets(name))')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('transaction_date', oldestStart)
    .lte('transaction_date', newestEnd);

  // ── Factor 1: Emergency Coverage (25%) ──────────────────────────
  const emergencyCoverage = await computeEmergencyCoverage(
    supabase, userId, cycleExpenses, completedCycles, monthlyIncome
  );

  // ── Factor 2: Budget Discipline (25%) ────────────────────────────
  const budgetDiscipline = computeBudgetDiscipline(
    cycleExpenses, completedCycles, monthlyIncome, needsPct, wantsPct, futurePct
  );

  // ── Factor 3: Consistency (20%) ──────────────────────────────────
  const consistency = computeConsistency(streaksData);

  // ── Factor 4: Goal Commitment (20%) ──────────────────────────────
  const goalCommitment = await computeGoalCommitment(supabase, activeGoals as GoalRow[]);

  // ── Factor 5: Diversification (10%) ──────────────────────────────
  const diversification = computeDiversification(accountCount, incomeSources.length);

  // ── Weighted total ────────────────────────────────────────────────
  const factors: HealthFactor[] = [emergencyCoverage, budgetDiscipline, consistency, goalCommitment, diversification];
  const total = Math.round(
    emergencyCoverage.score * 0.25 +
    budgetDiscipline.score  * 0.25 +
    consistency.score       * 0.20 +
    goalCommitment.score    * 0.20 +
    diversification.score   * 0.10
  );

  return { total, label: getLabelConfig(total).label, factors };
}

// ────────────────────────────────────────────────────────────────────
// Factor helpers
// ────────────────────────────────────────────────────────────────────

async function computeEmergencyCoverage(
  supabase: SupabaseClient,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cycleExpenses: any[] | null,
  completedCycles: ReturnType<typeof getCycleAtOffset>[],
  monthlyIncome: number
): Promise<HealthFactor> {
  const id = 'emergency_coverage';

  // Find Life Savings perpetual goal
  const { data: lifeSavingsGoals } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId)
    .eq('goal_type', 'perpetual')
    .ilike('name', 'life savings')
    .limit(1);

  const lsGoal = lifeSavingsGoals?.[0];
  if (!lsGoal) {
    return makeNeutralFactor(id, 'No Life Savings goal found — create one to track your emergency fund.');
  }

  const { net: lsBalance } = await fetchGoalAmounts(supabase, lsGoal.id);

  // Compute monthly needs avg from cycle data
  const needsPerCycle = completedCycles.map(cycle => {
    const cycleStart = format(cycle.start, 'yyyy-MM-dd');
    const cycleEnd = format(cycle.end, 'yyyy-MM-dd');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cycleExpenses ?? []).filter((t: any) =>
      t.transaction_date >= cycleStart &&
      t.transaction_date <= cycleEnd &&
      t.category?.bucket?.name === 'needs'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).reduce((s: number, t: any) => s + t.amount, 0);
  }).filter(n => n > 0);

  if (needsPerCycle.length === 0) {
    return makeNeutralFactor(id, 'No Needs spending data yet.');
  }

  const monthlyNeedsAvg = needsPerCycle.reduce((s, n) => s + n, 0) / needsPerCycle.length;
  const coverageRatio = lsBalance / monthlyNeedsAvg;
  const score = Math.min(100, Math.round((coverageRatio / 3) * 100));
  const monthsCovered = coverageRatio.toFixed(1);

  const description = lsBalance <= 0
    ? 'Life Savings has no balance yet.'
    : `Your Life Savings covers ${monthsCovered} month${parseFloat(monthsCovered) === 1 ? '' : 's'} of Needs.`;

  const targetAmount = monthlyNeedsAvg * 3;
  const tip = score < 60
    ? `Build Life Savings to cover 3 months of your Needs (~${formatPts(targetAmount)})`
    : null;

  return { id, name: FACTOR_NAMES[id], weight: FACTOR_WEIGHTS[id], score, description, tip };
}

function computeBudgetDiscipline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cycleExpenses: any[] | null,
  completedCycles: ReturnType<typeof getCycleAtOffset>[],
  monthlyIncome: number,
  needsPct: number,
  wantsPct: number,
  futurePct: number
): HealthFactor {
  const id = 'budget_discipline';

  if (!cycleExpenses || cycleExpenses.length === 0 || monthlyIncome <= 0) {
    return makeNeutralFactor(id, 'No completed cycles to evaluate yet.');
  }

  const limits: Record<BucketKey, number> = {
    needs: monthlyIncome * needsPct / 100,
    wants: monthlyIncome * wantsPct / 100,
    future: monthlyIncome * futurePct / 100,
  };

  let totalChecks = 0;
  let withinCount = 0;
  const bucketOverCounts: Record<BucketKey, number> = { needs: 0, wants: 0, future: 0 };

  for (const cycle of completedCycles) {
    const start = format(cycle.start, 'yyyy-MM-dd');
    const end = format(cycle.end, 'yyyy-MM-dd');

    for (const bucket of BUCKET_NAMES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bucketSpend = cycleExpenses.filter((t: any) =>
        t.transaction_date >= start &&
        t.transaction_date <= end &&
        t.category?.bucket?.name === bucket
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ).reduce((s: number, t: any) => s + t.amount, 0);

      totalChecks++;
      if (bucketSpend <= limits[bucket]) {
        withinCount++;
      } else {
        bucketOverCounts[bucket]++;
      }
    }
  }

  const score = Math.round((withinCount / totalChecks) * 100);

  const mostBlow = (Object.entries(bucketOverCounts) as [BucketKey, number][])
    .sort((a, b) => b[1] - a[1])[0];

  const pct = Math.round((withinCount / totalChecks) * 100);
  const description = `Stayed within limit in ${withinCount} of ${totalChecks} bucket-cycles.`;

  const tip = score < 60 && mostBlow[1] > 0
    ? `Your ${capitalize(mostBlow[0])} bucket has been over limit. Aim to keep it within this month's split.`
    : null;

  return { id, name: FACTOR_NAMES[id], weight: FACTOR_WEIGHTS[id], score, description, tip };
}

function computeConsistency(
  streaksData: { logging_current: number; savings_current: number; logging_last_date: string | null } | null
): HealthFactor {
  const id = 'consistency';

  if (!streaksData) {
    return makeNeutralFactor(id, 'No streak data yet. Start logging daily.');
  }

  const { logging_current, savings_current } = streaksData;
  const loggingScore = Math.min(100, Math.round((logging_current / 30) * 100));
  const savingsScore = Math.min(100, Math.round((savings_current / 4) * 100));
  const score = Math.round(loggingScore * 0.6 + savingsScore * 0.4);

  const description = `${logging_current}-day logging streak · ${savings_current}-week savings streak.`;

  const tip = score < 60
    ? (loggingScore <= savingsScore
      ? 'Log a transaction today to keep your streak going.'
      : 'Contribute to a goal this week to build your saving streak.')
    : null;

  return { id, name: FACTOR_NAMES[id], weight: FACTOR_WEIGHTS[id], score, description, tip };
}

interface GoalRow {
  id: string;
  name: string;
  target_amount: number | null;
  deadline: string | null;
  created_at: string;
}

async function computeGoalCommitment(
  supabase: SupabaseClient,
  activeGoals: GoalRow[]
): Promise<HealthFactor> {
  const id = 'goal_commitment';

  if (activeGoals.length === 0) {
    return makeNeutralFactor(id, 'No active target goals. Add one to track your commitment.');
  }

  const amounts = await Promise.all(
    activeGoals.map(g => fetchGoalAmounts(supabase, g.id).then(({ net }) => ({ goal: g, net })))
  );

  let onPace = 0;
  let worstGoal: { name: string; pace: number } | null = null;
  let worstPaceDeficit = 0;

  for (const { goal, net } of amounts) {
    if (!goal.target_amount || !goal.deadline) continue;
    const today = new Date();
    const deadline = new Date(goal.deadline);
    const daysRemaining = Math.max(0, differenceInDays(deadline, today));
    const totalDays = differenceInDays(deadline, new Date(goal.created_at));
    if (totalDays <= 0) continue;

    const elapsed = totalDays - daysRemaining;
    const expectedByNow = (elapsed / totalDays) * goal.target_amount;

    if (net >= expectedByNow) {
      onPace++;
    } else {
      const deficit = expectedByNow - net;
      const monthlyNeeded = daysRemaining > 0 ? (goal.target_amount - net) / (daysRemaining / 30) : 0;
      if (deficit > worstPaceDeficit) {
        worstPaceDeficit = deficit;
        worstGoal = { name: goal.name, pace: monthlyNeeded };
      }
    }
  }

  const total = amounts.filter(a => a.goal.target_amount && a.goal.deadline).length;
  const score = total > 0 ? Math.round((onPace / total) * 100) : 50;
  const description = total > 0
    ? `${onPace} of ${total} active goal${total !== 1 ? 's' : ''} on pace.`
    : 'No deadline-based goals to evaluate.';

  const tip = score < 60 && worstGoal
    ? `Your ${worstGoal.name} goal needs ${formatPts(worstGoal.pace)}/month to stay on track.`
    : null;

  return { id, name: FACTOR_NAMES[id], weight: FACTOR_WEIGHTS[id], score, description, tip };
}

function computeDiversification(accountCount: number, incomeSourceCount: number): HealthFactor {
  const id = 'diversification';
  const accountScore = Math.min(100, (accountCount / 3) * 100);
  const incomeScore = Math.min(100, (incomeSourceCount / 2) * 100);
  const score = Math.round(accountScore * 0.5 + incomeScore * 0.5);

  const description = `${accountCount} account${accountCount !== 1 ? 's' : ''} · ${incomeSourceCount} income source${incomeSourceCount !== 1 ? 's' : ''}.`;

  const tip = score < 50
    ? (incomeScore < accountScore
      ? 'Add a second income source to diversify.'
      : 'Add your MoMo or Savings account to diversify.')
    : null;

  return { id, name: FACTOR_NAMES[id], weight: FACTOR_WEIGHTS[id], score, description, tip };
}

// ── Utilities ────────────────────────────────────────────────────────

function makeNeutralFactor(id: keyof typeof FACTOR_NAMES, description: string): HealthFactor {
  return {
    id,
    name: FACTOR_NAMES[id],
    weight: FACTOR_WEIGHTS[id],
    score: 50,
    description,
    tip: null,
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatPts(amount: number): string {
  return `₵${Math.round(amount).toLocaleString()}`;
}
