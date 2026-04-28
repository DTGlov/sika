'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Info } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { useCurrency } from '@/hooks/use-currency';
import { getCycleForDate, getCycleFromStartDate, parseCycleParam } from '@/lib/cycle';
import { Skeleton } from '@/components/ui/skeleton';
import type { Transaction } from '@/types';

type Breakdown = Array<{ name: string; amount: number }>;

function buildBreakdown(
  txns: Transaction[],
  predicate: (t: Transaction) => boolean,
  keyOf: (t: Transaction) => string,
  limit?: number,
): Breakdown {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (!predicate(t)) continue;
    const key = keyOf(t);
    map.set(key, (map.get(key) ?? 0) + Number(t.amount));
  }
  const list = Array.from(map.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  return limit ? list.slice(0, limit) : list;
}

function CycleDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { user, profile } = useAuthStore();
  useProfile();
  const { format: formatMoney } = useCurrency();

  const [txns, setTxns] = useState<Transaction[] | null>(null);

  const cycle = useMemo(() => {
    if (!profile) return null;
    const cycleStartDay = profile.cycle_start_day ?? 1;
    const param = searchParams.get('cycle') ?? '';
    const parsed = parseCycleParam(param);
    return parsed
      ? getCycleFromStartDate(parsed, cycleStartDay)
      : getCycleForDate(new Date(), cycleStartDay);
  }, [profile, searchParams]);

  useEffect(() => {
    if (!user || !cycle) return;
    let cancelled = false;
    async function load() {
      if (!user || !cycle) return;
      const cycleStart = format(cycle.start, 'yyyy-MM-dd');
      const cycleEnd = format(cycle.end, 'yyyy-MM-dd');
      const { data } = await supabase
        .from('transactions')
        .select('*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)')
        .eq('user_id', user.id)
        .gte('transaction_date', cycleStart)
        .lte('transaction_date', cycleEnd)
        .order('transaction_date', { ascending: false });
      if (!cancelled) setTxns((data ?? []) as Transaction[]);
    }
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cycle?.startDateStr]);

  if (!cycle || !txns) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-4">
        <div className="h-8 w-32 rounded-xl bg-muted animate-pulse" />
        <Skeleton className="h-24 rounded-2xl bg-muted" />
        <Skeleton className="h-40 rounded-2xl bg-muted" />
        <Skeleton className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  const incomeBreakdown = buildBreakdown(
    txns,
    (t) => t.type === 'income',
    (t) => t.category?.name ?? t.note ?? 'Other',
  );
  const totalReceived = incomeBreakdown.reduce((s, x) => s + x.amount, 0);

  const spendingBreakdown = buildBreakdown(
    txns,
    (t) => t.type === 'expense' && !t.paid_from_goal_id,
    (t) => t.category?.name ?? 'Uncategorized',
    5,
  );
  const totalSpent = txns
    .filter((t) => t.type === 'expense' && !t.paid_from_goal_id)
    .reduce((s, t) => s + Number(t.amount), 0);

  const cycleNet = totalReceived - totalSpent;
  const isNegative = cycleNet < 0;

  const periodLabel = `${format(cycle.start, 'MMM d')} — ${format(cycle.end, 'MMM d, yyyy')}`;
  const isEmpty = incomeBreakdown.length === 0 && spendingBreakdown.length === 0;

  return (
    <div className="max-w-2xl mx-auto pb-24 px-4 pt-6 md:px-8 space-y-6">
      <header className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full text-muted-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">Cycle Details</h1>
      </header>

      {/* Cycle period + net */}
      <section>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {periodLabel}
        </p>
        <p className={`text-3xl font-display font-bold tabular-nums ${
          isNegative ? 'text-[#F43F5E]' : cycleNet === 0 ? 'text-muted-foreground' : 'text-[#D4A017]'
        }`}>
          {isNegative ? '−' : ''}{formatMoney(Math.abs(cycleNet))}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Net cash flow this cycle
        </p>
      </section>

      {/* The math */}
      <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          How this is calculated
        </h2>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Received</span>
            <span className="font-medium tabular-nums text-[#D4A017]">+{formatMoney(totalReceived)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Spent</span>
            <span className="font-medium tabular-nums text-[#F43F5E]">−{formatMoney(totalSpent)}</span>
          </div>
          <div className="border-t border-border pt-2 mt-2 flex justify-between items-center font-semibold">
            <span>Net</span>
            <span className={`tabular-nums ${isNegative ? 'text-[#F43F5E]' : 'text-[#D4A017]'}`}>
              {isNegative ? '−' : '+'}{formatMoney(Math.abs(cycleNet))}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>
            Account balance corrections (reconciliations) and transfers between your own accounts aren&apos;t included.
          </p>
        </div>
      </section>

      {/* Income breakdown */}
      {incomeBreakdown.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Where Received came from
          </h2>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {incomeBreakdown.map(({ name, amount }) => (
              <div key={name} className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-foreground truncate">{name}</span>
                <span className="text-sm font-medium tabular-nums text-foreground shrink-0 ml-3">
                  {formatMoney(amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Spending breakdown */}
      {spendingBreakdown.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Top spending categories
          </h2>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {spendingBreakdown.map(({ name, amount }) => {
              const pct = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
              return (
                <div key={name} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-foreground truncate">{name}</span>
                    <span className="text-sm font-medium tabular-nums text-foreground shrink-0 ml-3">
                      {formatMoney(amount)}
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F43F5E]/60 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isEmpty && (
        <p className="text-sm text-muted-foreground text-center py-12">
          No transactions logged this cycle yet.
        </p>
      )}
    </div>
  );
}

export default function CycleDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-4">
          <div className="h-8 w-32 rounded-xl bg-muted animate-pulse" />
          <Skeleton className="h-24 rounded-2xl bg-muted" />
          <Skeleton className="h-40 rounded-2xl bg-muted" />
        </div>
      }
    >
      <CycleDetailContent />
    </Suspense>
  );
}
