'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Target, TrendingUp, Trophy, Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TopBar } from '@/components/layout/top-bar';
import { HintCard } from '@/components/hint-card';
import { GoalModal } from '@/components/goals/goal-modal';
import { ContributeModal } from '@/components/goals/contribute-modal';
import { NextCycleModal } from '@/components/goals/next-cycle-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { createClient } from '@/lib/supabase/client';
import { fetchGoals, fetchGoalAmounts, computeGoalProgress } from '@/lib/goals';
import { formatGHS, formatGHSCompact } from '@/lib/utils';
import type { GoalProgress, Goal } from '@/types/goal';

const SUGGESTION_PILLS = [
  { label: 'Life Savings', icon: '🎯', type: 'perpetual' as const },
  { label: 'Emergency Fund', icon: '🛡️', type: 'savings' as const },
  { label: 'New Car', icon: '🚗', type: 'savings' as const },
  { label: 'Vacation', icon: '✈️', type: 'sinking_fund' as const },
];

export default function GoalsPage() {
  const supabase = createClient();
  const { user, accounts } = useAuthStore();
  const { mutationCount } = useTransactionStore();

  const [goalProgresses, setGoalProgresses] = useState<GoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [contributeTarget, setContributeTarget] = useState<GoalProgress | null>(null);
  const [nextCycleGoal, setNextCycleGoal] = useState<Goal | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const goals = await fetchGoals(supabase, user.id);
    const progresses = await Promise.all(
      goals.map(async goal => {
        const { net } = await fetchGoalAmounts(supabase, goal.id);
        const fundingAccount = accounts.find(a => a.id === goal.funding_account_id) ?? accounts[0];
        return computeGoalProgress(goal, net, fundingAccount);
      })
    );
    setGoalProgresses(progresses);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accounts, mutationCount]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalSaved = goalProgresses.reduce((s, gp) => s + gp.current_amount, 0);
  const activeGoals = goalProgresses.filter(gp => !gp.goal.completed_at);
  const completedGoals = goalProgresses.filter(gp => gp.goal.completed_at);

  function openCreate() {
    setEditGoal(null);
    setShowModal(true);
  }

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <TopBar />
      <div className="px-4 md:px-8 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[#FAFAFA] font-bold text-xl">Goals</h1>
            {!loading && goalProgresses.length > 0 && (
              <p className="text-[#71717A] text-xs mt-0.5">
                {formatGHS(totalSaved)} saved across {goalProgresses.length} goal{goalProgresses.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={openCreate}
            className="h-9 px-3 rounded-xl bg-[#00D9A3] text-[#0A0A0B] text-sm font-semibold flex items-center gap-1.5 hover:bg-[#00B088] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Goal
          </button>
        </div>

        {/* Onboarding hint */}
        {!loading && goalProgresses.length === 0 && (
          <HintCard
            hintId="goals_intro"
            title="Start saving toward something"
            body="Goals let you earmark money for what matters — a life savings fund, emergency buffer, a big purchase, or anything else. Contributions are transfers that track your progress."
            icon={Target}
            cta="Got it"
          />
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl bg-[#141416]" />
            ))}
          </div>
        ) : goalProgresses.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center py-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#141416] border border-[#27272A] flex items-center justify-center">
              <Target className="w-8 h-8 text-[#3F3F46]" />
            </div>
            <div>
              <p className="text-[#FAFAFA] font-medium">No goals yet</p>
              <p className="text-[#71717A] text-sm mt-1">Create your first goal to start tracking your savings</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTION_PILLS.map(pill => (
                <button
                  key={pill.label}
                  onClick={openCreate}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#141416] border border-[#27272A] text-[#A1A1AA] text-sm hover:border-[#3F3F46] hover:text-[#FAFAFA] transition-colors"
                >
                  <span>{pill.icon}</span>
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {/* Active goals */}
            {activeGoals.map((gp, i) => (
              <GoalCard
                key={gp.goal.id}
                goalProgress={gp}
                index={i}
                onEdit={() => { setEditGoal(gp.goal); setShowModal(true); }}
                onContribute={() => setContributeTarget(gp)}
              />
            ))}

            {/* Completed goals */}
            {completedGoals.length > 0 && (
              <div className="pt-2">
                <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider mb-2">Completed</p>
                {completedGoals.map((gp, i) => (
                  <GoalCard
                    key={gp.goal.id}
                    goalProgress={gp}
                    index={i}
                    completed
                    onEdit={() => { setEditGoal(gp.goal); setShowModal(true); }}
                    onContribute={() => setContributeTarget(gp)}
                    onNextCycle={setNextCycleGoal}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        )}
      </div>

      <GoalModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditGoal(null); }}
        goal={editGoal}
      />

      {contributeTarget && (
        <ContributeModal
          open={!!contributeTarget}
          onClose={() => setContributeTarget(null)}
          goalProgress={contributeTarget}
        />
      )}

      {nextCycleGoal && (
        <NextCycleModal
          open={!!nextCycleGoal}
          onClose={() => setNextCycleGoal(null)}
          completedGoal={nextCycleGoal}
        />
      )}
    </div>
  );
}

interface GoalCardProps {
  goalProgress: GoalProgress;
  index: number;
  completed?: boolean;
  onEdit: () => void;
  onContribute: () => void;
  onNextCycle?: (goal: Goal) => void;
}

function GoalCard({ goalProgress: gp, index, completed, onEdit, onContribute, onNextCycle }: GoalCardProps) {
  const router = useRouter();
  const { goal, current_amount, progress_percent, days_remaining, is_on_track } = gp;
  const accentColor = goal.color ?? '#00D9A3';
  const isPerpetual = goal.goal_type === 'perpetual';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => router.push(`/goals/${goal.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') router.push(`/goals/${goal.id}`); }}
      className="bg-[#141416] border border-[#27272A] rounded-2xl p-4 space-y-3 cursor-pointer hover:border-[#3F3F46] hover:-translate-y-0.5 hover:shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9A3]"
      style={{ opacity: completed ? 0.7 : 1 }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: accentColor + '22' }}
        >
          {goal.icon ?? '🎯'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[#FAFAFA] font-semibold text-sm truncate">
              {goal.name}
            </span>
            {completed && <Trophy className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />}
          </div>
          {goal.description && (
            <p className="text-[#71717A] text-xs mt-0.5 line-clamp-1">{goal.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="h-7 px-2.5 rounded-lg text-[#71717A] text-xs hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
          >
            Edit
          </button>
          {!completed && (
            <button
              onClick={e => { e.stopPropagation(); onContribute(); }}
              className="h-7 px-2.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: accentColor + '22', color: accentColor }}
            >
              Add
            </button>
          )}
          {completed && goal.goal_type === 'sinking_fund' && onNextCycle && (
            <button
              onClick={e => { e.stopPropagation(); onNextCycle(goal); }}
              className="h-7 px-2.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: accentColor + '22', color: accentColor }}
            >
              Next cycle
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {!isPerpetual && progress_percent != null ? (
        <div className="space-y-1.5">
          <div className="h-2 bg-[#27272A] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: accentColor }}
              initial={{ width: 0 }}
              animate={{ width: `${progress_percent}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: accentColor }}>
              {formatGHSCompact(current_amount)}
              {goal.target_amount && (
                <span className="text-[#52525B]"> / {formatGHSCompact(goal.target_amount)}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {is_on_track != null && !completed && (
                <span className={is_on_track ? 'text-[#00D9A3]' : 'text-[#F97316]'}>
                  {is_on_track ? '↑ On track' : '↓ Behind'}
                </span>
              )}
              {days_remaining != null && !completed && (
                <span className="text-[#71717A]">
                  {days_remaining}d left
                </span>
              )}
            </div>
          </div>
        </div>
      ) : isPerpetual ? (
        <div className="flex items-center gap-1.5 text-xs text-[#71717A]">
          <Repeat className="w-3 h-3" style={{ color: accentColor }} />
          <span>Perpetual · </span>
          <TrendingUp className="w-3 h-3" style={{ color: accentColor }} />
          <span style={{ color: accentColor }}>{formatGHS(current_amount)} saved</span>
        </div>
      ) : null}
    </motion.div>
  );
}
