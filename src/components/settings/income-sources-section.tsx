'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Wallet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import {
  calculateMonthlyEquivalent,
  totalMonthlyIncome,
  FREQUENCY_LABELS,
  FREQUENCY_COLORS,
  DAY_OF_WEEK,
} from '@/lib/income';
import { formatGHS } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENCY_SYMBOL } from '@/lib/constants';
import type { IncomeSource, IncomeFrequency } from '@/types';

const FREQUENCIES: IncomeFrequency[] = ['monthly', 'weekly', 'biweekly', 'irregular'];

const QUICK_ADD_TEMPLATES = [
  { name: 'Monthly salary', amount: 9000, frequency: 'monthly' as IncomeFrequency, expected_day: 25 },
  { name: 'Weekly allowance', amount: 600, frequency: 'weekly' as IncomeFrequency, expected_day: 1 },
  { name: 'Monthly allowance (irregular)', amount: 2600, frequency: 'irregular' as IncomeFrequency, expected_day: null },
  { name: 'Benefit / subsidy', amount: 500, frequency: 'monthly' as IncomeFrequency, expected_day: 1 },
];

const sourceSchema = z.object({
  name: z.string().min(1, 'Required').max(50, 'Max 50 chars'),
  amount: z.number().positive('Must be greater than 0'),
  frequency: z.enum(['monthly', 'weekly', 'biweekly', 'irregular']),
  expected_day: z.number().int().min(0).max(31).nullable().optional(),
  notes: z.string().max(200).optional(),
  is_active: z.boolean(),
});

type SourceForm = z.infer<typeof sourceSchema>;

async function syncMonthlyIncome(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sources: IncomeSource[]
) {
  const total = totalMonthlyIncome(sources);
  await supabase
    .from('profiles')
    .update({ monthly_income: total, updated_at: new Date().toISOString() })
    .eq('id', userId);
}

interface IncomeSourceModalProps {
  open: boolean;
  onClose: () => void;
  editSource?: IncomeSource;
  onSaved: (sources: IncomeSource[]) => void;
}

