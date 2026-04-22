'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { TopBar } from '@/components/layout/top-bar';
import { BucketRing } from '@/components/dashboard/bucket-ring';
import { SpendCard } from '@/components/dashboard/spend-card';
import { WeeklyChart } from '@/components/dashboard/weekly-chart';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { OnboardingModal } from '@/components/dashboard/onboarding-modal';
import { IncomeNudgeCard, PendingRecurringCard } from '@/components/dashboard/income-nudge-card';
import { HintCard, BucketsTooltip } from '@/components/hint-card';
import { GoalsWidget } from '@/components/dashboard/goals-widget';
import { HealthRow } from '@/components/dashboard/health-row';
import { SikaDailyBanner } from '@/components/dashboard/sika-daily-banner';
import { SikaMonthlyBanner } from '@/components/dashboard/sika-monthly-banner';
import { InsightStrip } from '@/components/dashboard/insight-strip';
import { ShouldIBuyButton } from '@/components/decision/should-i-buy-button';
import { SundayRecapCard } from '@/components/dashboard/sunday-recap-card';
import { CycleCard } from '@/components/dashboard/cycle-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useProfile } from '@/hooks/use-profile';
import { useStreakHealth } from '@/hooks/use-streaks';
import { totalMonthlyIncome, FREQUENCY_LABELS } from '@/lib/income';
import { formatGHS, formatGHSCompact } from '@/lib/utils';
import { ACCOUNT_TYPE_CONFIG } from '@/lib/accounts';
import { getCycleForDate, getCycleAtOffset, parseCycleParam, getCycleFromStartDate } from '@/lib/cycle';
import { getDueIncomeNudges, recordNudgeDismissal } from '@/lib/income-nudges';
import { confirmPendingRecurring, skipPendingRecurring } from '@/lib/recurring';
import { revalidateForEntity } from '@/lib/revalidation';
import { checkAndUnlockBadges } from '@/lib/badges';
import { createClient } from '@/lib/supabase/client';
import { fetchGoals, fetchGoalAmounts, computeGoalProgress } from '@/lib/goals';
import type { BucketName, IncomeNudge, RecurringTransaction } from '@/types';
import type { GoalProgress } from '@/types/goal';
import type { DailyDigest } from '@/types/daily';
import type { DailyInsightRow } from '@/types/insight';

