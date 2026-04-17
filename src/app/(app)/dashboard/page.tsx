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
import { totalMonthlyIncome, FREQUENCY_LABELS } from '@/lib/income';
import { formatGHS, formatGHSCompact } from '@/lib/utils';
import type { BucketName } from '@/types';

const BUCKETS: BucketName[] = ['needs', 'wants', 'future'];

export default function DashboardPage() {
  const { profile, incomeSources } = useAuthStore();
  const { dashboardStats } = useTransactionStore();
  const { loading } = useDashboardData();
  useProfile();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showIncomeBreakdown, setShowIncomeBreakdown] = useState(false);

  useEffect(() => {
    if (profile && profile.monthly_income === 0 && incomeSources.length === 0) {
      setShowOnboarding(true);
    }
  }, [profile, incomeSources]);

  const monthlyIncome = incomeSources.length > 0
    ? totalMonthlyIncome(incomeSources)
    : profile?.monthly_income ?? 0;

  const activeSources = incomeSources.filter(s => s.is_active);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <TopBar />

      <div className="px-4 md:px-8 space-y-4">
        {/* Income summary row */}
        {monthlyIncome > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowIncomeBreakdown(v => !v)}
              className="flex items-center gap-2 text-sm text-[#71717A] hover:text-[#A1A1AA] transition-colors"
            >
              <span className="text-[#FAFAFA] font-semibold">{formatGHS(monthlyIncome)}</span>
              <span>/mo</span>
              {activeSources.length > 1 && (
                <span className="text-[#52525B] text-xs">▾</span>
              )}
            </button>

            {showIncomeBreakdown && activeSources.length > 1 && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-[#1C1C1F] border border-[#27272A] rounded-xl px-3 py-2.5 shadow-xl">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {activeSources.map(s => (
                    <span key={s.id} className="text-[#A1A1AA] text-xs whitespace-nowrap">
                      {s.name} <span className="text-[#FAFAFA]">{formatGHSCompact(s.amount)}</span>
                      {s.frequency !== 'monthly' && (
                        <span className="text-[#52525B]"> {FREQUENCY_LABELS[s.frequency].toLowerCase()}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