function IncomeSourceModal({ open, onClose, editSource, onSaved }: IncomeSourceModalProps) {
  const { user, incomeSources, setIncomeSources, profile, setProfile } = useAuthStore();
  const { bumpMutation } = useTransactionStore();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SourceForm>({
    resolver: zodResolver(sourceSchema),
    defaultValues: editSource
      ? {
          name: editSource.name,
          amount: editSource.amount,
          frequency: editSource.frequency,
          expected_day: editSource.expected_day ?? undefined,
          notes: editSource.notes ?? '',
          is_active: editSource.is_active,
        }
      : { name: '', amount: undefined, frequency: 'monthly', is_active: true },
  });

  const frequency = watch('frequency');
  const isActive = watch('is_active');

  async function onSubmit(values: SourceForm) {
    if (!user) return;

    const payload = {
      user_id: user.id,
      name: values.name,
      amount: values.amount,
      frequency: values.frequency,
      expected_day: values.expected_day ?? null,
      notes: values.notes || null,
      is_active: values.is_active,
    };

    let updatedSources: IncomeSource[];

    if (editSource) {
      const { data, error } = await supabase
        .from('income_sources')
        .update(payload)
        .eq('id', editSource.id)
        .select()
        .single();
      if (error) { toast.error('Failed to save'); return; }
      updatedSources = incomeSources.map(s => s.id === editSource.id ? (data as IncomeSource) : s);
    } else {
      const { data, error } = await supabase
        .from('income_sources')
        .insert(payload)
        .select()
        .single();
      if (error) { toast.error('Failed to save'); return; }
      updatedSources = [...incomeSources, data as IncomeSource];
    }

    setIncomeSources(updatedSources);
    await syncMonthlyIncome(supabase, user.id, updatedSources);

    if (profile) {
      setProfile({ ...profile, monthly_income: totalMonthlyIncome(updatedSources) });
    }

    bumpMutation();
    onSaved(updatedSources);
    reset();
    onClose();
    toast.success(editSource ? 'Income source updated' : 'Income source added');
  }

  const showExpectedDay = frequency === 'monthly' || frequency === 'weekly' || frequency === 'biweekly';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="bg-card border-border text-foreground max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editSource ? 'Edit income source' : 'Add income source'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Name</Label>
            <Input
              placeholder="e.g. Salary, Weekly Allowance"
              className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-accent"
              {...register('name')}
            />
            {errors.name && <p className="text-[#F43F5E] text-xs">{errors.name.message}</p>}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">{CURRENCY_SYMBOL}</span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                className="h-11 pl-7 bg-input border-border text-foreground focus-visible:ring-accent amount"
                {...register('amount', { valueAsNumber: true })}
              />
            </div>
            {errors.amount && <p className="text-[#F43F5E] text-xs">{errors.amount.message}</p>}
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Frequency</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {FREQUENCIES.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setValue('frequency', f); setValue('expected_day', undefined); }}
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

          {/* Expected day (conditional) */}
          {showExpectedDay && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">
                {frequency === 'monthly' ? 'Day of month (optional)' : 'Day of week (optional)'}
              </Label>
              {frequency === 'monthly' ? (
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="1–31"
                  className="h-11 bg-input border-border text-foreground focus-visible:ring-accent"
                  {...register('expected_day', { valueAsNumber: true })}
                />
              ) : (
                <Select
                  onValueChange={(v) => setValue('expected_day', v != null ? parseInt(v) : undefined)}
                  defaultValue={editSource?.expected_day != null ? String(editSource.expected_day) : undefined}
                >
                  <SelectTrigger className="h-11 bg-input border-border text-foreground focus:ring-accent">
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {DAY_OF_WEEK.map((day, i) => (
                      <SelectItem key={i} value={String(i)} className="text-foreground focus:bg-muted">
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Notes (optional)</Label>
            <textarea
              rows={2}
              className="w-full rounded-xl h-16 px-3 py-2 text-sm bg-input border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              placeholder="Any details…"
              {...register('notes')}
            />
          </div>

          {/* Active toggle (edit only) */}
          {editSource && (
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-sm">Active</Label>
              <button
                type="button"
                onClick={() => setValue('is_active', !isActive)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                style={{ backgroundColor: isActive ? '#00D9A3' : 'var(--border)' }}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  style={{ transform: isActive ? 'translateX(22px)' : 'translateX(2px)' }}
                />
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editSource ? 'Save changes' : 'Add source'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IncomeSourcesSection() {
  const { user, incomeSources, setIncomeSources, profile, setProfile } = useAuthStore();
  const { bumpMutation } = useTransactionStore();
  const supabase = createClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editSource, setEditSource] = useState<IncomeSource | undefined>();

  function openAdd(template?: (typeof QUICK_ADD_TEMPLATES)[0]) {
    setEditSource(undefined);
    setModalOpen(true);
    void template;
  }

  function openEdit(source: IncomeSource) {
    setEditSource(source);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    if (!user) return;
    const { error } = await supabase.from('income_sources').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    const updated = incomeSources.filter(s => s.id !== id);
    setIncomeSources(updated);
    await syncMonthlyIncome(supabase, user.id, updated);
    if (profile) setProfile({ ...profile, monthly_income: totalMonthlyIncome(updated) });
    bumpMutation();
    toast.success('Income source removed');
  }

  const total = totalMonthlyIncome(incomeSources);

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#00D9A3]" />
            <h2 className="text-foreground font-semibold">Income Sources</h2>
          </div>
          <Button
            onClick={() => openAdd()}
            className="h-8 px-3 text-xs bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-medium rounded-lg gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add source
          </Button>
        </div>

        {incomeSources.length === 0 ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">No income sources yet. Add one or start from a template:</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ADD_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    setEditSource(undefined);
                    setModalOpen(true);
                  }}
                  className="text-left p-3 rounded-xl border border-border hover:border-[#00D9A3]/50 bg-muted hover:bg-muted transition-colors"
                  title={`${formatGHS(t.amount)} · ${FREQUENCY_LABELS[t.frequency]}`}
                >
                  <p className="text-foreground text-xs font-medium leading-tight">{t.name}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{formatGHS(t.amount)}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {incomeSources.map((source) => {
              const monthlyEq = calculateMonthlyEquivalent(source.amount, source.frequency);
              const showEq = source.frequency !== 'monthly' && source.frequency !== 'irregular';
              return (
                <div
                  key={source.id}
                  className="flex items-center justify-between px-3 py-2.5 bg-muted rounded-xl"
                  style={{ opacity: source.is_active ? 1 : 0.5 }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-medium truncate">{source.name}</span>
                      <Badge
                        className="text-[10px] px-1.5 py-0 h-4 font-medium border-0"
                        style={{
                          backgroundColor: FREQUENCY_COLORS[source.frequency] + '22',
                          color: FREQUENCY_COLORS[source.frequency],
                        }}
                      >
                        {FREQUENCY_LABELS[source.frequency]}
                      </Badge>
                      {!source.is_active && (
                        <span className="text-muted-foreground/70 text-[10px]">inactive</span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-muted-foreground text-xs">{formatGHS(source.amount)}</span>
                      {showEq && (
                        <span className="text-muted-foreground/70 text-[11px]">≈ {formatGHS(monthlyEq)}/mo</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => openEdit(source)}
                      className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="w-7 h-7 rounded-lg text-muted-foreground hover:text-[#F43F5E] flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
              <span className="text-muted-foreground text-sm">Total monthly income</span>
              <span className="text-foreground text-base font-bold">{formatGHS(total)}</span>
            </div>
          </div>
        )}
      </div>

      <IncomeSourceModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditSource(undefined); }}
        editSource={editSource}
        onSaved={() => {}}
      />
    </>
  );
}
