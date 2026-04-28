'use client';

import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { revalidateForEntity } from '@/lib/revalidation';
import { GOAL_COLORS } from '@/lib/goals';
import type { Goal, GoalType } from '@/types/goal';

interface GoalModalProps {
  open: boolean;
  onClose: () => void;
  goal?: Goal | null;
}

const GOAL_TYPE_OPTIONS: { value: GoalType; label: string; description: string }[] = [
  { value: 'target', label: 'Target', description: 'Save toward a specific goal with a target and deadline (trips, purchases, rent).' },
  { value: 'perpetual', label: 'Perpetual', description: 'Grows indefinitely — for emergency funds or long-term savings.' },
];

const ICON_OPTIONS = ['🎯', '⭐', '🏠', '🚗', '✈️', '💼', '❤️', '🛡️', '⚡', '🎁', '📚', '🎵'];

export function GoalModal({ open, onClose, goal }: GoalModalProps) {
  const supabase = createClient();
  const { user, accounts } = useAuthStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('target');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [priority, setPriority] = useState(5);
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setDescription(goal.description ?? '');
      setGoalType(goal.goal_type);
      setTargetAmount(goal.target_amount?.toString() ?? '');
      setDeadline(goal.deadline ?? '');
      setFundingAccountId(goal.funding_account_id);
      setPriority(goal.priority);
      setIcon(goal.icon ?? '🎯');
      setColor(goal.color ?? GOAL_COLORS[0]);
    } else {
      setName('');
      setDescription('');
      setGoalType('target');
      setTargetAmount('');
      setDeadline('');
      setFundingAccountId(accounts[0]?.id ?? '');
      setPriority(5);
      setIcon('🎯');
      setColor(GOAL_COLORS[0]);
    }
  }, [goal, accounts, open]);

  const needsTarget = goalType === 'target';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!fundingAccountId) { toast.error('Select an account to save to'); return; }
    if (needsTarget && (!targetAmount || parseFloat(targetAmount) <= 0)) {
      toast.error('Target amount is required'); return;
    }
    if (needsTarget && !deadline) { toast.error('Deadline is required'); return; }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        goal_type: goalType,
        target_amount: needsTarget ? parseFloat(targetAmount) : null,
        deadline: needsTarget ? deadline : null,
        funding_account_id: fundingAccountId,
        priority,
        icon,
        color,
      };

      if (goal) {
        const { error } = await supabase.from('goals').update(payload).eq('id', goal.id);
        if (error) throw error;
        toast.success('Goal updated');
      } else {
        const { error } = await supabase.from('goals').insert(payload);
        if (error) throw error;
        toast.success('Goal created');
      }

      revalidateForEntity('goal');
      onClose();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
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
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed inset-x-4 bottom-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg z-50 bg-card border border-border rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-foreground font-semibold text-base">
                {goal ? 'Edit Goal' : 'New Goal'}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[70vh] p-5 space-y-5">
              {/* Icon + Color row */}
              <div className="flex gap-4">
                <div>
                  <label className="text-muted-foreground text-xs font-medium block mb-2">Icon</label>
                  <div className="flex flex-wrap gap-1.5 w-48">
                    {ICON_OPTIONS.map(ic => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setIcon(ic)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-base transition-colors"
                        style={{
                          background: icon === ic ? color + '33' : 'var(--input)',
                          border: `1px solid ${icon === ic ? color : 'var(--border)'}`,
                        }}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1">
                  <label className="text-muted-foreground text-xs font-medium block mb-2">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {GOAL_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                        style={{ background: c }}
                      >
                        {color === c && <Check className="w-3.5 h-3.5 text-black" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-1.5">Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Life Savings"
                  className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional note about this goal"
                  className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent transition-colors resize-none"
                />
              </div>

              {/* Goal type */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-2">Type *</label>
                <div className="space-y-2">
                  {GOAL_TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGoalType(opt.value)}
                      className="w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors"
                      style={{
                        background: goalType === opt.value ? color + '15' : 'var(--card)',
                        borderColor: goalType === opt.value ? color : 'var(--border)',
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
                        style={{ borderColor: goalType === opt.value ? color : 'var(--muted-foreground)' }}
                      >
                        {goalType === opt.value && (
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        )}
                      </div>
                      <div>
                        <p className="text-foreground text-sm font-medium">{opt.label}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{opt.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Target + deadline (conditional) */}
              {needsTarget && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-muted-foreground text-xs font-medium block mb-1.5">Target Amount *</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={targetAmount}
                      onChange={e => setTargetAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-muted-foreground text-xs font-medium block mb-1.5">Deadline *</label>
                    <input
                      type="date"
                      value={deadline}
                      onChange={e => setDeadline(e.target.value)}
                      className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Funding account */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-1.5">Save to *</label>
                <select
                  value={fundingAccountId}
                  onChange={e => setFundingAccountId(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-base text-foreground focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="">Select account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="text-muted-foreground/70 text-[11px] mt-1">
                  The account where this goal&apos;s money will be tracked.
                </p>
              </div>

              {/* Priority */}
              <div>
                <label className="text-muted-foreground text-xs font-medium block mb-1.5">
                  Priority: <span className="text-foreground">{priority}</span>
                  <span className="text-muted-foreground/70 ml-1">(1 = highest)</span>
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

              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 rounded-xl font-semibold text-sm text-[#0E1A2E] transition-colors disabled:opacity-50"
                style={{ background: color }}
              >
                {saving ? 'Saving…' : goal ? 'Save Changes' : 'Create Goal'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