const BUCKETS: BucketName[] = ['needs', 'wants', 'future'];

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const { profile, incomeSources, accounts, user, enqueueBadgeCelebrations } = useAuthStore();
  useStreakHealth();
  const { dashboardStats } = useTransactionStore();
  const cycleStartDay = profile?.cycle_start_day ?? 1;

  const rawParam = searchParams.get('cycle') ?? '';
  const parsedParam = parseCycleParam(rawParam);
  const cycle = parsedParam
    ? getCycleFromStartDate(parsedParam, cycleStartDay)
    : getCycleForDate(new Date(), cycleStartDay);

  function navigateCycle(delta: -1 | 1) {
    const next = getCycleAtOffset(cycle.start, cycleStartDay, delta);
    if (delta === 1 && next.start > new Date()) return;
    router.push(`${pathname}?cycle=${next.startDateStr}`);
  }

  const { loading, pendingRecurring, setPendingRecurring } = useDashboardData(cycle.startDateStr);
  useProfile();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showIncomeBreakdown, setShowIncomeBreakdown] = useState(false);
  const [nudges, setNudges] = useState<IncomeNudge[]>([]);
  const [goalProgresses, setGoalProgresses] = useState<GoalProgress[]>([]);
  const [todayDigest, setTodayDigest] = useState<DailyDigest | null>(null);
  const [digestRead, setDigestRead] = useState(false);
  const [digestLoading, setDigestLoading] = useState(true);
  const [monthlyRecapId, setMonthlyRecapId] = useState<string | null>(null);
  const [todayInsight, setTodayInsight] = useState<DailyInsightRow | null>(null);

  useEffect(() => {
    if (profile && profile.monthly_income === 0 && incomeSources.length === 0) {
      setShowOnboarding(true);
    }
  }, [profile, incomeSources]);

  // Fetch today's digest and read status
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from('sika_daily_digests')
      .select('*')
      .eq('digest_date', today)
      .single()
      .then(({ data: digest }) => {
        if (!digest) { setDigestLoading(false); return; }
        setTodayDigest(digest as DailyDigest);
        supabase
          .from('user_daily_reads')
          .select('id')
          .eq('user_id', user.id)
          .eq('digest_date', today)
          .single()
          .then(({ data: read }) => {
            setDigestRead(!!read);
            setDigestLoading(false);
          });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch latest unread monthly recap
  useEffect(() => {
    if (!user) return;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    supabase
      .from('monthly_recaps')
      .select('id, viewed_at, generated_at')
      .eq('user_id', user.id)
      .is('viewed_at', null)
      .gte('generated_at', thirtyDaysAgo.toISOString())
      .order('month_start', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setMonthlyRecapId(data.id);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch today's AI insight
  useEffect(() => {
    if (!user) return;
    fetch('/api/insights/today')
      .then(r => r.json())
      .then(({ insight }) => {
        if (insight && !insight.dismissed_at) setTodayInsight(insight);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Check cycle-ended badges on dashboard load
  useEffect(() => {
    if (!user) return;
    checkAndUnlockBadges(supabase, user.id, 'cycle_ended').then(({ newlyUnlocked }) => {
      if (newlyUnlocked.length > 0) {
        enqueueBadgeCelebrations(newlyUnlocked);
        revalidateForEntity('badge_unlocked');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch income nudges once profile + income sources are available
  useEffect(() => {
    if (!user || incomeSources.length === 0) return;
    getDueIncomeNudges(supabase, user.id, incomeSources).then(setNudges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, incomeSources]);

  // Fetch top goals for widget
  useEffect(() => {
    if (!user || accounts.length === 0) return;
    fetchGoals(supabase, user.id).then(async goals => {
      const top3 = goals.slice(0, 3);
      const progresses = await Promise.all(
        top3.map(async goal => {
          const { net: amt } = await fetchGoalAmounts(supabase, goal.id);
          const acct = accounts.find(a => a.id === goal.funding_account_id) ?? accounts[0];
          return computeGoalProgress(goal, amt, acct);
        })
      );
      setGoalProgresses(progresses);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accounts]);

  async function handleLogNudge(nudge: IncomeNudge) {
    if (!user) return;
    const defaultAccount = accounts.find(a => a.is_default) ?? accounts[0];
    if (!defaultAccount) { toast.error('No account found'); return; }

    const today = format(new Date(), 'yyyy-MM-dd');
    await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: defaultAccount.id,
      category_id: null,
      amount: nudge.incomeSource.amount,
      type: 'income',
      note: nudge.incomeSource.name,
      transaction_date: today,
    });
    await recordNudgeDismissal(supabase, user.id, nudge.incomeSource.id, nudge.dueDate, 'logged');
    setNudges(prev => prev.filter(n => n.incomeSource.id !== nudge.incomeSource.id));
    revalidateForEntity('transaction');
    toast.success(`Logged ${formatGHS(nudge.incomeSource.amount)} income`);
  }

  async function handleSnoozeNudge(nudge: IncomeNudge) {
    if (!user) return;
    await recordNudgeDismissal(supabase, user.id, nudge.incomeSource.id, nudge.dueDate, 'snoozed');
    setNudges(prev => prev.filter(n => n.incomeSource.id !== nudge.incomeSource.id));
    toast('Reminder snoozed — we\'ll check again tomorrow');
  }

  async function handleDismissNudge(nudge: IncomeNudge) {
    if (!user) return;
    await recordNudgeDismissal(supabase, user.id, nudge.incomeSource.id, nudge.dueDate, 'dismissed');
    setNudges(prev => prev.filter(n => n.incomeSource.id !== nudge.incomeSource.id));
  }

  async function handleConfirmPending(item: RecurringTransaction, dueDate: string) {
    if (!user) return;
    await confirmPendingRecurring(supabase, user.id, item, dueDate);
    setPendingRecurring(prev => prev.filter(p => p.recurring.id !== item.id));
    revalidateForEntity('transaction');
    toast.success('Transaction logged');
  }

  async function handleSkipPending(item: RecurringTransaction, dueDate: string) {
    await skipPendingRecurring(supabase, item.id, dueDate);
    setPendingRecurring(prev => prev.filter(p => p.recurring.id !== item.id));
  }

  const monthlyIncome = incomeSources.length > 0
    ? totalMonthlyIncome(incomeSources)
    : profile?.monthly_income ?? 0;

  const activeSources = incomeSources.filter(s => s.is_active);
  const hasNudges = nudges.length > 0 || pendingRecurring.length > 0;

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <TopBar />

      <div className="px-4 md:px-8 space-y-4">
        {/* Cycle navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigateCycle(-1)}
            aria-label="Previous month"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center">
            <h2 className="text-[#FAFAFA] font-bold text-lg leading-tight tabular-nums">
              {cycle.label}
            </h2>
            {!cycle.isCurrent && (
              <span className="text-[#71717A] text-[10px] font-medium uppercase tracking-wider">
                Past month
              </span>
            )}
          </div>

          <button
            onClick={() => navigateCycle(1)}
            disabled={cycle.isCurrent}
            aria-label="Next month"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
            style={{ color: cycle.isCurrent ? '#3F3F46' : '#71717A' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Sika Daily banner — skeleton while loading, banner/nothing once resolved */}
        {digestLoading ? (
          <div className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-[#141416] to-[#1C1C1F] border border-[#00D9A3]/10">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#1C1C1F] animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-32 rounded bg-[#1C1C1F] animate-pulse" />
                <div className="h-3 w-24 rounded bg-[#1C1C1F] animate-pulse" />
              </div>
            </div>
            <div className="w-4 h-4 rounded bg-[#1C1C1F] animate-pulse" />
          </div>
        ) : todayDigest && !digestRead ? (
          <SikaDailyBanner digest={todayDigest} />
        ) : null}

        {/* AI insight strip */}
        {todayInsight && (
          <InsightStrip row={todayInsight} onDismiss={() => setTodayInsight(null)} />
        )}

        {/* Sika Monthly banner */}
        {monthlyRecapId && <SikaMonthlyBanner recapId={monthlyRecapId} />}

        {/* Virtual cycle card */}
        <div className="w-full md:max-w-[440px] md:mx-auto">
          {loading ? (
            <Skeleton
              className="w-full bg-[#141416]"
              style={{ aspectRatio: '85.6 / 54', borderRadius: 20 }}
            />
          ) : (
            <>
              <CycleCard
                cycleNet={dashboardStats?.cycleNet ?? 0}
                cycleLabel={cycle.label}
                userName={profile?.full_name?.toUpperCase() ?? 'SIKA USER'}
                theme={profile?.card_theme ?? 'classic_gold'}
                received={dashboardStats?.totalReceived ?? 0}
                spent={dashboardStats?.totalSpentActual ?? 0}
                expected={monthlyIncome}
              />
              <HintCard
                hintId="dashboard_card_intro"
                title="This is your month card"
                body="It shows money that came in minus money that went out this month. Resets at the start of each month. Customize the style in Settings."
              />
            </>
          )}
        </div>

        {/* Should I buy it? */}
        <ShouldIBuyButton />

        {/* Sunday recap — only on Sundays */}
        <SundayRecapCard />

        {/* Financial health row */}
        <HealthRow />

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

        {/* Income nudge + pending recurring cards */}
        {hasNudges && (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {nudges.map(nudge => (
                <IncomeNudgeCard
                  key={nudge.incomeSource.id}
                  nudge={nudge}
                  onLog={handleLogNudge}
                  onSnooze={handleSnoozeNudge}
                  onDismiss={handleDismissNudge}
                />
              ))}
              {pendingRecurring.map(({ recurring, dueDates }) => (
                <PendingRecurringCard
                  key={recurring.id}
                  name={recurring.note ?? recurring.category?.name ?? 'Recurring'}
                  amount={recurring.amount}
                  dueDate={dueDates[dueDates.length - 1]}
                  onConfirm={() => handleConfirmPending(recurring, dueDates[dueDates.length - 1])}
                  onSkip={() => handleSkipPending(recurring, dueDates[dueDates.length - 1])}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Buckets intro — shown once until dismissed */}
        <HintCard
          hintId="dashboard_buckets_intro"
          title="How buckets work"
          body="Your income is split 50/30/20 by default: Needs (must-haves like rent, food, transport), Wants (eating out, entertainment, gym), Future (savings, investments, emergency fund). Customize the split in Settings."
          cta="Got it"
        />

        {/* Bucket rings */}
        <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider">Buckets</p>
          <BucketsTooltip />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(() => {
            const sinkingFundEarmarked = goalProgresses
              .filter(gp => gp.goal.goal_type === 'target' && !gp.goal.completed_at && gp.required_monthly_pace != null)
              .reduce((s, gp) => s + (gp.required_monthly_pace ?? 0), 0);
            return loading
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
                    earmarked={bucket === 'future' ? sinkingFundEarmarked : undefined}
                  />
                ));
          })()}
        </div>
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
                title={cycle.isCurrent ? 'Today' : 'Last day'}
                amount={dashboardStats?.totalSpentToday ?? 0}
                index={0}
              />
              <SpendCard
                title={cycle.isCurrent ? 'This Month' : cycle.label.split(' ')[0]}
                amount={dashboardStats?.totalSpentThisMonth ?? 0}
                compareAmount={dashboardStats?.totalSpentLastMonth}
                compareLabel="prev month"
                index={1}
              />
            </>
          )}
        </div>

        {/* Account strip — desktop only */}
        {accounts.length > 0 && (
          <div className="hidden md:block">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider">Accounts</p>
              <Link href="/accounts" className="text-[#00D9A3] text-xs hover:text-[#00F5B8] transition-colors">
                See all
              </Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {accounts.map(acc => {
                const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                const balance = dashboardStats?.accountBalances[acc.id] ?? acc.opening_balance;
                return (
                  <Link
                    key={acc.id}
                    href="/accounts"
                    className="flex-shrink-0 bg-[#141416] border border-[#27272A] rounded-2xl p-3 min-w-[120px] hover:border-[#3F3F46] transition-colors"
                    style={{ borderLeftColor: cfg.color, borderLeftWidth: 3 }}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-base">{cfg.emoji}</span>
                      <span className="text-[#A1A1AA] text-xs truncate">{acc.name}</span>
                    </div>
                    <p className="text-sm font-bold tabular-nums" style={{ color: cfg.color }}>
                      {formatGHSCompact(balance)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Goals widget */}
        {goalProgresses.length > 0 && <GoalsWidget goals={goalProgresses} />}

        {/* Weekly chart */}
        {loading ? (
          <Skeleton className="h-52 rounded-2xl bg-[#141416]" />
        ) : (
          <WeeklyChart data={dashboardStats?.weeklySpend ?? []} />
        )}

        {/* Recent transactions — desktop only */}
        <div className="hidden md:block">
          {loading ? (
            <Skeleton className="h-64 rounded-2xl bg-[#141416]" />
          ) : (
            <RecentTransactions transactions={dashboardStats?.recentTransactions ?? []} />
          )}
        </div>
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
