'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Sparkles, ChevronRight, ChevronLeft, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { CURRENCY_SYMBOL } from '@/lib/constants';
import {
  calculateMonthlyEquivalent,
  totalMonthlyIncome,
  FREQUENCY_LABELS,
  FREQUENCY_COLORS,
} from '@/lib/income';
import { formatGHS } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { IncomeFrequency, IncomeSource } from '@/types';

type TempSource = {
  _key: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  expected_day: number | null;
};

const FREQUENCIES: IncomeFrequency[] = ['monthly', 'weekly', 'biweekly', 'irregular'];

type ExtraTemplate = Omit<TempSource, 'amount'>;

const EXTRA_TEMPLATES: ExtraTemplate[] = [
  { _key: 'weekly-allowance', name: 'Weekly Allowance', frequency: 'weekly', expected_day: 1 },
  { _key: 'monthly-allowance', name: 'Monthly Allowance', frequency: 'irregular', expected_day: null },
  { _key: 'side-hustle', name: 'Side Hustle', frequency: 'irregular', expected_day: null },
  { _key: 'benefit', name: 'Benefit / Subsidy', frequency: 'monthly', expected_day: 1 },
];

const primarySchema = z.object({
  name: z.string().min(1, 'Required').max(50),
  amount: z.number().positive('Must be greater than 0'),
  frequency: z.enum(['monthly', 'weekly', 'biweekly', 'irregular']),
});

