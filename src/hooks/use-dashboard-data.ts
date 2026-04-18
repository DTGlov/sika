import { useEffect, useCallback, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { subDays, format } from 'date-fns';
import type { DashboardStats, Transaction, BucketName, RecurringTransaction } from '@/types';
import { totalMonthlyIncome } from '@/lib/income';
import {
  getCycleForDate,
  getCycleFromStartDate,
  parseCycleParam,
} from '@/lib/cycle';
import { computeAccountBalances } from '@/lib/accounts';
import { generateDueTransactions } from '@/lib/recurring';

export function useDashboardData(cycleStartDateStr?: string) {
  const { user, profile, incomeSources, accounts } = useAuthStore();
  const { setDashboardStats, setCategories, mutationCount } = useTransactionStore();
  const [loading, setLoading] = useState(true);
  const [pendingRecurring, setPendingRecurring] = useState<{ recurring: RecurringTransaction; dueDates: string[] }[]>([]);
  const generatedRef = useRef(false);
  const supabase = createClient();

  // Run recurring generation once per session on first load
  useEffect(() => {
    if (!user || generatedRef.current) return;
    generatedRef.current = true;
    generateDueTransactions(supabase, user.id).then(({ pending }) => {
      setPendingRecurring(pending);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchData = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    const cycleStartDay = profile.cycle_start_day ?? 1;
    const today = new Date();

    // Determine the cycle window to display
    const cycle = cycleStartDateStr
      ? (() => {
          const parsed = parseCycleParam(cycleStartDateStr);
          return parsed
            ? getCycleFromStartDate(parsed, cycleStartDay)
            : getCycleForDate(today, cycleStartDay);
        })()
      : getCycleForDate(today, cycleStartDay);

    const now = cycle.isCurrent ? today : cycle.end;

    const cycleStart = format(cycle.start, 'yyyy-MM-dd');
    const cycleEnd = format(cycle.end, 'yyyy-MM-dd');
    const todayStr = format(now, 'yyyy-MM-dd');
    const prevCycleStart = format(getCycleAtOffsetStart(cycle.start, -1), 'yyyy-MM-dd');
    const prevCycleEnd = format(getCycleAtOffsetEnd(cycle.start), 'yyyy-MM-dd');
    const weekAgo = format(subDays(now, 6), 'yyyy-MM-dd');

    const [
      { data: cycleTxns },
      { data: prevTxns },
      { data: buckets },
      { data: cats },
      { data: allTxnsForBalance },
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)')
        .eq('user_id', user.id)
        .gte('transaction_date', cycleStart)
        .lte('transaction_date', cycleEnd)
        .order('transaction_date', { ascending: false }),
      supabase
        .from('transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .gte('transaction_date', prevCycleStart)
        .lte('transaction_date', prevCycleEnd)
        .eq('type', 'expense'),
      supabase.from('budget_buckets').select('*').eq('user_id', user.id).order('sort_order'),
      supabase
        .from('categories')
        .select('*, bucket:budget_buckets(*)')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq('is_archived', false)
        .order('name'),
      supabase
        .from('transactions')
        .select('account_id, to_account_id, amount, type')
        .eq('user_id', user.id),
    ]);

    if (cats) setCategories(cats);

    const expenses = (cycleTxns ?? []).filter((t) => t.type === 'expense') as Transaction[];
    const totalSpentThisMonth = expenses.reduce((s, t) => s + t.amount, 0);
    // Expenses flagged as paid from a sinking fund are excluded from bucket math —
    // their cost was already accounted for by the monthly contribution to the goal.
    const bucketExpenses = expenses.filter((t) => !t.paid_from_goal_id);
    const totalSpentLastMonth = (prevTxns ?? []).reduce(
      (s: number, t: { amount: number }) => s + t.amount,
      0
    );
    const totalSpentToday = expenses
      .filter((t) => t.transaction_date === todayStr)
      .reduce((s, t) => s + t.amount, 0);

    const bucketSpend: Record<BucketName, number> = { needs: 0, wants: 0, future: 0 };
    const monthlyIncome =
      incomeSources.length > 0 ? totalMonthlyIncome(incomeSources) : profile.monthly_income;
    const bucketLimits: Record<BucketName, number> = {
      needs: (monthlyIncome * profile.needs_percent) / 100,
      wants: (monthlyIncome * profile.wants_percent) / 100,
      future: (monthlyIncome * profile.future_percent) / 100,
    };

    const bucketMap = new Map((buckets ?? []).map((b) => [b.id, b.name as BucketName]));
    for (const txn of bucketExpenses) {
      const bucketId = txn.category?.bucket_id;
      if (bucketId) {
        const bName = bucketMap.get(bucketId);
        if (bName) bucketSpend[bName] += txn.amount;
      }
    }

    const weeklyMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      weeklyMap.set(format(subDays(now, i), 'yyyy-MM-dd'), 0);
    }
    for (const txn of bucketExpenses) {
      if (txn.transaction_date >= weekAgo) {
        weeklyMap.set(txn.transaction_date, (weeklyMap.get(txn.transaction_date) ?? 0) + txn.amount);
      }
    }
    const weeklySpend = Array.from(weeklyMap.entries()).map(([date, amount]) => ({ date, amount }));

    const accountBalances = computeAccountBalances(accounts, allTxnsForBalance ?? []);

    const stats: DashboardStats = {
      totalSpentToday,
      totalSpentThisMonth,
      totalSpentLastMonth,
      bucketSpend,
      bucketLimits,
      weeklySpend,
      recentTransactions: (cycleTxns ?? []).slice(0, 5) as Transaction[],
      accountBalances,
    };

    setDashboardStats(stats);
    setLoading(false);
  }, [user, profile, incomeSources, accounts, cycleStartDateStr, supabase, setDashboardStats, setCategories]);

  useEffect(() => {
    fetchData();
  }, [fetchData, mutationCount]);

  return { loading, refetch: fetchData, pendingRecurring, setPendingRecurring };
}

// Helpers — avoid importing addMonths just for this tiny offset calc
function getCycleAtOffsetStart(cycleStart: Date, offset: number): Date {
  const d = new Date(cycleStart);
  d.setMonth(d.getMonth() + offset);
  return d;
}

function getCycleAtOffsetEnd(cycleStart: Date): Date {
  // Previous cycle end = day before cycleStart
  const d = new Date(cycleStart);
  d.setDate(d.getDate() - 1);
  return d;
}
