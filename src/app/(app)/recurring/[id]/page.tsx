'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Check, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { useCurrency } from '@/hooks/use-currency';
import {
  confirmPendingRecurring,
  skipPendingRecurring,
  formatScheduleSummary,
  getCurrentInstancePeriod,
  isHandledThisInstance,
  FREQUENCY_LABELS,
} from '@/lib/recurring';
import { revalidateForEntity } from '@/lib/revalidation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { RecurringTransaction } from '@/types';

function periodLabel(rec: RecurringTransaction, period: { start: Date; end: Date }): string {
  if (rec.frequency === 'monthly') return 'this month';
  if (rec.frequency === 'weekly' || rec.frequency === 'biweekly') {
    return `this week (${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d')})`;
  }
  if (rec.frequency === 'yearly') return 'this year';
  return 'today';
}

export default function RecurringDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const supabase = createClient();
  const { user } = useAuthStore();
  const { bumpMutation } = useTransactionStore();
  const { format: formatMoney } = useCurrency();

  const [recurring, setRecurring] = useState<RecurringTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('recurring_transactions')
        .select('*, account:accounts!account_id(id,name,type,color,icon), category:categories(*, bucket:budget_buckets(*))')
        .eq('id', id)
        .eq('user_id', user!.id)
        .single();
      if (!cancelled) {
        setRecurring((data as RecurringTransaction | null) ?? null);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-4">
        <div className="h-8 w-32 rounded-xl bg-muted animate-pulse" />
        <Skeleton className="h-32 rounded-2xl bg-muted" />
        <Skeleton className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!recurring) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-muted-foreground text-sm mb-4 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-muted-foreground text-sm">Recurring transaction not found.</p>
      </div>
    );
  }

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const handled = isHandledThisInstance(recurring, today);
  const period = getCurrentInstancePeriod(recurring, today);
  const labelForPeriod = periodLabel(recurring, period);
  const name = recurring.note ?? recurring.category?.name ?? FREQUENCY_LABELS[recurring.frequency];
  const accentColor = recurring.type === 'income' ? '#00D9A3' : '#F43F5E';
  const sectionTitle =
    recurring.frequency === 'monthly' ? 'This month' :
    recurring.frequency === 'weekly' || recurring.frequency === 'biweekly' ? 'This week' :
    recurring.frequency === 'yearly' ? 'This year' :
    'Today';

  async function handleLog() {
    if (!user || !recurring) return;
    setSubmitting(true);
    try {
      await confirmPendingRecurring(supabase, user.id, recurring, todayStr);
      bumpMutation();
      revalidateForEntity('transaction');
      toast.success(`Logged ${name}`);
      // Re-fetch to refresh status
      const { data } = await supabase
        .from('recurring_transactions')
        .select('*, account:accounts!account_id(id,name,type,color,icon), category:categories(*, bucket:budget_buckets(*))')
        .eq('id', recurring.id)
        .eq('user_id', user.id)
        .single();
      setRecurring((data as RecurringTransaction | null) ?? recurring);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    if (!user || !recurring) return;
    setSubmitting(true);
    try {
      const skipDate = format(period.start, 'yyyy-MM-dd');
      await skipPendingRecurring(supabase, recurring.id, skipDate);
      bumpMutation();
      revalidateForEntity('transaction');
      toast.success(`Skipped ${labelForPeriod}`);
      setShowSkipConfirm(false);
      setRecurring({ ...recurring, last_generated_date: skipDate });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-24 px-4 pt-6 md:px-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-muted-foreground text-sm mb-4 hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Header card */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="flex items-start gap-3">
          <div
            className="w-2 h-2 rounded-full shrink-0 mt-2"
            style={{ backgroundColor: accentColor }}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-foreground font-bold text-xl truncate">{name}</h1>
            <p className="text-muted-foreground text-xs mt-1">
              {recurring.account?.name}
              {recurring.category ? ` · ${recurring.category.name}` : ''}
              {' · '}{formatScheduleSummary(recurring)}
            </p>
          </div>
          <p className="text-xl font-bold tabular-nums shrink-0" style={{ color: accentColor }}>
            {formatMoney(recurring.amount)}
          </p>
        </div>
      </div>

      {/* This-period status + affordances */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          {sectionTitle}
        </h3>

        {handled ? (
          <div className="flex items-center gap-2 text-[#00D9A3]">
            <Check className="w-4 h-4" />
            <span className="text-sm">
              Handled — last logged {format(parseISO(recurring.last_generated_date!), 'MMM d')}
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pending — no instance logged yet for {labelForPeriod}.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleLog}
                disabled={submitting}
                className="h-11 px-4 rounded-xl bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold text-sm flex items-center justify-center gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Log this instance now
              </button>
              <button
                onClick={() => setShowSkipConfirm(true)}
                disabled={submitting}
                className="h-11 px-4 rounded-xl bg-muted text-muted-foreground hover:text-foreground font-medium text-sm transition-colors disabled:opacity-50"
              >
                Skip {labelForPeriod}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              Logging uses today&apos;s date with the recurring&apos;s amount, account, and category.
              You can edit the resulting transaction afterward.
            </p>
          </div>
        )}
      </section>

      <Dialog open={showSkipConfirm} onOpenChange={setShowSkipConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip {labelForPeriod}?</DialogTitle>
            <DialogDescription>
              {name} won&apos;t be logged for this period. It will resume on the next scheduled instance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSkipConfirm(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, skip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
