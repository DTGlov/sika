'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { revalidateForEntity } from '@/lib/revalidation';
import { contributeToGoal } from '@/lib/goals';
import { updateSavingsStreak, savingsMilestoneMessage } from '@/lib/streaks';
import { awardMomentum } from '@/lib/momentum';
import { checkAndUnlockBadges } from '@/lib/badges';
import { MomentumFloatContainer, TierUpModal } from '@/components/momentum-float';
import type { TierConfig } from '@/types/momentum';
import { formatGHS } from '@/lib/utils';
import type { GoalProgress } from '@/types/goal';

interface ContributeModalProps {
  open: boolean;
  onClose: () => void;
  goalProgress: GoalProgress;
}

export function ContributeModal({ open, onClose, goalProgress }: ContributeModalProps) {
  const supabase = createClient();
  const { user, accounts, setStreaks, setMomentum, enqueueBadgeCelebrations } = useAuthStore();
  const [momentumFloats, setMomentumFloats] = useState<Array<{ id: string; points: number }>>([]);
  const [tierUpTier, setTierUpTier] = useState<TierConfig | null>(null);

  const { goal, current_amount, target_amount } = goalProgress.goal
    ? { goal: goalProgress.goal, current_amount: goalProgress.current_amount, target_amount: goalProgress.goal.target_amount }
    : { goal: goalProgress.goal, current_amount: 0, target_amount: null };

  const sourceAccounts = accounts.filter(a => a.id !== goal.funding_account_id);

  const [fromAccountId, setFromAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [transactionDate, setTransactionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFromAccountId(sourceAccounts[0]?.id ?? '');
      setAmount('');
      setNote('');
      setTransactionDate(format(new Date(), 'yyyy-MM-dd'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const numAmount = parseFloat(amount) || 0;
  const afterAmount = current_amount + numAmount;
  const afterPercent = target_amount ? Math.min(100, (afterAmount / target_amount) * 100) : null;
  const accentColor = goal.color ?? '#00D9A3';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!fromAccountId) { toast.error('Select a source account'); return; }
    if (numAmount <= 0) { toast.error('Enter a valid amount'); return; }

    setSaving(true);
    try {
      await contributeToGoal(supabase, user.id, {
        goal,
        fromAccountId,
        amount: numAmount,
        note,
        transactionDate,
        currentAmount: current_amount,
      });
      revalidateForEntity('goal_contribution');
      // Update savings streak + check streak badges
      updateSavingsStreak(supabase, user.id).then(result => {
        if (result.streaks) setStreaks(result.streaks);
        if (result.milestone_hit) {
          toast.success(savingsMilestoneMessage(result.milestone_hit), { duration: 5000 });
        } else if (result.freeze_used) {
          toast(`❄️ Streak freeze used to protect your saving streak.`);
        }
        checkAndUnlockBadges(supabase, user.id, 'streak_updated').then(({ newlyUnlocked }) => {
          if (newlyUnlocked.length > 0) enqueueBadgeCelebrations(newlyUnlocked);
        });
      });
      // Award momentum
      awardMomentum(supabase, user.id, 'goal_contribution').then(result => {
        setMomentum(result.momentum);
        const floatId = `${Date.now()}-${Math.random()}`;
        setMomentumFloats(prev => [...prev, { id: floatId, points: result.points_awarded }]);
        if (result.tier_changed) setTierUpTier(result.new_tier);
      });
      // Check contribution + safety_net badges
      checkAndUnlockBadges(supabase, user.id, 'contribution_made').then(({ newlyUnlocked }) => {
        if (newlyUnlocked.length > 0) enqueueBadgeCelebrations(newlyUnlocked);
      });
      toast.success(`${formatGHS(numAmount)} added to ${goal.name}`);
      onClose();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed inset-x-4 bottom-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-sm z-50 bg-card border border-border rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-lg">{goal.icon ?? '🎯'}</span>
                <h2 className="text-foreground font-semibold text-base">Contribute</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Live progress preview */}
              <div className="bg-muted rounded-2xl p-4 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{goal.name}</span>
                  {target_amount && (
                    <span className="text-muted-foreground">
                      {formatGHS(afterAmount)} / {formatGHS(target_amount)}
                    </span>
                  )}
                </div>
                {afterPercent != null && (
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: accentColor }}
                      initial={{ width: `${(current_amount / (target_amount ?? 1)) * 100}%` }}
                      animate={{ width: `${afterPercent}%` }}
                      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                    />
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    Current: <span className="text-foreground">{formatGHS(current_amount)}</span>
                  </span>
                  {numAmount > 0 && (
                    <span style={{ color: accentColor }}>+{formatGHS(numAmount)}</span>
                  )}
                </div>
              </div>

              {/* From account */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-1.5">From Account</label>
                <select
                  value={fromAccountId}
                  onChange={e => setFromAccountId(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="">Select account</option>
                  {sourceAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-1.5">Amount</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-1.5">Date</label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={e => setTransactionDate(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Note */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-1.5">Note (optional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={`Contribution to ${goal.name}`}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 rounded-xl font-semibold text-sm text-[#0A0A0B] transition-colors disabled:opacity-50"
                style={{ background: accentColor }}
              >
                {saving ? 'Adding…' : 'Add Contribution'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    <MomentumFloatContainer
      floats={momentumFloats}
      onDone={id => setMomentumFloats(prev => prev.filter(f => f.id !== id))}
    />

    {tierUpTier && (
      <TierUpModal
        open={!!tierUpTier}
        onClose={() => setTierUpTier(null)}
        tier={tierUpTier}
      />
    )}
    </>
  );
}
