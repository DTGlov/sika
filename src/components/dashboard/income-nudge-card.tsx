'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Clock, X } from 'lucide-react';
import { formatGHS } from '@/lib/utils';
import type { IncomeNudge } from '@/types';

interface IncomeNudgeCardProps {
  nudge: IncomeNudge;
  onLog: (nudge: IncomeNudge) => void;
  onSnooze: (nudge: IncomeNudge) => void;
  onDismiss: (nudge: IncomeNudge) => void;
}

export function IncomeNudgeCard({ nudge, onLog, onSnooze, onDismiss }: IncomeNudgeCardProps) {
  const { incomeSource } = nudge;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="bg-surface border border-accent/30 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">💰</span>
        <div className="flex-1 min-w-0">
          <p className="text-fg text-sm font-semibold">
            {incomeSource.name} expected today
          </p>
          <p className="text-fg-secondary text-xs mt-0.5">
            Did you receive {formatGHS(incomeSource.amount)}?
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onLog(nudge)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/90 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Yes, log it
            </button>
            <button
              onClick={() => onSnooze(nudge)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-elevated text-fg-secondary text-xs font-medium hover:bg-border/50 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              Not yet
            </button>
          </div>
        </div>
        <button
          onClick={() => onDismiss(nudge)}
          className="text-fg-disabled hover:text-fg-muted transition-colors shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

interface PendingRecurringCardProps {
  name: string;
  amount: number;
  dueDate: string;
  onConfirm: () => void;
  onSkip: () => void;
}

export function PendingRecurringCard({ name, amount, dueDate, onConfirm, onSkip }: PendingRecurringCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="bg-surface border border-sika-wants/30 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="text-fg text-sm font-semibold">{name} due</p>
          <p className="text-fg-secondary text-xs mt-0.5">
            {formatGHS(amount)} · {dueDate}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-sika-wants text-[#0A0A0B] text-xs font-semibold hover:bg-sika-wants/90 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Log it
            </button>
            <button
              onClick={onSkip}
              className="h-8 px-3 rounded-xl bg-elevated text-fg-secondary text-xs font-medium hover:bg-border/50 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
