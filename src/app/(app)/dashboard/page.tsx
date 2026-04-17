'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { format, parse, addMonths, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentMonthStr = format(new Date(), 'yyyy-MM');
  const rawParam = searchParams.get('month') ?? '';
  const selectedMonthStr = /^\d{4}-\d{2}$/.test(rawParam) ? rawParam : currentMonthStr;
  const isCurrentMonth = selectedMonthStr === currentMonthStr;

  const selectedMonthDate = parse(selectedMonthStr, 'yyyy-MM', new Date());
  const monthLabel = format(startOfMonth(selectedMonthDate), 'MMMM yyyy');

  function navigateMonth(delta: -1 | 1) {
    const next = addMonths(selectedMonthDate, delta);
    const nextStr = format(next, 'yyyy-MM');
    if (delta === 1 && nextStr > currentMonthStr) return;
    router.push(`${pathname}?month=${nextStr}`);
  }

  const { profile, incomeSources } = useAuthStore();
  const { dashboardStats } = useTransactionStore();
  const { loading } = useDashboardData(selectedMonthStr);
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
    <div className="max-w-2xl mx-auto pb-8">
      <TopBar />

      <div className="px-4 md:px-8 space-y-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigateMonth(-1)}
            aria-label="Previous month"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center">
            <h2 className="text-[#FAFAFA] font-bold text-lg leading-tight tabular-nums">
              {monthLabel}
            </h2>
            {!isCurrentMonth && (
              <span className="text-[#71717A] text-[10px] font-medium uppercase tracking-wider">
                Viewing past month
              </span>
            )}
          </div>

          <button
            onClick={() => navigateMonth(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
            style={{ color: isCurrentMonth ? '#3F3F46' : '#71717A' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Income summary row */}
        {monthlyIncome > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowIncomeBreakdown(v => !v)}
              className="flex items-center gap-1.5 text-sm transition-colors"
            >
              <span className="text-[#FAFAFA] font-semibold tabular-nums">{formatGHS(monthlyIncome)}</span>
              <span className="text-[#71717A]">/mo</span>
              {activeSources.length > 1 && (
                <span className="text-[#52525B] text-[10px] ml-0.5">
                  {showIncomeBreakdown ? '▴' : '▾'}
                </span>
              )}
            </button>

            {showIncomeBreakdown && activeSources.length > 1 && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-[#1C1C1F] border border-[#27272A] rounded-xl px-3 py-2.5 shadow-xl">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {activeSources.map(s => (
                    <span key={s.id} className="text-[#A1A1AA] text-xs whitespace-nowrap">
                      {s.name}{' '}
                      <span className="text-[#FAFAFA]">{formatGHSCompact(s.amount)}</span>
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
                title={isCurrentMonth ? 'Today' : 'Last day'}
                amount={dashboardStats?.totalSpentToday ?? 0}
                index={0}
              />
              <SpendCard
                title={isCurrentMonth ? 'This Month' : monthLabel.split(' ')[0]}
                amount={dashboardStats?.totalSpentThisMonth ?? 0}
                compareAmount={dashboardStats?.totalSpentLastMonth}
                compareLabel="prev month"
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

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-4">
          <Skeleton className="h-8 w-48 rounded-xl bg-[#141416]" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl bg-[#141416]" />
            ))}
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
