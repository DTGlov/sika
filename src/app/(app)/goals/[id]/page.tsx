'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Archive, Trash2, TrendingUp, Repeat } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { TopBar } from '@/components/layout/top-bar';
import { GoalModal } from '@/components/goals/goal-modal';
import { ContributeModal } from '@/components/goals/contribute-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { createClient } from '@/lib/supabase/client';
import { computeGoalProgress, fetchGoalContributions } from '@/lib/goals';
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
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showContribute, setShowContribute] = useState(false);
  const [confirming, setConfirming] = useState<'archive' | 'delete' | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [goalRes, contribRes] = await Promise.all([
      supabase.from('goals').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase
        .from('transactions')
        .select('*, account:account_id(id,name), to_account:to_account_id(id,name)')
        .eq('goal_id', id)
        .eq('type', 'transfer')
        .order('transaction_date', { ascending: false }),
    ]);

    if (!goalRes.data) { router.replace('/goals'); return; }
    const goal: Goal = goalRes.data;
    const txList: Transaction[] = contribRes.data ?? [];
    const currentAmount = txList.reduce((s, t) => s + t.amount, 0);
    const fundingAccount = accounts.find(a => a.id === goal.funding_account_id) ?? accounts[0];
    setGoalProgress(computeGoalProgress(goal, currentAmount, fundingAccount));
    setContributions(txList);
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
          <Skeleton className="h-10 w-32 rounded-xl bg-[#141416]" />
          <Skeleton className="h-36 rounded-2xl bg-[#141416]" />
          <Skeleton className="h-48 rounded-2xl bg-[#141416]" />
        </div>
      </div>
    );
  }

  if (!goalProgress) return null;

  const { goal, current_amount, progress_percent, days_remaining, required_monthly_pace, is_on_track } = goalProgress;
  const accentColor = goal.color ?? '#00D9A3';
  const isPerpetual = goal.goal_type === 'perpetual';

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <TopBar />
      <div className="px-4 md:px-8 space-y-4">
        {/* Back + actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowEdit(true)}
            className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-[#71717A] text-sm hover:text-[#FAFAFA] hover:bg-[#1C1C1F] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => setConfirming(confirming === 'archive' ? null : 'archive')}
            className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-[#71717A] text-sm hover:text-[#FAFAFA] hover:bg-[#1C1C1F] transition-colors"
          >
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
          <button
            onClick={() => setConfirming(confirming === 'delete' ? null : 'delete')}
            className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-[#F43F5E] text-sm hover:bg-[#F43F5E]/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Confirm strip */}
        {confirming === 'archive' && (
          <div className="flex items-center gap-3 bg-[#1C1C1F] border border-[#27272A] rounded-2xl px-4 py-3 text-sm">
            <p className="text-[#A1A1AA] flex-1">Archive this goal? It won't appear in your list.</p>
            <button onClick={handleArchive} className="text-[#FBBF24] font-medium hover:text-[#FCD34D]">Archive</button>
            <button onClick={() => setConfirming(null)} className="text-[#71717A] hover:text-[#A1A1AA]">Cancel</button>
          </div>
        )}
        {confirming === 'delete' && (
          <div className="flex items-center gap-3 bg-[#1C1C1F] border border-[#F43F5E]/30 rounded-2xl px-4 py-3 text-sm">
            <p className="text-[#A1A1AA] flex-1">Delete permanently? Contributions stay as transactions.</p>
            <button onClick={handleDelete} className="text-[#F43F5E] font-medium hover:text-[#FB7185]">Delete</button>
            <button onClick={() => setConfirming(null)} className="text-[#71717A] hover:text-[#A1A1AA]">Cancel</button>
          </div>
        )}

        {/* Hero card */}
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ background: accentColor + '15', border: `1px solid ${accentColor}33` }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{goal.icon ?? '🎯'}</span>
            <div>
              <h1 className="text-[#FAFAFA] font-bold text-xl">{goal.name}</h1>
              {goal.description && (
                <p className="text-[#A1A1AA] text-sm mt-0.5">{goal.description}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: accentColor }} className="font-bold text-2xl tabular-nums">
                {formatGHS(current_amount)}
              </span>
              {goal.target_amount && (
                <span className="text-[#71717A] self-end">
                  of {formatGHS(goal.target_amount)}
                </span>
              )}
            </div>

            {!isPerpetual && progress_percent != null && (
              <>
                <div className="h-3 bg-[#27272A] rounded-full overflow-hidden">
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
              <div className="flex items-center gap-1.5 text-xs text-[#71717A]">
                <Repeat className="w-3.5 h-3.5" style={{ color: accentColor }} />
                Perpetual goal · all contributions count
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            {days_remaining != null && (
              <StatTile label="Days left" value={`${days_remaining}d`} color={accentColor} />
            )}
            {required_monthly_pace != null && (
              <StatTile label="Monthly pace" value={formatGHSCompact(required_monthly_pace)} color={accentColor} />
            )}
            {is_on_track != null && (
              <StatTile
                label="Status"
                value={is_on_track ? 'On Track' : 'Behind'}
                color={is_on_track ? '#00D9A3' : '#F97316'}
              />
            )}
            {goal.completed_at && (
              <StatTile label="Completed" value={format(parseISO(goal.completed_at), 'MMM d, yyyy')} color={accentColor} />
            )}
            <StatTile label="Contributions" value={`${contributions.length}`} color={accentColor} />
            {goal.funding_account_id && (
              <StatTile
                label="Funding Account"
                value={goalProgress.funding_account?.name ?? '—'}
                color={accentColor}
              />
            )}
          </div>

          {!goal.completed_at && (
            <button
              onClick={() => setShowContribute(true)}
              className="w-full h-11 rounded-xl font-semibold text-sm text-[#0A0A0B] transition-colors hover:opacity-90"
              style={{ background: accentColor }}
            >
              + Add Contribution
            </button>
          )}
        </div>

        {/* Contribution history */}
        {contributions.length > 0 && (
          <div>
            <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider mb-2">History</p>
            <div className="space-y-2">
              {contributions.map(tx => (
                <div
                  key={tx.id}
                  className="bg-[#141416] border border-[#27272A] rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-[#FAFAFA] text-sm">
                      {tx.note || `Contribution to ${goal.name}`}
                    </p>
                    <p className="text-[#71717A] text-xs mt-0.5">
                      {format(parseISO(tx.transaction_date), 'MMM d, yyyy')}
                      {tx.account && (
                        <span className="text-[#52525B]"> · from {(tx.account as { name: string }).name}</span>
                      )}
                    </p>
                  </div>
                  <span className="font-semibold text-sm tabular-nums" style={{ color: accentColor }}>
                    +{formatGHS(tx.amount)}
                  </span>
                </div>
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
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#141416]/60 rounded-xl p-3">
      <p className="text-[#71717A] text-xs">{label}</p>
      <p className="font-semibold text-sm mt-0.5" style={{ color }}>{value}</p>
    </div>
  );
}
