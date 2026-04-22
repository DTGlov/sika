'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Archive, Trash2, TrendingUp, Repeat, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { TopBar } from '@/components/layout/top-bar';
import { GoalModal } from '@/components/goals/goal-modal';
import { ContributeModal } from '@/components/goals/contribute-modal';
import { NextCycleModal } from '@/components/goals/next-cycle-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { createClient } from '@/lib/supabase/client';
import { computeGoalProgress, fetchGoalAmounts } from '@/lib/goals';
import { revalidateForEntity } from '@/lib/revalidation';
import { formatGHS, formatGHSCompact } from '@/lib/utils';
import type { Goal, GoalProgress } from '@/types/goal';
import type { Transaction } from '@/types';

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { user, accounts } = useAuthStore();
  const { mutationCount } = useTransactionStore();

  const [goalProgress, setGoalProgress] = useState<GoalProgress | null>(null);
  const [contributions, setContributions] = useState<Transaction[]>([]);
  const [payments, setPayments] = useState<Transaction[]>([]);
  const [previousGoal, setPreviousGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showContribute, setShowContribute] = useState(false);
  const [showNextCycle, setShowNextCycle] = useState(false);
  const [confirming, setConfirming] = useState<'archive' | 'delete' | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [goalRes, contribRes, paymentRes] = await Promise.all([
      supabase.from('goals').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase
        .from('transactions')
        .select('*, account:account_id(id,name), to_account:to_account_id(id,name)')
        .eq('goal_id', id)
        .eq('type', 'transfer')
        .order('transaction_date', { ascending: false }),
      supabase
        .from('transactions')
        .select('*, account:account_id(id,name), category:categories(name)')
        .eq('paid_from_goal_id', id)
        .eq('type', 'expense')
        .order('transaction_date', { ascending: false }),
    ]);

    if (!goalRes.data) { router.replace('/goals'); return; }
    const goal: Goal = goalRes.data;
    const contribList: Transaction[] = contribRes.data ?? [];
    const paymentList: Transaction[] = paymentRes.data ?? [];

    const { net } = await fetchGoalAmounts(supabase, id);
    const fundingAccount = accounts.find(a => a.id === goal.funding_account_id) ?? accounts[0];
    setGoalProgress(computeGoalProgress(goal, net, fundingAccount));
    setContributions(contribList);
    setPayments(paymentList);

    if (goal.previous_goal_id) {
      const { data: prev } = await supabase
        .from('goals')
        .select('*')
        .eq('id', goal.previous_goal_id)
        .single();
      setPreviousGoal(prev ?? null);
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accounts, id, mutationCount]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleArchive() {
    if (!goalProgress) return;
    await supabase.from('goals').update({ is_archived: true }).eq('id', id);
    revalidateForEntity('goal');
    toast('Goal archived');
    router.replace('/goals');
  }

  async function handleDelete() {
    await supabase.from('goals').delete().eq('id', id);
    revalidateForEntity('goal');
    toast('Goal deleted');
    router.replace('/goals');
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto pb-8">
        <TopBar />
        <div className="px-4 md:px-8 space-y-4">
          <Skeleton className="h-10 w-32 rounded-xl bg-surface" />
          <Skeleton className="h-36 rounded-2xl bg-surface" />
          <Skeleton className="h-48 rounded-2xl bg-surface" />
        </div>
      </div>
    );
  }

  if (!goalProgress) return null;

  const { goal, current_amount, progress_percent, days_remaining, required_monthly_pace, is_on_track } = goalProgress;
  const accentColor = goal.color ?? 'var(--accent)';
  const isPerpetual = goal.goal_type === 'perpetual';
  const isTarget = goal.goal_type === 'target';
  const totalContributions = contributions.reduce((s, t) => s + t.amount, 0);
  const totalPayments = payments.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <TopBar />
      <div className="px-4 md:px-8 space-y-4">
        {/* Back + actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowEdit(true)}
            className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-fg-muted text-sm hover:text-fg hover:bg-elevated transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => setConfirming(confirming === 'archive' ? null : 'archive')}
            className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-fg-muted text-sm hover:text-fg hover:bg-elevated transition-colors"
          >
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
          <button
            onClick={() => setConfirming(confirming === 'delete' ? null : 'delete')}
            className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-destructive text-sm hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Confirm strips */}
        {confirming === 'archive' && (
          <div className="flex items-center gap-3 bg-elevated border border-border rounded-2xl px-4 py-3 text-sm">
            <p className="text-fg-secondary flex-1">Archive this goal? It won&apos;t appear in your list.</p>
            <button onClick={handleArchive} className="text-sika-wants font-medium hover:text-sika-wants/80">Archive</button>
            <button onClick={() => setConfirming(null)} className="text-fg-muted hover:text-fg-secondary">Cancel</button>
          </div>
        )}
        {confirming === 'delete' && (
          <div className="flex items-center gap-3 bg-elevated border border-destructive/30 rounded-2xl px-4 py-3 text-sm">
            <p className="text-fg-secondary flex-1">Delete permanently? Contributions stay as transactions.</p>
            <button onClick={handleDelete} className="text-destructive font-medium hover:text-destructive/80">Delete</button>
            <button onClick={() => setConfirming(null)} className="text-fg-muted hover:text-fg-secondary">Cancel</button>
          </div>
        )}

        {/* Previous cycle link */}
        {previousGoal && (
          <button
            onClick={() => router.push(`/goals/${previousGoal.id}`)}
            className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-secondary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Previous cycle: {previousGoal.name}
          </button>
        )}

        {/* Hero card */}
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ background: accentColor + '15', border: `1px solid ${accentColor}33` }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{goal.icon ?? '🎯'}</span>
            <div>
              <h1 className="text-fg font-bold text-xl">{goal.name}</h1>
              {goal.description && (
                <p className="text-fg-secondary text-sm mt-0.5">{goal.description}</p>
              )}
              {isTarget && goal.cycle_count > 1 && (
                <p className="text-fg-muted text-xs mt-0.5">Cycle {goal.cycle_count}</p>
              )}
            </div>
          </div>

          {/* Effective balance */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: accentColor }} className="font-bold text-2xl tabular-nums">
                {formatGHS(current_amount)}
              </span>
              {goal.target_amount && (
                <span className="text-fg-muted self-end">
                  of {formatGHS(goal.target_amount)}
                </span>
              )}
            </div>

            {isTarget && (totalContributions > 0 || totalPayments > 0) && (
              <div className="flex gap-3 text-xs">
                <span className="text-fg-muted">
                  <span style={{ color: accentColor }}>+{formatGHSCompact(totalContributions)}</span> saved
                </span>
                {totalPayments > 0 && (
                  <span className="text-fg-muted">
                    <span className="text-orange-500">−{formatGHSCompact(totalPayments)}</span> paid
                  </span>
                )}
              </div>
            )}

            {!isPerpetual && progress_percent != null && (
              <>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: accentColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress_percent}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-xs" style={{ color: accentColor }}>
                  {progress_percent.toFixed(1)}% complete
                </p>
              </>
            )}

            {isPerpetual && (
              <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Repeat className="w-3.5 h-3.5" style={{ color: accentColor }} />
                Perpetual goal · all contributions count
              </div>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {days_remaining != null && (
              <StatTile label="Days left" value={`${days_remaining}d`} color={accentColor} />
            )}
            {required_monthly_pace != null && (
              <StatTile label="Monthly pace" value={formatGHSCompact(required_monthly_pace)} color={accentColor} />
            )}
            {is_on_track != null && !goal.completed_at && (
              <StatTile
                label="Status"
                value={is_on_track ? 'On Track' : 'Behind'}
                color={is_on_track ? 'var(--accent)' : '#F97316'}
              />
            )}
            {goal.completed_at && (
              <StatTile label="Completed" value={format(parseISO(goal.completed_at), 'MMM d, yyyy')} color={accentColor} />
            )}
            <StatTile label="Contributions" value={`${contributions.length}`} color={accentColor} />
            {isTarget && (
              <StatTile label="Payments" value={`${payments.length}`} color={accentColor} />
            )}
            {goalProgress.funding_account && (
              <StatTile
                label="Funding Account"
                value={goalProgress.funding_account.name}
                color={accentColor}
              />
            )}
          </div>

          {/* CTA */}
          {!goal.completed_at && (
            <button
              onClick={() => setShowContribute(true)}
              className="w-full h-11 rounded-xl font-semibold text-sm transition-colors hover:opacity-90"
              style={{ background: accentColor, color: '#0A0A0B' }}
            >
              + Add Contribution
            </button>
          )}
          {goal.completed_at && isTarget && (
            <button
              onClick={() => setShowNextCycle(true)}
              className="w-full h-11 rounded-xl font-semibold text-sm transition-colors hover:opacity-90"
              style={{ background: accentColor + '22', color: accentColor, border: `1px solid ${accentColor}44` }}
            >
              Start next cycle →
            </button>
          )}
        </div>

        {/* Contributions section */}
        {contributions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="w-3.5 h-3.5" style={{ color: accentColor }} />
              <p className="text-fg-muted text-xs font-medium uppercase tracking-wider">
                Contributions
              </p>
            </div>
            <div className="space-y-2">
              {contributions.map(tx => (
                <TxRow key={tx.id} tx={tx} goal={goal} type="contribution" accentColor={accentColor} />
              ))}
            </div>
          </div>
        )}

        {/* Payments section (target goals only) */}
        {isTarget && payments.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownLeft className="w-3.5 h-3.5 text-orange-500" />
              <p className="text-fg-muted text-xs font-medium uppercase tracking-wider">
                Payments
              </p>
            </div>
            <div className="space-y-2">
              {payments.map(tx => (
                <TxRow key={tx.id} tx={tx} goal={goal} type="payment" accentColor="#F97316" />
              ))}
            </div>
          </div>
        )}
      </div>

      <GoalModal open={showEdit} onClose={() => setShowEdit(false)} goal={goal} />
      <ContributeModal
        open={showContribute}
        onClose={() => setShowContribute(false)}
        goalProgress={goalProgress}
      />
      {showNextCycle && (
        <NextCycleModal
          open={showNextCycle}
          onClose={() => setShowNextCycle(false)}
          completedGoal={goal}
        />
      )}
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface/60 rounded-xl p-3">
      <p className="text-fg-muted text-xs">{label}</p>
      <p className="font-semibold text-sm mt-0.5" style={{ color }}>{value}</p>
    </div>
  );
}

function TxRow({ tx, goal, type, accentColor }: { tx: Transaction; goal: Goal; type: 'contribution' | 'payment'; accentColor: string }) {
  const label = type === 'contribution'
    ? (tx.note || `Contribution to ${goal.name}`)
    : (tx.note || (tx as { category?: { name?: string } }).category?.name || `Payment from ${goal.name}`);

  const fromAccount = (tx.account as { name: string } | null)?.name;

  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-fg text-sm">{label}</p>
        <p className="text-fg-muted text-xs mt-0.5">
          {format(parseISO(tx.transaction_date), 'MMM d, yyyy')}
          {fromAccount && (
            <span className="text-fg-disabled"> · {fromAccount}</span>
          )}
        </p>
      </div>
      <span className="font-semibold text-sm tabular-nums" style={{ color: accentColor }}>
        {type === 'contribution' ? '+' : '−'}{formatGHS(tx.amount)}
      </span>
    </div>
  );
}