type PrimaryForm = z.infer<typeof primarySchema>;

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const { user, setProfile, setIncomeSources } = useAuthStore();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [primarySource, setPrimarySource] = useState<TempSource | null>(null);
  const [extraSources, setExtraSources] = useState<TempSource[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeSourceKey, setActiveSourceKey] = useState<string | null>(null);
  const [inputAmount, setInputAmount] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PrimaryForm>({
    resolver: zodResolver(primarySchema),
    defaultValues: { name: 'Salary', amount: 9000, frequency: 'monthly' },
  });

  const frequency = watch('frequency');

  function handleChipTap(t: ExtraTemplate) {
    if (extraSources.some(s => s._key === t._key)) return;
    setActiveSourceKey(t._key);
    setInputAmount('');
  }

  function handleChipConfirm(t: ExtraTemplate) {
    const amount = parseFloat(inputAmount);
    if (!amount || amount <= 0) return;
    setExtraSources(prev => [...prev, { ...t, amount }]);
    setActiveSourceKey(null);
    setInputAmount('');
  }

  function handleChipCancel() {
    setActiveSourceKey(null);
    setInputAmount('');
  }

  function removeExtra(key: string) {
    setExtraSources(prev => prev.filter(s => s._key !== key));
  }

  function onPrimarySubmit(values: PrimaryForm) {
    setPrimarySource({ _key: 'primary', ...values, expected_day: null });
    setStep(3);
  }

  async function handleFinish() {
    if (!user || !primarySource) return;
    setSaving(true);

    const all = [primarySource, ...extraSources];
    const toInsert = all.map(s => ({
      user_id: user.id,
      name: s.name,
      amount: s.amount,
      frequency: s.frequency,
      expected_day: s.expected_day,
      is_active: true,
      notes: null,
    }));

    const { data: savedSources, error } = await supabase
      .from('income_sources')
      .insert(toInsert)
      .select();

    if (error) {
      setSaving(false);
      return;
    }

    const sources = savedSources as IncomeSource[];
    const total = totalMonthlyIncome(sources);

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({ monthly_income: total, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single();

    if (updatedProfile) setProfile(updatedProfile);
    setIncomeSources(sources);
    setSaving(false);
    onClose();
  }

  const allSources = primarySource ? [primarySource, ...extraSources] : [];
  const totalMonthly = allSources.reduce(
    (sum, s) => sum + calculateMonthlyEquivalent(s.amount, s.frequency),
    0
  );

  function handleClose() {
    setStep(1);
    setPrimarySource(null);
    setExtraSources([]);
    setActiveSourceKey(null);
    setInputAmount('');
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            key={step}
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative z-10 bg-card border border-border rounded-2xl p-6 w-full max-w-sm"
          >
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mb-5">
              {([1, 2, 3, 4] as const).map(s => (
                <div
                  key={s}
                  className="h-1 rounded-full transition-all"
                  style={{
                    flex: s === step ? 2 : 1,
                    backgroundColor: s <= step ? '#00D9A3' : 'var(--border)',
                  }}
                />
              ))}
            </div>

            {/* Step 1: Intro */}
            {step === 1 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[#00D9A3]/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[#00D9A3]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">How do you earn?</h2>
                    <p className="text-muted-foreground text-xs">Let&apos;s set up your income</p>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm mb-6">
                  Sika tracks multiple income sources — salary, allowances, side income — so your 50/30/20 split always reflects your real situation.
                </p>
                <Button
                  onClick={() => setStep(2)}
                  className="w-full h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
                >
                  Add my income <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
                <button
                  onClick={handleClose}
                  className="w-full mt-3 text-muted-foreground/70 text-sm hover:text-muted-foreground transition-colors"
                >
                  I&apos;ll do this later
                </button>
              </div>
            )}

            {/* Step 2: Primary income */}
            {step === 2 && (
              <div>
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 text-muted-foreground text-sm mb-4 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <h2 className="text-lg font-bold text-foreground mb-1">Primary income</h2>
                <p className="text-muted-foreground text-xs mb-5">Your main source of earnings</p>

                <form onSubmit={handleSubmit(onPrimarySubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-sm">Source name</Label>
                    <Input
                      placeholder="e.g. Salary"
                      className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-accent"
                      {...register('name')}
                    />
                    {errors.name && <p className="text-[#F43F5E] text-xs">{errors.name.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-sm">Amount ({CURRENCY_SYMBOL})</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">{CURRENCY_SYMBOL}</span>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="h-11 pl-7 bg-input border-border text-foreground focus-visible:ring-accent amount"
                        {...register('amount', { valueAsNumber: true })}
                      />
                    </div>
                    {errors.amount && <p className="text-[#F43F5E] text-xs">{errors.amount.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-sm">Frequency</Label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {FREQUENCIES.map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setValue('frequency', f)}
                          className="h-9 rounded-lg text-xs font-medium transition-colors"
                          style={
                            frequency === f
                              ? { backgroundColor: FREQUENCY_COLORS[f] + '22', color: FREQUENCY_COLORS[f], borderWidth: 1, borderColor: FREQUENCY_COLORS[f] }
                              : { backgroundColor: 'var(--input)', color: 'var(--muted-foreground)', borderWidth: 1, borderColor: 'var(--border)' }
                          }
                        >
                          {f === 'biweekly' ? 'Bi-wk' : FREQUENCY_LABELS[f]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
                  >
                    Continue <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </form>
              </div>
            )}

            {/* Step 3: Any other income? */}
            {step === 3 && (
              <div>
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1 text-muted-foreground text-sm mb-4 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <h2 className="text-lg font-bold text-foreground mb-1">Any other income?</h2>
                <p className="text-muted-foreground text-xs mb-4">Add more sources or skip — you can always add them in Settings</p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {EXTRA_TEMPLATES.map(t => {
                    const added = extraSources.some(s => s._key === t._key);
                    const isInput = activeSourceKey === t._key;

                    if (isInput) {
                      return (
                        <div
                          key={t._key}
                          className="col-span-2 flex items-center gap-2 p-2.5 rounded-xl border"
                          style={{ borderColor: '#00D9A3', backgroundColor: '#00D9A309' }}
                        >
                          <div className="flex-1 flex items-center gap-1 bg-input rounded-lg px-2.5 py-1.5">
                            <span className="text-muted-foreground font-mono shrink-0" style={{ fontSize: 16 }}>{CURRENCY_SYMBOL}</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              autoFocus
                              value={inputAmount}
                              onChange={e => setInputAmount(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleChipConfirm(t);
                                if (e.key === 'Escape') handleChipCancel();
                              }}
                              placeholder="0.00"
                              className="flex-1 bg-transparent text-foreground outline-none min-w-0"
                              style={{ fontSize: 16 }}
                            />
                          </div>
                          <button
                            onClick={() => handleChipConfirm(t)}
                            disabled={!inputAmount || parseFloat(inputAmount) <= 0}
                            className="w-8 h-8 rounded-lg bg-[#00D9A3] text-[#0A0A0B] flex items-center justify-center disabled:opacity-40 shrink-0 transition-opacity"
                            aria-label="Confirm amount"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleChipCancel}
                            className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0"
                            aria-label="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={t._key}
                        onClick={() => handleChipTap(t)}
                        disabled={added}
                        className="text-left p-3 rounded-xl border transition-all disabled:cursor-default"
                        style={{
                          borderColor: added ? '#00D9A3' : 'var(--border)',
                          backgroundColor: added ? '#00D9A311' : 'var(--input)',
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-foreground text-xs font-medium leading-tight">{t.name}</p>
                          {added && <Check className="w-3 h-3 text-[#00D9A3] shrink-0 ml-1" />}
                        </div>
                        <p className="text-muted-foreground text-xs mt-0.5">{FREQUENCY_LABELS[t.frequency]}</p>
                      </button>
                    );
                  })}
                </div>

                {extraSources.length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    {extraSources.map(s => (
                      <div key={s._key} className="flex items-center justify-between px-3 py-2 bg-muted rounded-lg">
                        <div>
                          <span className="text-foreground text-xs font-medium">{s.name}</span>
                          <span className="text-muted-foreground text-xs ml-2">{formatGHS(s.amount)} · {FREQUENCY_LABELS[s.frequency]}</span>
                        </div>
                        <button onClick={() => removeExtra(s._key)} className="text-muted-foreground/70 hover:text-[#F43F5E] ml-2 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={() => setStep(4)}
                  className="w-full h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
                >
                  {extraSources.length > 0 ? 'Continue' : 'Skip for now'} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1 text-muted-foreground text-sm mb-4 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <h2 className="text-lg font-bold text-foreground mb-1">Your monthly income</h2>
                <div className="text-3xl font-bold text-[#00D9A3] mb-5">
                  {formatGHS(totalMonthly)}
                </div>

                <div className="space-y-1.5 mb-5">
                  {allSources.map(s => {
                    const eq = calculateMonthlyEquivalent(s.amount, s.frequency);
                    return (
                      <div key={s._key} className="flex items-center justify-between px-3 py-2 bg-muted rounded-lg">
                        <div>
                          <span className="text-foreground text-xs font-medium">{s.name}</span>
                          <span className="text-muted-foreground text-xs ml-2">{FREQUENCY_LABELS[s.frequency]}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-foreground text-xs">{formatGHS(s.amount)}</span>
                          {s.frequency !== 'monthly' && s.frequency !== 'irregular' && (
                            <p className="text-muted-foreground/70 text-[10px]">≈ {formatGHS(eq)}/mo</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bucket preview */}
                <div className="bg-muted rounded-xl p-3 mb-5">
                  <p className="text-muted-foreground text-xs mb-2">50/30/20 split</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {([
                      { label: 'Needs', pct: 50, color: '#00D9A3' },
                      { label: 'Wants', pct: 30, color: '#FBBF24' },
                      { label: 'Future', pct: 20, color: '#60A5FA' },
                    ] as const).map(b => (
                      <div key={b.label}>
                        <p className="text-[10px]" style={{ color: b.color }}>{b.label}</p>
                        <p className="text-foreground text-xs font-semibold">{formatGHS((totalMonthly * b.pct) / 100)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleFinish}
                  disabled={saving}
                  className="w-full h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Looks good, let's start →"}
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
