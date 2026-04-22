import type { SupabaseClient } from '@supabase/supabase-js';

type InsightContext = {
  today: string;
  user: { name: string };
  cycle: {
    day_of_cycle: number;
    cycle_length: number;
    days_remaining: number;
  };
  buckets: {
    needs: { spent: number; budget: number; pct: number; pct_time: number };
    wants: { spent: number; budget: number; pct: number; pct_time: number };
    future: { spent: number; commitment: number; pct: number };
  };
  recent: {
    last_24h_spend: number;
    last_24h_txn_count: number;
    yesterday_spend: number;
    past_7d_by_category: Array<{ name: string; emoji: string; total: number }>;
  };
  streak: {
    current_days: number;
    logged_today: boolean;
  };
  goals: Array<{ name: string; pct: number; days_to_deadline: number | null }>;
  subscription_activity_last_7d: {
    count: number;
    total: number;
  };
};

const ICON_EMOJI: Record<string, string> = {
  home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
  car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
  'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
  'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
  gift: '🎁', scale: '⚖️', phone: '📞', book: '📚', music: '🎵',
};

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function computeInsightContext(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<InsightContext> {
  const today = toDateStr(now);

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = toDateStr(yesterday);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const sevenDaysAgoStr = toDateStr(sevenDaysAgo);

  const [profileRes, bucketsRes, recentTxnsRes, goalsRes, streakRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, monthly_income, needs_percent, wants_percent, future_percent, cycle_start_day')
      .eq('id', userId)
      .single(),
    supabase.from('budget_buckets').select('id, name').eq('user_id', userId),
    supabase
      .from('transactions')
      .select('amount, type, transaction_date, category:categories(name, icon, bucket_id), note')
      .eq('user_id', userId)
      .gte('transaction_date', sevenDaysAgoStr)
      .lte('transaction_date', today),
    supabase
      .from('goals')
      .select('name, target_amount, current_amount, deadline')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .eq('is_completed', false)
      .order('created_at')
      .limit(3),
    supabase
      .from('streaks')
      .select('logging_current, logging_last_date')
      .eq('user_id', userId)
      .single(),
  ]);

  const profile = profileRes.data;
  const buckets = bucketsRes.data ?? [];
  const txns = recentTxnsRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const streak = streakRes.data;

  // Bucket map
  const bucketMap: Record<string, string> = {};
  for (const b of buckets) bucketMap[b.id] = b.name;

  const monthlyIncome = profile?.monthly_income ?? 0;
  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const needsPct = (profile?.needs_percent ?? 50) / 100;
  const wantsPct = (profile?.wants_percent ?? 30) / 100;
  const futurePct = (profile?.future_percent ?? 20) / 100;

  // Cycle position
  const todayDay = now.getUTCDate();
  let dayOfCycle: number;
  if (todayDay >= cycleStartDay) {
    dayOfCycle = todayDay - cycleStartDay + 1;
  } else {
    // We're in next calendar month but same cycle
    const daysInPrevMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0).getUTCDate();
    dayOfCycle = daysInPrevMonth - cycleStartDay + todayDay + 1;
  }
  const cycleLength = 30; // approximate
  const daysRemaining = Math.max(0, cycleLength - dayOfCycle);
  const pctTime = Math.round((dayOfCycle / cycleLength) * 100);

  // Determine cycle start date for budget aggregation
  let cycleStartStr: string;
  if (todayDay >= cycleStartDay) {
    cycleStartStr = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), cycleStartDay)));
  } else {
    cycleStartStr = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, cycleStartDay)));
  }

  // Aggregate
  const bucketSpend: Record<string, number> = { needs: 0, wants: 0, future: 0 };
  const catMap: Record<string, { name: string; emoji: string; total: number }> = {};
  let last24hSpend = 0, last24hCount = 0, yesterdaySpend = 0;
  let subCount = 0, subTotal = 0;
  let loggedToday = false;

  for (const tx of txns) {
    const cat = (Array.isArray(tx.category) ? tx.category[0] : tx.category) as {
      name: string; icon: string | null; bucket_id: string | null;
    } | null;

    if (tx.transaction_date === today) loggedToday = true;

    if (tx.type === 'expense') {
      const bucketName = cat?.bucket_id ? (bucketMap[cat.bucket_id] ?? 'needs') : 'needs';

      // Only count cycle spend (from cycle start to today)
      if (tx.transaction_date >= cycleStartStr) {
        bucketSpend[bucketName] = (bucketSpend[bucketName] ?? 0) + tx.amount;
      }

      // Recent
      if (tx.transaction_date === today) {
        last24hSpend += tx.amount;
        last24hCount += 1;
      }
      if (tx.transaction_date === yesterdayStr) {
        yesterdaySpend += tx.amount;
      }

      // Category map (7d)
      if (cat?.name) {
        if (!catMap[cat.name]) catMap[cat.name] = { name: cat.name, emoji: ICON_EMOJI[cat.icon ?? ''] ?? '💸', total: 0 };
        catMap[cat.name].total += tx.amount;
      }

      // Subscription heuristic: recurring notes or "subscription" category names
      const isSubLike = cat?.name?.toLowerCase().includes('subscription') ||
        (tx.note ?? '').toLowerCase().includes('subscription') ||
        cat?.icon === 'repeat';
      if (isSubLike) {
        subCount += 1;
        subTotal += tx.amount;
      }
    }
  }

  const past7dByCategory = Object.values(catMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(({ name, emoji, total }) => ({ name, emoji, total }));

  const needsBudget = monthlyIncome * needsPct;
  const wantsBudget = monthlyIncome * wantsPct;
  const futureCommitment = monthlyIncome * futurePct;

  return {
    today,
    user: { name: profile?.full_name ?? 'Sika User' },
    cycle: { day_of_cycle: dayOfCycle, cycle_length: cycleLength, days_remaining: daysRemaining },
    buckets: {
      needs: {
        spent: bucketSpend.needs,
        budget: needsBudget,
        pct: needsBudget > 0 ? Math.round((bucketSpend.needs / needsBudget) * 100) : 0,
        pct_time: pctTime,
      },
      wants: {
        spent: bucketSpend.wants,
        budget: wantsBudget,
        pct: wantsBudget > 0 ? Math.round((bucketSpend.wants / wantsBudget) * 100) : 0,
        pct_time: pctTime,
      },
      future: {
        spent: bucketSpend.future,
        commitment: futureCommitment,
        pct: futureCommitment > 0 ? Math.round((bucketSpend.future / futureCommitment) * 100) : 0,
      },
    },
    recent: {
      last_24h_spend: last24hSpend,
      last_24h_txn_count: last24hCount,
      yesterday_spend: yesterdaySpend,
      past_7d_by_category: past7dByCategory,
    },
    streak: {
      current_days: streak?.logging_current ?? 0,
      logged_today: loggedToday,
    },
    goals: goals.map((g) => {
      let daysToDeadline: number | null = null;
      if (g.deadline) {
        daysToDeadline = Math.round(
          (new Date(g.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
      }
      return {
        name: g.name,
        pct: g.target_amount > 0 ? Math.round(((g.current_amount ?? 0) / g.target_amount) * 100) : 0,
        days_to_deadline: daysToDeadline,
      };
    }),
    subscription_activity_last_7d: { count: subCount, total: subTotal },
  };
}
