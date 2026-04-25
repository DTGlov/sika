'use client';

import Link from 'next/link';
import { useTransactionStore } from '@/stores/transaction-store';
import { formatGHS } from '@/lib/utils';
import { BUCKET_CONFIG } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import type { BucketName } from '@/types';

const BUCKETS: BucketName[] = ['needs', 'wants', 'future'];

export function BucketStrip() {
  const dashboardStats = useTransactionStore((s) => s.dashboardStats);

  if (!dashboardStats) {
    return <Skeleton className="h-40 rounded-2xl bg-card" />;
  }

  return (
    <Link
      href="/buckets"
      className="block bg-card border border-border rounded-2xl p-5 hover:bg-card/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Buckets · This cycle
        </p>
        <span className="text-muted-foreground text-sm">→</span>
      </div>

      <div className="flex flex-col gap-4">
        {BUCKETS.map((bucket) => {
          const config = BUCKET_CONFIG[bucket];
          const spent = dashboardStats.bucketSpend[bucket] ?? 0;
          const limit = dashboardStats.bucketLimits[bucket] ?? 0;
          const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;

          return (
            <div key={bucket}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm text-foreground">{config.label}</span>
                <span className="text-xs text-muted-foreground sika-sensitive">
                  {formatGHS(spent)} of {formatGHS(limit)}
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: config.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
