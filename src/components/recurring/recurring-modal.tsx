'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { ACCOUNT_TYPE_CONFIG } from '@/lib/accounts';
import { DAY_OF_WEEK_LABELS } from '@/lib/recurring';
import { revalidateForEntity } from '@/lib/revalidation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RecurringTransaction, RecurringFrequency } from '@/types';

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const schema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive('Must be > 0'),
  account_id: z.string().min(1, 'Required'),
  category_id: z.string().nullable(),
  note: z.string().nullable(),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']),
  schedule_day: z.number().nullable(),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().nullable(),
  auto_log: z.boolean(),
  is_paused: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface RecurringModalProps {
  open: boolean;
  onClose: () => void;
  editItem?: RecurringTransaction;
  onSaved: () => void;
  defaultValues?: Partial<FormValues>;
}

export function RecurringModal({ open, onClose, editItem, onSaved, defaultValues }: RecurringModalProps) {
  const { user, accounts } = useAuthStore();
  const { categories } = useTransactionStore();
  const supabase = createClient();

  const defaultAccount = accounts.find(a => a.is_default) ?? accounts[0];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editItem ? {
      type: editItem.type,
      amount: editItem.amount,
      account_id: editItem.account_id,
      category_id: editItem.category_id,
      note: editItem.note,
      frequency: editItem.frequency,
      schedule_day: editItem.schedule_day,
      start_date: editItem.start_date,
      end_date: editItem.end_date,
      auto_log: editItem.auto_log,
      is_paused: editItem.is_paused,
    } : {
      type: defaultValues?.type ?? 'expense',
      amount: undefined as unknown as number,
      account_id: defaultValues?.account_id ?? defaultAccount?.id ?? '',
      category_id: defaultValues?.category_id ?? null,
      note: defaultValues?.note ?? null,
      frequency: defaultValues?.frequency ?? 'monthly',
      schedule_day: defaultValues?.schedule_day ?? null,
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: null,
      auto_log: defaultValues?.auto_log ?? true,
      is_paused: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    reset(editItem ? {
      type: editItem.type,
      amount: editItem.amount,
      account_id: editItem.account_id,
      category_id: editItem.category_id,
      note: editItem.note,
      frequency: editItem.frequency,
      schedule_day: editItem.schedule_day,
      start_date: editItem.start_date,
      end_date: editItem.end_date,
      auto_log: editItem.auto_log,
      is_paused: editItem.is_paused,
    } : {
      type: defaultValues?.type ?? 'expense',
      amount: undefined as unknown as number,
      account_id: defaultValues?.account_id ?? defaultAccount?.id ?? '',
      category_id: defaultValues?.category_id ?? null,
      note: defaultValues?.note ?? null,
      frequency: defaultValues?.frequency ?? 'monthly',
      schedule_day: defaultValues?.schedule_day ?? null,
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: null,
      auto_log: defaultValues?.auto_log ?? true,
      is_paused: false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const txType = watch('type');
  const frequency = watch('frequency');
  const scheduleDay = watch('schedule_day');
  const autoLog = watch('auto_log');
  const isPaused = watch('is_paused');
  const endDate = watch('end_date');

  const [showIncomeWarning, setShowIncomeWarning] = useState(false);

  function handleAutoLogToggle() {
    const next = !autoLog;
    if (next && txType === 'income') {
      setShowIncomeWarning(true);
      return;
    }
    setValue('auto_log', next);
  }

  function confirmIncomeAutoLog() {
    setValue('auto_log', true);
    setShowIncomeWarning(false);
  }

  const autoLogHelperText = txType === 'income'
    ? 'Income arrival can be unpredictable. Recommended: keep this off and confirm via the reminder card when money arrives.'
    : 'Auto-log for fixed obligations (rent, subscriptions). Turn off if amount varies — Sika will nudge you to confirm instead.';

  const filteredCategories = categories.filter(c => {
    const ct = c.category_type ?? (c.bucket_id ? 'expense' : 'income');
    return ct === txType;
  });

  async function onSubmit(values: FormValues) {
    if (!user) return;

    const payload = {
      user_id: user.id,
      type: values.type,
      amount: values.amount,
      account_id: values.account_id,
      category_id: values.category_id || null,
      note: values.note || null,
      frequency: values.frequency,
      schedule_day: values.schedule_day,
      start_date: values.start_date,
      end_date: values.end_date || null,
      auto_log: values.auto_log,
      is_paused: values.is_paused,
    };

    if (editItem) {
      const { error } = await supabase
        .from('recurring_transactions')
        .update(payload)
        .eq('id', editItem.id);
      if (error) { toast.error('Failed to save'); return; }
      toast.success('Updated');
    } else {
      const { error } = await supabase
        .from('recurring_transactions')
        .insert({ ...payload, is_active: true });
      if (error) { toast.error('Failed to create'); return; }
      toast.success('Recurring transaction created');
    }

    revalidateForEntity('transaction');
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editItem ? 'Edit recurring' : 'New recurring transaction'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-1 bg-muted rounded-xl p-1">
            {(['expense', 'income'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setValue('type', t); setValue('category_id', null); }}
                className="h-9 rounded-lg text-sm font-medium transition-colors capitalize"
                style={{
                  backgroundColor: txType === t ? (t === 'expense' ? '#F43F5E18' : '#00D9A318') : 'transparent',
                  color: txType === t ? (t === 'expense' ? '#F43F5E' : '#00D9A3') : 'var(--muted-foreground)',
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Amount</Label>
            <Input
              type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00"
              className="h-11 px-3 bg-input border-border text-foreground focus-visible:ring-accent amount"
              {...register('amount', { valueAsNumber: true })}
            />
            {errors.amount && <p className="text-[#F43F5E] text-xs">{errors.amount.message}</p>}
          </div>

          {/* Account */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Account</Label>
            <Select
              value={watch('account_id')}
              onValueChange={(v) => { if (v) setValue('account_id', v); }}
            >
              <SelectTrigger className="h-11 bg-input border-border text-foreground">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {ACCOUNT_TYPE_CONFIG[a.type].emoji} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.account_id && <p className="text-[#F43F5E] text-xs">{errors.account_id.message}</p>}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Category (optional)</Label>
            <Select
              value={watch('category_id') ?? 'none'}
              onValueChange={(v) => setValue('category_id', v === 'none' ? null : v)}
            >
              <SelectTrigger className="h-11 bg-input border-border text-foreground">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="none">No category</SelectItem>
                {filteredCategories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Note (optional)</Label>
            <Input
              placeholder="e.g. Monthly rent"
              className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-accent"
              {...register('note')}
            />
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Frequency</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {FREQUENCIES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setValue('frequency', value); setValue('schedule_day', null); }}
                  className="h-9 rounded-xl border text-xs font-medium transition-all"
                  style={{
                    borderColor: frequency === value ? '#00D9A3' : 'var(--border)',
                    backgroundColor: frequency === value ? '#00D9A318' : 'var(--input)',
                    color: frequency === value ? '#00D9A3' : 'var(--muted-foreground)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Day-of-week picker — weekly / biweekly */}
          {(frequency === 'weekly' || frequency === 'biweekly') && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">Day of week</Label>
              <div className="grid grid-cols-7 gap-1">
                {DAY_OF_WEEK_LABELS.map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setValue('schedule_day', i)}
                    className="h-9 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: scheduleDay === i ? '#00D9A3' : 'var(--input)',
                      color: scheduleDay === i ? '#0E1A2E' : 'var(--muted-foreground)',
                    }}
                  >
                    {day[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Day-of-month picker — monthly */}
          {frequency === 'monthly' && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">Day of month</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="number" min="1" max="28" placeholder="1–28"
                  className="h-11 bg-input border-border text-foreground focus-visible:ring-accent w-24"
                  value={scheduleDay != null && scheduleDay !== -1 ? scheduleDay : ''}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    setValue('schedule_day', isNaN(v) ? null : Math.min(Math.max(v, 1), 28));
                  }}
                />
                <button
                  type="button"
                  onClick={() => setValue('schedule_day', scheduleDay === -1 ? null : -1)}
                  className="h-11 px-3 rounded-xl border text-xs font-medium transition-all"
                  style={{
                    borderColor: scheduleDay === -1 ? '#00D9A3' : 'var(--border)',
                    backgroundColor: scheduleDay === -1 ? '#00D9A318' : 'var(--input)',
                    color: scheduleDay === -1 ? '#00D9A3' : 'var(--muted-foreground)',
                  }}
                >
                  Last day
                </button>
              </div>
            </div>
          )}

          {/* Start date */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Start date</Label>
            <Input
              type="date"
              className="h-11 bg-input border-border text-foreground focus-visible:ring-accent"
              {...register('start_date')}
            />
          </div>

          {/* End date */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-sm">End date</Label>
              {endDate && (
                <button type="button" onClick={() => setValue('end_date', null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Remove
                </button>
              )}
            </div>
            {endDate ? (
              <Input
                type="date"
                className="h-11 bg-input border-border text-foreground focus-visible:ring-accent"
                value={endDate ?? ''}
                onChange={e => setValue('end_date', e.target.value || null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setValue('end_date', format(new Date(), 'yyyy-MM-dd'))}
                className="h-11 w-full rounded-xl border border-dashed border-border text-muted-foreground/70 text-sm hover:border-border hover:text-muted-foreground transition-colors"
              >
                + Add end date (optional)
              </button>
            )}
          </div>

          {/* Auto-log toggle */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-muted-foreground text-sm">Auto-log</Label>
              <p className="text-muted-foreground/70 text-[11px] mt-0.5">
                {autoLogHelperText}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAutoLogToggle}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 mt-0.5"
              style={{ backgroundColor: autoLog ? '#00D9A3' : 'var(--border)' }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                style={{ transform: autoLog ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </div>

          {/* Paused toggle — edit only */}
          {editItem && (
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-sm">Paused</Label>
              <button
                type="button"
                onClick={() => setValue('is_paused', !isPaused)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
                style={{ backgroundColor: isPaused ? '#FBBF24' : 'var(--border)' }}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  style={{ transform: isPaused ? 'translateX(22px)' : 'translateX(2px)' }}
                />
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editItem ? 'Save changes' : 'Create'}
          </Button>
        </form>
      </DialogContent>

      <Dialog open={showIncomeWarning} onOpenChange={setShowIncomeWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-log income?</DialogTitle>
            <DialogDescription>
              Income often arrives late or skips a cycle. Auto-logging means Sika will count this money before it actually lands — your balance may show more than what&apos;s really in your accounts.
            </DialogDescription>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Recommended:</strong> Keep auto-log off for income, and tap the reminder card to confirm when the money arrives.
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowIncomeWarning(false)}
            >
              Keep it manual
            </Button>
            <Button
              type="button"
              onClick={confirmIncomeAutoLog}
              className="bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E]"
            >
              Auto-log anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
