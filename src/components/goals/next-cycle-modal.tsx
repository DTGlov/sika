'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { revalidateForEntity } from '@/lib/revalidation';
import { createNextCycle, suggestNextCycleName, suggestNextDeadline } from '@/lib/goals';
import { formatGHS } from '@/lib/utils';
import type { Goal } from '@/types/goal';

interface NextCycleModalProps {
  open: boolean;
  onClose: () => void;
  completedGoal: Goal;
}

export function NextCycleModal({ open, onClose, completedGoal }: NextCycleModalProps) {
  const supabase = createClient();
  const { user } = useAuthStore();
  const router = useRouter();

  const completionDate = completedGoal.completed_at
    ? parseISO(completedGoal.completed_at)
    : new Date();

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState(completedGoal.priority);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(suggestNextCycleName(completedGoal.name, completionDate));
      setTargetAmount(completedGoal.target_amount?.toString() ?? '');
      setDeadline(suggestNextDeadline(completionDate));
      setPriority(completedGoal.priority);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const accentColor = completedGoal.color ?? '#00D9A3';

  async function handleConfirm() {
    if (!user) return;
    if (!name.trim() || !targetAmount || !deadline) {
      toast.error('Fill in all fields'); return;
    }
    setSaving(true);
    const newGoal = await createNextCycle(supabase, user.id, completedGoal, {
      name: name.trim(),
      targetAmount: parseFloat(targetAmount),
      deadline,
      priority,
    });
    setSaving(false);
    if (!newGoal) { toast.error('Failed to create next cycle'); return; }
    revalidateForEntity('goal');
    toast.success(`New cycle started. Keep saving! 🎯`);
    onClose();
    router.push(`/goals/${newGoal.id}`);
  }

  return (
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
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-x-4 bottom-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-sm z-50 bg-[#141416] border border-[#27272A] rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{completedGoal.icon ?? '🎯'}</span>
                  <div>
                    <p className="text-xs text-[#00D9A3] font-medium uppercase tracking-wider">
                      Goal completed!
                    </p>
                    <h2 className="text-[#FAFAFA] font-bold text-base leading-tight">
                      {completedGoal.name}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[#A1A1AA] text-sm">
                You successfully saved and paid{' '}
                <span className="text-[#FAFAFA] font-medium">{formatGHS(completedGoal.target_amount ?? 0)}</span>.
                Want to start the next cycle?
              </p>

              <div className="h-px bg-[#27272A]" />

              {/* Fields */}
              <div className="space-y-3">
                <div>
                  <label className="text-[#71717A] text-xs font-medium block mb-1">Name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={80}
                    className="w-full bg-[#1C1C1F] border border-[#27272A] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#00D9A3] transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[#71717A] text-xs font-medium block mb-1">Target</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={targetAmount}
                      onChange={e => setTargetAmount(e.target.value)}
                      className="w-full bg-[#1C1C1F] border border-[#27272A] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#00D9A3] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[#71717A] text-xs font-medium block mb-1">Deadline</label>
                    <input
                      type="date"
                      value={deadline}
                      onChange={e => setDeadline(e.target.value)}
                      className="w-full bg-[#1C1C1F] border border-[#27272A] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#00D9A3] transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[#71717A] text-xs font-medium block mb-1">
                    Priority: <span className="text-[#FAFAFA]">{priority}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={priority}
                    onChange={e => setPriority(Number(e.target.value))}
                    className="w-full accent-[#00D9A3]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 h-10 rounded-xl border border-[#27272A] text-[#71717A] text-sm hover:text-[#FAFAFA] hover:bg-[#1C1C1F] transition-colors"
                >
                  Not now
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="flex-1 h-10 rounded-xl font-semibold text-sm text-[#0A0A0B] transition-colors disabled:opacity-50"
                  style={{ background: accentColor }}
                >
                  {saving ? 'Creating…' : 'Start next cycle'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
