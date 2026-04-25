import type { SupabaseClient } from '@supabase/supabase-js';
import { getNextDueDate } from '@/lib/recurring';
import type { RecurringTransaction } from '@/types';

type PurchaseInput = {
  item_name: string;
  amount: number;
  bucket: 'needs' | 'wants' | 'savings';
  urgency?: 'now' | 'can_wait' | 'not_sure';
};

type DecisionContext = {
  user: { name: string };
  purchase: {
    item_name: string;
    amount: number;
    bucket: 'needs' | 'wants' | 'savings';
    urgency: 'now' | 'can_wait' | 'not_sure' | null;
  };
  current_cycle: {
    day_of_cycle: number;
    days_remaining: number;
    cycle_length: number;
  };
  buckets: {
    needs: { spent: number; budget: number; pct: number; pct_time: number; remaining: number };
    wants: { spent: number; budget: number; pct: number; pct_time: number; remaining: number };
    savings: { spent: number; commitment: number; pct: number; remaining: number };
  };
  after_purchase: {
    target_bucket_spent: number;
    target_bucket_pct: number;
    over_budget: boolean;
    over_by: number;
  };
  active_goals: Array<{
    name: string;
    target: number;
    saved: number;
    pct: number;
    days_to_deadline: number | null;
    pct_of_this_purchase: number;
  }>;
  recent_activity: {
    last_7d_spend: number;
    typical_daily_spend: number;
  };
  upcoming_recurring_7d: {
    count: number;
    total: number;
  };
};

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function computeDecisionContext(
  supabase: SupabaseClient,
  userId: string,
  purchase: PurchaseInput,
): Promise<DecisionContext> {
  const now = new Date();
  const today = toDateStr(now);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const thirtyDaysAgoStr = toDateStr(thirtyDaysAgo);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const sevenDaysAgoStr = toDateStr(sevenDaysAgo);

  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setUTCDate(sevenDaysFromNow.getUTCDate() + 7);

  const [profileRes, bucketsRes, recentTxnsRes, thirtyDTxnsRes, goalsRes, recurringRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, monthly_income, needs_percent, wants_percent, savings_percent, cycle_start_day')
      .eq('id', userId)
      .single(),
    supabase.from('budget_buckets').select('id, name').eq('user_id', userId),
    supabase
      .from('transactions')
      .select('amount, type, transaction_date, category:categories(name, icon, bucket_id)')
      .eq('user_id', userId)
      .gte('transaction_date', sevenDaysAgoStr)
      .lte('transaction_date', today)
      .eq('type', 'expense'),
    supabase
      .from('transactions')
      .select('amount, transaction_date')
      .eq('user_id', userId)
      .gte('transaction_date', thirtyDaysAgoStr)
      .lte('transaction_date', today)
      .eq('type', 'expense'),
    supabase
      .from('goals')
      .select('name, target_amount, current_amount, deadline')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .eq('is_completed', false)
      .order('created_at')
      .limit(3),
    supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true),
  ]);

  const profile = profileRes.data;
  const buckets = bucketsRes.data ?? [];
  const recentTxns = recentTxnsRes.data ?? [];
  const thirtyDTxns = thirtyDTxnsRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const recurring = recurringRes.data ?? [];

  const bucketMap: Record<string, string> = {};
  for (const b of buckets) bucketMap[b.id] = b.name;

  const monthlyIncome = profile?.monthly_income ?? 0;
  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const needsPct = (profile?.needs_percent ?? 50) / 100;
  const wantsPct = (profile?.wants_percent ?? 30) / 100;
  const futurePct = (profile?.savings_percent ?? 20) / 100;

  // Cycle position
  const todayDay = now.getUTCDate();
  let dayOfCycle: number;
  if (todayDay >= cycleStartDay) {
    dayOfCycle = todayDay - cycleStartDay + 1;
  } else {
    const daysInPrevMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0).getUTCDate();
    dayOfCycle = daysInPrevMonth - cycleStartDay + todayDay + 1;
  }
  const cycleLength = 30;
  const daysRemaining = Math.max(0, cycleLength - dayOfCycle);
  const pctTime = Math.round((dayOfCycle / cycleLength) * 100);

  let cycleStartStr: string;
  if (todayDay >= cycleStartDay) {
    cycleStartStr = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), cycleStartDay)));
  } else {
    cycleStartStr = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, cycleStartDay)));
  }

  // Bucket spend this cycle
  const bucketSpend: Record<string, number> = { needs: 0, wants: 0, savings: 0 };
  for (const tx of recentTxns) {
    const cat = (Array.isArray(tx.category) ? tx.category[0] : tx.category) as {
      name: string; icon: string | null; bucket_id: string | null;
    } | null;
    if (tx.transaction_date >= cycleStartStr) {
      const bucketName = cat?.bucket_id ? (bucketMap[cat.bucket_id] ?? 'needs') : 'needs';
      bucketSpend[bucketName] = (bucketSpend[bucketName] ?? 0) + tx.amount;
    }
  }

  const needsBudget = monthlyIncome * needsPct;
  const wantsBudget = monthlyIncome * wantsPct;
  const savingsCommitment = monthlyIncome * futurePct;

  // 7d spend and 30d avg daily
  const last7dSpend = recentTxns.reduce((s, t) => s + t.amount, 0);
  const last30dSpend = thirtyDTxns.reduce((s, t) => s + t.amount, 0);
  const typicalDailySpend = Math.round(last30dSpend / 30);

  // Upcoming recurring in next 7 days
  let recCount = 0, recTotal = 0;
  for (const r of recurring as RecurringTransaction[]) {
    const next = getNextDueDate(r, now);
    if (next && next <= sevenDaysFromNow) {
      recCount++;
      recTotal += r.amount;
    }
  }

  // After-purchase math
  const targetBudget = purchase.bucket === 'needs'
    ? needsBudget
    : purchase.bucket === 'wants'
    ? wantsBudget
    : savingsCommitment;

  const currentSpent = bucketSpend[purchase.bucket] ?? 0;
  const targetBucketSpent = currentSpent + purchase.amount;
  const targetBucketPct = targetBudget > 0 ? Math.round((targetBucketSpent / targetBudget) * 100) : 0;
  const overBudget = targetBucketSpent > targetBudget;
  const overBy = Math.max(0, targetBucketSpent - targetBudget);

  return {
    user: { name: profile?.full_name ?? 'Sika User' },
    purchase: {
      item_name: purchase.item_name,
      amount: purchase.amount,
      bucket: purchase.bucket,
      urgency: purchase.urgency ?? null,
    },
    current_cycle: { day_of_cycle: dayOfCycle, days_remaining: daysRemaining, cycle_length: cycleLength },
    buckets: {
      needs: {
        spent: bucketSpend.needs,
        budget: needsBudget,
        pct: needsBudget > 0 ? Math.round((bucketSpend.needs / needsBudget) * 100) : 0,
        pct_time: pctTime,
        remaining: Math.max(0, needsBudget - bucketSpend.needs),
      },
      wants: {
        spent: bucketSpend.wants,
        budget: wantsBudget,
        pct: wantsBudget > 0 ? Math.round((bucketSpend.wants / wantsBudget) * 100) : 0,
        pct_time: pctTime,
        remaining: Math.max(0, wantsBudget - bucketSpend.wants),
      },
      savings: {
        spent: bucketSpend.savings,
        commitment: savingsCommitment,
        pct: savingsCommitment > 0 ? Math.round((bucketSpend.savings / savingsCommitment) * 100) : 0,
        remaining: Math.max(0, savingsCommitment - bucketSpend.savings),
      },
    },
    after_purchase: {
      target_bucket_spent: targetBucketSpent,
      target_bucket_pct: targetBucketPct,
      over_budget: overBudget,
      over_by: overBy,
    },
    active_goals: goals.map((g) => {
      let daysToDeadline: number | null = null;
      if (g.deadline) {
        daysToDeadline = Math.round(
          (new Date(g.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
      }
      return {
        name: g.name,
        target: g.target_amount,
        saved: g.current_amount ?? 0,
        pct: g.target_amount > 0 ? Math.round(((g.current_amount ?? 0) / g.target_amount) * 100) : 0,
        days_to_deadline: daysToDeadline,
        pct_of_this_purchase: g.target_amount > 0
          ? Math.round((purchase.amount / g.target_amount) * 100)
          : 0,
      };
    }),
    recent_activity: {
      last_7d_spend: last7dSpend,
      typical_daily_spend: typicalDailySpend,
    },
    upcoming_recurring_7d: { count: recCount, total: recTotal },
  };
}
