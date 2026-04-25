'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTransactionStore } from '@/stores/transaction-store';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { getCycleForDate } from '@/lib/cycle';
import { createClient } from '@/lib/supabase/client';
import { formatGHS } from '@/lib/utils';
import { BUCKET_CONFIG } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { BudgetBucket, BucketName } from '@/types';

interface RawCategory {
  id: string;
  name: string;
  icon: string | null;
  bucket_id: string | null;
  is_archived: boolean;
}

interface RawTransaction {
  id: string;
  amount: number;
  type: string;
  category_id: string | null;
  transaction_date: string;
  note: string | null;
}

const ICON_MAP: Record<string, string> = {
  home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
  car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
  'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
  'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
  gift: '🎁',
};

function categoryEmoji(icon: string | null | undefined): string {
  if (!icon) return '💸';
  return ICON_MAP[icon] ?? '💸';
}

function formatTxDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

export default function BucketsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  useProfile();

  const dashboardStats = useTransactionStore((s) => s.dashboardStats);

  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const cycle = getCycleForDate(new Date(), cycleStartDay);

  // All data fetched directly — the transaction store's `transactions` array
  // only holds session-added transactions, not the full cycle history.
  const [buckets, setBuckets] = useState<BudgetBucket[]>([]);
  const [categories, setCategories] = useState<RawCategory[]>([]);
  const [transactions, setTransactions] = useState<RawTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const cycleStart = format(cycle.start, 'yyyy-MM-dd');
    const cycleEnd = format(cycle.end, 'yyyy-MM-dd');

    Promise.all([
      supabase
        .from('budget_buckets')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order'),
      supabase
        .from('categories')
        .select('id, name, icon, bucket_id, is_archived')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq('is_archived', false),
      supabase
        .from('transactions')
        .select('id, amount, type, category_id, transaction_date, note')
        .eq('user_id', user.id)
        .gte('transaction_date', cycleStart)
        .lte('transaction_date', cycleEnd)
        .eq('type', 'expense')
        .order('transaction_date', { ascending: false }),
    ]).then(([{ data: bkts }, { data: cats }, { data: txns }]) => {
      if (bkts && bkts.length > 0) {
        setBuckets(bkts as BudgetBucket[]);
        const needs = bkts.find((b) => b.name === 'needs');
        setActiveTab(needs?.id ?? bkts[0].id);
      }
      if (cats) setCategories(cats as RawCategory[]);
      if (txns) setTransactions(txns as RawTransaction[]);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Set of category IDs belonging to the active bucket
  const bucketCategoryIds = useMemo(() => {
    if (!activeTab) return new Set<string>();
    return new Set(
      categories
        .filter((c) => c.bucket_id === activeTab)
        .map((c) => c.id)
    );
  }, [categories, activeTab]);

  // Transactions for the active bucket, sorted newest-first
  const bucketTransactions = useMemo(() => {
    if (!activeTab || bucketCategoryIds.size === 0) return [];
    return transactions
      .filter((t) => t.category_id != null && bucketCategoryIds.has(t.category_id))
      .slice(0, 20);
  }, [transactions, bucketCategoryIds, activeTab]);

  const activeBucket = buckets.find((b) => b.id === activeTab);
  const activeBucketName = activeBucket?.name as BucketName | undefined;
  const config = activeBucketName ? BUCKET_CONFIG[activeBucketName] : BUCKET_CONFIG.needs;
  const spent = activeBucketName ? (dashboardStats?.bucketSpend[activeBucketName] ?? 0) : 0;
  const limit = activeBucketName ? (dashboardStats?.bucketLimits[activeBucketName] ?? 0) : 0;
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const remaining = Math.max(0, limit - spent);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">

        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <h1 className="text-2xl font-bold text-foreground mb-1">Buckets</h1>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-6">
          This month
        </p>

        {/* Tab row */}
        {loading ? (
          <div className="flex gap-2 mb-7 border-b border-border pb-1">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="flex-1 h-10 rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <div className="flex gap-2 mb-7 border-b border-border pb-1">
            {buckets.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveTab(b.id)}
                className={cn(
                  'flex-1 py-2.5 px-2 rounded-lg text-sm transition-colors',
                  activeTab === b.id
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {b.display_name}
              </button>
            ))}
          </div>
        )}

        {/* Active bucket header */}
        {loading || !dashboardStats ? (
          <div className="mb-7 space-y-3">
            <Skeleton className="h-10 w-48 rounded-xl bg-muted" />
            <Skeleton className="h-1.5 rounded-full bg-muted" />
            <Skeleton className="h-4 w-24 rounded bg-muted" />
          </div>
        ) : (
          <div className="mb-7">
            <p className="text-xs text-muted-foreground mb-1">{config.description}</p>
            <p className="text-3xl font-bold text-foreground sika-sensitive">
              {formatGHS(spent)}
              <span className="text-sm text-muted-foreground font-normal ml-2">
                of {formatGHS(limit)}
              </span>
            </p>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-3 mb-2">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: config.color }}
              />
            </div>
            <p className="text-xs text-muted-foreground sika-sensitive">
              {formatGHS(remaining)} remaining
            </p>
          </div>
        )}

        {/* Transactions */}
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">
          Recent in {config.label}
        </p>

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl bg-card" />
            ))}
          </div>
        ) : bucketTransactions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No {config.label.toLowerCase()} expenses yet this month.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {bucketTransactions.map((txn) => {
              const txCategory = categories.find((c) => c.id === txn.category_id);
              return (
                <div
                  key={txn.id}
                  className="flex items-center gap-3 px-1 py-3 border-b border-border/50 last:border-0 sika-sensitive"
                >
                  <span className="text-lg shrink-0">
                    {categoryEmoji(txCategory?.icon)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {txn.note ?? txCategory?.name ?? 'Transaction'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTxDate(txn.transaction_date)}
                      {txCategory?.name && txn.note && (
                        <span className="ml-1.5 text-muted-foreground/60">
                          · {txCategory.name}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-foreground tabular-nums shrink-0">
                    {formatGHS(txn.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
