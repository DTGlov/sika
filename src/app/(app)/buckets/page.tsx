'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTransactionStore } from '@/stores/transaction-store';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useProfile } from '@/hooks/use-profile';
import { getCycleForDate } from '@/lib/cycle';
import { formatGHS } from '@/lib/utils';
import { BUCKET_CONFIG } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { BucketName } from '@/types';

const BUCKETS: BucketName[] = ['needs', 'wants', 'future'];

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
  const profile = useAuthStore((s) => s.profile);
  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const cycle = getCycleForDate(new Date(), cycleStartDay);

  useProfile();
  const { loading } = useDashboardData(cycle.startDateStr);

  const dashboardStats = useTransactionStore((s) => s.dashboardStats);
  const transactions = useTransactionStore((s) => s.transactions);

  const [activeTab, setActiveTab] = useState<BucketName>('needs');

  const bucketTransactions = useMemo(() => {
    return transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          t.category?.bucket?.name === activeTab
      )
      .sort(
        (a, b) =>
          new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
      )
      .slice(0, 20);
  }, [transactions, activeTab]);

  const config = BUCKET_CONFIG[activeTab];
  const spent = dashboardStats?.bucketSpend[activeTab] ?? 0;
  const limit = dashboardStats?.bucketLimits[activeTab] ?? 0;
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
          {cycle.label}
        </p>

        {/* Tab row */}
        <div className="flex gap-2 mb-7 border-b border-border pb-1">
          {BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => setActiveTab(b)}
              className={cn(
                'flex-1 py-2.5 px-2 rounded-lg text-sm transition-colors',
                activeTab === b
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {BUCKET_CONFIG[b].label}
            </button>
          ))}
        </div>

        {/* Active bucket header */}
        {loading && !dashboardStats ? (
          <div className="mb-7 space-y-3">
            <Skeleton className="h-10 w-48 rounded-xl bg-muted" />
            <Skeleton className="h-1 rounded-full bg-muted" />
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

        {loading && transactions.length === 0 ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl bg-card" />
            ))}
          </div>
        ) : bucketTransactions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No {config.label.toLowerCase()} expenses this cycle.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {bucketTransactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center gap-3 px-1 py-3 border-b border-border/50 last:border-0 sika-sensitive"
              >
                <span className="text-lg shrink-0">
                  {categoryEmoji(txn.category?.icon)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {txn.note ?? txn.category?.name ?? 'Transaction'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTxDate(txn.transaction_date)}
                    {txn.category?.name && txn.note && (
                      <span className="ml-1.5 text-muted-foreground/60">
                        · {txn.category.name}
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-medium text-foreground tabular-nums shrink-0">
                  {formatGHS(txn.amount)}
                </span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
