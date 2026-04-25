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
      className="bg-card border border-[#D4A017]/30 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">💰</span>
        <div className="flex-1 min-w-0">
          <p className="text-foreground text-sm font-semibold">
            {incomeSource.name} expected today
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Did you receive {formatGHS(incomeSource.amount)}?
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onLog(nudge)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#D4A017] text-[#0E1A2E] text-xs font-semibold hover:bg-[#B8891A] transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Yes, log it
            </button>
            <button
              onClick={() => onSnooze(nudge)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              Not yet
            </button>
          </div>
        </div>
        <button
          onClick={() => onDismiss(nudge)}
          className="text-muted-foreground/70 hover:text-muted-foreground transition-colors shrink-0"
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
      className="bg-card border border-[#FBBF24]/30 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="text-foreground text-sm font-semibold">{name} due</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {formatGHS(amount)} · {dueDate}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#FBBF24] text-[#0E1A2E] text-xs font-semibold hover:bg-[#F59E0B] transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Log it
            </button>
            <button
              onClick={onSkip}
              className="h-8 px-3 rounded-xl bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
