import type { SupabaseClient } from '@supabase/supabase-js';

export type MonthContext = {
  user: {
    name: string;
    monthly_income: number;
  };
  month: {
    start: string;
    end: string;
    total_in: number;
    total_out: number;
    transaction_count: number;
  };
  by_bucket: {
    needs: { spent: number; budget: number; pct: number };
    wants: { spent: number; budget: number; pct: number };
    savings: { spent: number; commitment: number; pct: number };
  };
  top_categories: Array<{
    name: string;
    emoji: string;
    bucket: string;
    total: number;
    txn_count: number;
    delta_vs_prev_month: number;
  }>;
  goals: Array<{
    name: string;
    target: number;
    saved: number;
    pct: number;
    deadline: string | null;
  }>;
  streak: {
    current_days: number;
    logged_this_month: number;
  };
  prev_month: {
    total_out: number;
    by_bucket_out: { needs: number; wants: number; savings: number };
  };
};

const ICON_EMOJI: Record<string, string> = {
  home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
  car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
  'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
  'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
  gift: '🎁', scale: '⚖️', phone: '📞', book: '📚', music: '🎵',
};

export async function computeMonthContext(
  supabase: SupabaseClient,
  userId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<MonthContext> {
  const weekStartStr = monthStart.toISOString().split('T')[0];
  const weekEndStr = monthEnd.toISOString().split('T')[0];

  // Prev month: same duration, shifted back ~30 days
  const periodDays = Math.round((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
  const prevStart = new Date(monthStart);
  prevStart.setUTCDate(prevStart.getUTCDate() - periodDays - 1);
  const prevEnd = new Date(monthStart);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

  const [profileRes, bucketsRes, txnsRes, prevTxnsRes, goalsRes, streakRes] = await Promise.all([
    supabase.from('profiles').select('full_name, monthly_income, needs_percent, wants_percent, savings_percent').eq('id', userId).single(),
    supabase.from('budget_buckets').select('id, name, display_name').eq('user_id', userId),
    supabase.from('transactions')
      .select('amount, type, transaction_date, category:categories(name, icon, bucket_id)')
      .eq('user_id', userId)
      .gte('transaction_date', weekStartStr)
      .lte('transaction_date', weekEndStr),
    supabase.from('transactions')
      .select('amount, type, category:categories(name, icon, bucket_id)')
      .eq('user_id', userId)
      .gte('transaction_date', prevStart.toISOString().split('T')[0])
      .lte('transaction_date', prevEnd.toISOString().split('T')[0]),
    supabase.from('goals')
      .select('name, target_amount, current_amount, deadline')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .eq('is_completed', false),
    supabase.from('streaks').select('logging_current, logging_last_date').eq('user_id', userId).single(),
  ]);

  const profile = profileRes.data;
  const buckets = bucketsRes.data ?? [];
  const txns = txnsRes.data ?? [];
  const prevTxns = prevTxnsRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const streak = streakRes.data;

  const monthlyIncome = profile?.monthly_income ?? 0;
  const weeklyBudget = monthlyIncome;

  // Bucket ID → name map
  const bucketMap: Record<string, string> = {};
  for (const b of buckets) bucketMap[b.id] = b.name;

  // Bucket budgets
  const needsPct = (profile?.needs_percent ?? 50) / 100;
  const wantsPct = (profile?.wants_percent ?? 30) / 100;
  const futurePct = (profile?.savings_percent ?? 20) / 100;

  // Aggregate current month
  let totalIn = 0, totalOut = 0;
  const bucketSpend: Record<string, number> = { needs: 0, wants: 0, savings: 0 };
  const catMap: Record<string, { name: string; emoji: string; bucket: string; total: number; count: number }> = {};
  const loggedDates = new Set<string>();

  for (const tx of txns) {
    const cat = (Array.isArray(tx.category) ? tx.category[0] : tx.category) as { name: string; icon: string | null; bucket_id: string | null } | null;
    loggedDates.add(tx.transaction_date);

    if (tx.type === 'income') {
      totalIn += tx.amount;
    } else if (tx.type === 'expense') {
      totalOut += tx.amount;
      const bucketName = cat?.bucket_id ? (bucketMap[cat.bucket_id] ?? 'needs') : 'needs';
      bucketSpend[bucketName] = (bucketSpend[bucketName] ?? 0) + tx.amount;

      if (cat?.name) {
        if (!catMap[cat.name]) {
          catMap[cat.name] = {
            name: cat.name,
            emoji: ICON_EMOJI[cat.icon ?? ''] ?? '💸',
            bucket: bucketName,
            total: 0,
            count: 0,
          };
        }
        catMap[cat.name].total += tx.amount;
        catMap[cat.name].count += 1;
      }
    }
  }

  // Aggregate prev month for deltas
  const prevCatTotals: Record<string, number> = {};
  let prevTotalOut = 0;
  const prevBucketSpend: Record<string, number> = { needs: 0, wants: 0, savings: 0 };

  for (const tx of prevTxns) {
    const cat = (Array.isArray(tx.category) ? tx.category[0] : tx.category) as { name: string; icon: string | null; bucket_id: string | null } | null;
    if (tx.type === 'expense') {
      prevTotalOut += tx.amount;
      const bucketName = cat?.bucket_id ? (bucketMap[cat.bucket_id] ?? 'needs') : 'needs';
      prevBucketSpend[bucketName] = (prevBucketSpend[bucketName] ?? 0) + tx.amount;
      if (cat?.name) prevCatTotals[cat.name] = (prevCatTotals[cat.name] ?? 0) + tx.amount;
    }
  }

  const topCategories = Object.values(catMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      emoji: c.emoji,
      bucket: c.bucket,
      total: c.total,
      txn_count: c.count,
      delta_vs_prev_month: c.total - (prevCatTotals[c.name] ?? 0),
    }));

  const needsBudget = weeklyBudget * needsPct;
  const wantsBudget = weeklyBudget * wantsPct;
  const savingsCommitment = weeklyBudget * futurePct;

  return {
    user: {
      name: profile?.full_name ?? 'Sika User',
      monthly_income: monthlyIncome,
    },
    month: {
      start: weekStartStr,
      end: weekEndStr,
      total_in: totalIn,
      total_out: totalOut,
      transaction_count: txns.length,
    },
    by_bucket: {
      needs: {
        spent: bucketSpend.needs,
        budget: needsBudget,
        pct: needsBudget > 0 ? Math.round((bucketSpend.needs / needsBudget) * 100) : 0,
      },
      wants: {
        spent: bucketSpend.wants,
        budget: wantsBudget,
        pct: wantsBudget > 0 ? Math.round((bucketSpend.wants / wantsBudget) * 100) : 0,
      },
      savings: {
        spent: bucketSpend.savings,
        commitment: savingsCommitment,
        pct: savingsCommitment > 0 ? Math.round((bucketSpend.savings / savingsCommitment) * 100) : 0,
      },
    },
    top_categories: topCategories,
    goals: goals.map((g) => ({
      name: g.name,
      target: g.target_amount,
      saved: g.current_amount ?? 0,
      pct: g.target_amount > 0 ? Math.round(((g.current_amount ?? 0) / g.target_amount) * 100) : 0,
      deadline: g.deadline ?? null,
    })),
    streak: {
      current_days: streak?.logging_current ?? 0,
      logged_this_month: loggedDates.size,
    },
    prev_month: {
      total_out: prevTotalOut,
      by_bucket_out: {
        needs: prevBucketSpend.needs,
        wants: prevBucketSpend.wants,
        savings: prevBucketSpend.savings,
      },
    },
  };
}
