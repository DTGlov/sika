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
      className="bg-[#141416] border border-[#00D9A3]/30 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">💰</span>
        <div className="flex-1 min-w-0">
          <p className="text-[#FAFAFA] text-sm font-semibold">
            {incomeSource.name} expected today
          </p>
          <p className="text-[#A1A1AA] text-xs mt-0.5">
            Did you receive {formatGHS(incomeSource.amount)}?
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onLog(nudge)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#00D9A3] text-[#0A0A0B] text-xs font-semibold hover:bg-[#00B088] transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Yes, log it
            </button>
            <button
              onClick={() => onSnooze(nudge)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#1C1C1F] text-[#A1A1AA] text-xs font-medium hover:bg-[#27272A] transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              Not yet
            </button>
          </div>
        </div>
        <button
          onClick={() => onDismiss(nudge)}
          className="text-[#52525B] hover:text-[#71717A] transition-colors shrink-0"
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
      className="bg-[#141416] border border-[#FBBF24]/30 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="text-[#FAFAFA] text-sm font-semibold">{name} due</p>
          <p className="text-[#A1A1AA] text-xs mt-0.5">
            {formatGHS(amount)} · {dueDate}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#FBBF24] text-[#0A0A0B] text-xs font-semibold hover:bg-[#F59E0B] transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Log it
            </button>
            <button
              onClick={onSkip}
              className="h-8 px-3 rounded-xl bg-[#1C1C1F] text-[#A1A1AA] text-xs font-medium hover:bg-[#27272A] transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
