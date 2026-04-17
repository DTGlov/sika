'use client';

import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/top-bar';
import { BucketRing } from '@/components/dashboard/bucket-ring';
import { SpendCard } from '@/components/dashboard/spend-card';
import { WeeklyChart } from '@/components/dashboard/weekly-chart';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { OnboardingModal } from '@/components/dashboard/onboarding-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useProfile } from '@/hooks/use-profile';
import type { BucketName } from '@/types';

const BUCKETS: BucketName[] = ['needs', 'wants', 'future'];

export default function DashboardPage() {
  const { profile } = useAuthStore();
  const { dashboardStats } = useTransactionStore();
  const { loading } = useDashboardData();
  useProfile();

  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (profile && profile.monthly_income === 0) {
      setShowOnboarding(true);
    }
  }, [profile]);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <TopBar />

      <div className="px-4 md:px-8 space-y-4">
        {/* Bucket rings */}
        <div className="grid grid-cols-3 gap-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl bg-[#141416]" />
              ))
            : BUCKETS.map((bucket, i) => (
                <BucketRing
                  key={bucket}
                  bucket={bucket}
                  spent={dashboardStats?.bucketSpend[bucket] ?? 0}
                  limit={dashboardStats?.bucketLimits[bucket] ?? 0}
                  index={i}
                />
              ))}
        </div>

        {/* Spend summary cards */}
        <div className="grid grid-cols-2 gap-3">
          {loading ? (
            <>
              <Skeleton className="h-24 rounded-2xl bg-[#141416]" />
              <Skeleton className="h-24 rounded-2xl bg-[#141416]" />
            </>
          ) : (
            <>
              <SpendCard
                title="Today"
                amount={dashboardStats?.totalSpentToday ?? 0}
                index={0}
              />
              <SpendCard
                title="This Month"
                amount={dashboardStats?.totalSpentThisMonth ?? 0}
                compareAmount={dashboardStats?.totalSpentLastMonth}
                compareLabel="last month"
                index={1}
              />
            </>
          )}
        </div>

        {/* Weekly chart */}
        {loading ? (
          <Skeleton className="h-52 rounded-2xl bg-[#141416]" />
        ) : (
          <WeeklyChart data={dashboardStats?.weeklySpend ?? []} />
        )}

        {/* Recent transactions */}
        {loading ? (
          <Skeleton className="h-64 rounded-2xl bg-[#141416]" />
        ) : (
          <RecentTransactions transactions={dashboardStats?.recentTransactions ?? []} />
        )}
      </div>

      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
