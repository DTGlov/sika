import { useEffect, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { startOfMonth, endOfMonth, subMonths, subDays, format, parse } from 'date-fns';
import type { DashboardStats, Transaction, BucketName } from '@/types';
import { totalMonthlyIncome } from '@/lib/income';

export function useDashboardData(selectedMonthStr?: string) {
  const { user, profile, incomeSources } = useAuthStore();
  const { setDashboardStats, setCategories, mutationCount } = useTransactionStore();
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    const currentMonthStr = format(new Date(), 'yyyy-MM');
    const monthStr = selectedMonthStr ?? currentMonthStr;
    const isCurrentMonth = monthStr === currentMonthStr;

    // For the current month use today as the reference point;
    // for past months use the last day of that month so weekly charts
    // and "today" totals reflect the end of that period.
    const monthDate = parse(monthStr, 'yyyy-MM', new Date());
    const now = isCurrentMonth ? new Date() : endOfMonth(monthDate);

    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
    const today = format(now, 'yyyy-MM-dd');
    const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
    const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
    const weekAgo = format(subDays(now, 6), 'yyyy-MM-dd');

    const [
      { data: monthTxns },
      { data: lastMonthTxns },
      { data: buckets },
      { data: cats },
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, category:categories(*, bucket:budget_buckets(*))')
        .eq('user_id', user.id)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .order('transaction_date', { ascending: false }),
      supabase
        .from('transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .gte('transaction_date', lastMonthStart)
        .lte('transaction_date', lastMonthEnd)
        .eq('type', 'expense'),
      supabase
        .from('budget_buckets')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order'),
      supabase
        .from('categories')
        .select('*, bucket:budget_buckets(*)')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq('is_archived', false)
        .order('name'),
    ]);

    if (cats) setCategories(cats);

    const expenses = (monthTxns ?? []).filter((t) => t.type === 'expense') as Transaction[];
    const totalSpentThisMonth = expenses.reduce((s, t) => s + t.amount, 0);
    const totalSpentLastMonth = (lastMonthTxns ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
    const totalSpentToday = expenses
      .filter((t) => t.transaction_date === today)
      .reduce((s, t) => s + t.amount, 0);

    const bucketSpend: Record<BucketName, number> = { needs: 0, wants: 0, future: 0 };
    const monthlyIncome = incomeSources.length > 0
      ? totalMonthlyIncome(incomeSources)
      : profile.monthly_income;
    const bucketLimits: Record<BucketName, number> = {
      needs: (monthlyIncome * profile.needs_percent) / 100,
      wants: (monthlyIncome * profile.wants_percent) / 100,
      future: (monthlyIncome * profile.future_percent) / 100,
    };

    const bucketMap = new Map((buckets ?? []).map((b) => [b.id, b.name as BucketName]));

    for (const txn of expenses) {
      const bucketId = txn.category?.bucket_id;
      if (bucketId) {
        const bName = bucketMap.get(bucketId);
        if (bName) bucketSpend[bName] += txn.amount;
      }
    }

    const weeklyMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(now, i), 'yyyy-MM-dd');
      weeklyMap.set(d, 0);
    }
    for (const txn of expenses) {
      if (txn.transaction_date >= weekAgo) {
        const cur = weeklyMap.get(txn.transaction_date) ?? 0;
        weeklyMap.set(txn.transaction_date, cur + txn.amount);
      }
    }
    const weeklySpend = Array.from(weeklyMap.entries()).map(([date, amount]) => ({ date, amount }));

    const stats: DashboardStats = {
      totalSpentToday,
      totalSpentThisMonth,
      totalSpentLastMonth,
      bucketSpend,
      bucketLimits,
      weeklySpend,
      recentTransactions: (monthTxns ?? []).slice(0, 5) as Transaction[],
    };

    setDashboardStats(stats);
    setLoading(false);
  }, [user, profile, incomeSources, selectedMonthStr, supabase, setDashboardStats, setCategories]);

  useEffect(() => {
    fetchData();
  }, [fetchData, mutationCount]); // mutationCount triggers re-fetch after any transaction/income mutation

  return { loading, refetch: fetchData };
}
