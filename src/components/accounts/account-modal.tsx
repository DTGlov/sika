'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { ACCOUNT_TYPE_CONFIG } from '@/lib/accounts';
import { formatGHS } from '@/lib/utils';
import { revalidateForEntity } from '@/lib/revalidation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CURRENCY_SYMBOL } from '@/lib/constants';
import type { Account, AccountType } from '@/types/account';

const ACCOUNT_TYPES: AccountType[] = ['bank', 'momo', 'cash', 'savings', 'investment', 'other'];

const accountSchema = z.object({
  name: z.string().min(1, 'Required').max(40, 'Max 40 chars'),
  type: z.enum(['bank', 'momo', 'cash', 'savings', 'investment', 'other']),
  opening_balance: z.number().min(0, 'Must be ≥ 0'),
  is_default: z.boolean(),
  is_active: z.boolean(),
});

type AccountForm = z.infer<typeof accountSchema>;

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  editAccount?: Account;
  currentBalance?: number;
  onSaved: (accounts: Account[]) => void;
}

export function AccountModal({ open, onClose, editAccount, currentBalance, onSaved }: AccountModalProps) {
  const { user, accounts, setAccounts } = useAuthStore();
  const { addTransaction, openReconcileSheet } = useTransactionStore();
  const supabase = createClient();
  const [reconcileMode, setReconcileMode] = useState(false);
  const [reconcileActual, setReconcileActual] = useState('');
  const [reconcileSaving, setReconcileSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: editAccount
      ? {
          name: editAccount.name,
          type: editAccount.type,
          opening_balance: editAccount.opening_balance,
          is_default: editAccount.is_default,
          is_active: editAccount.is_active,
        }
      : { name: '', type: 'bank', opening_balance: 0, is_default: false, is_active: true },
  });

  useEffect(() => {
    if (open) {
      reset(
        editAccount
          ? {
              name: editAccount.name,
              type: editAccount.type,
              opening_balance: editAccount.opening_balance,
              is_default: editAccount.is_default,
              is_active: editAccount.is_active,
            }
          : { name: '', type: 'bank', opening_balance: undefined as unknown as number, is_default: false, is_active: true }
      );
      setReconcileMode(false);
      setReconcileActual('');
    }
  }, [open, editAccount, reset]);

  const type = watch('type');
  const isDefault = watch('is_default');
  const isActive = watch('is_active');

  async function onSubmit(values: AccountForm) {
    if (!user) return;

    const payload = {
      user_id: user.id,
      name: values.name,
      type: values.type,
      icon: ACCOUNT_TYPE_CONFIG[values.type].emoji,
      color: ACCOUNT_TYPE_CONFIG[values.type].color,
      opening_balance: values.opening_balance,
      is_default: values.is_default,
      is_active: values.is_active,
    };

    let updatedAccounts: Account[];

    if (editAccount) {
      if (values.is_default && !editAccount.is_default) {
        await supabase
          .from('accounts')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true);
      }
      const { data, error } = await supabase
        .from('accounts')
        .update(payload)
        .eq('id', editAccount.id)
        .select()
        .single();
      if (error) { toast.error('Failed to save'); return; }
      updatedAccounts = accounts.map(a =>
        a.id === editAccount.id ? (data as Account) : values.is_default ? { ...a, is_default: false } : a
      );
    } else {
      if (values.is_default) {
        await supabase
          .from('accounts')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true);
      }
      const { data, error } = await supabase
        .from('accounts')
        .insert({ ...payload, sort_order: accounts.length + 1 })
        .select()
        .single();
      if (error) { toast.error('Failed to save'); return; }
      const newAcc = data as Account;
      updatedAccounts = [
        ...accounts.map(a => values.is_default ? { ...a, is_default: false } : a),
        newAcc,
      ];
    }

    setAccounts(updatedAccounts.filter(a => a.is_active));
    onSaved(updatedAccounts);
    revalidateForEntity('account');
    reset();
    onClose();
    toast.success(editAccount ? 'Account updated' : 'Account created');
  }

  async function handleReconcileFromModal() {
    if (!user || !editAccount || reconcileActual === '') return;
    const sikaBalance = currentBalance ?? editAccount.opening_balance;
    const diff = (parseFloat(reconcileActual) || 0) - sikaBalance;
    if (diff === 0) { toast.error('Balance already matches'); return; }
    setReconcileSaving(true);
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: diff,
        type: 'adjustment',
        category_id: null,
        account_id: editAccount.id,
        to_account_id: null,
        note: `Reconciled to ${formatGHS(parseFloat(reconcileActual) || 0)}`,
        transaction_date: new Date().toISOString().slice(0, 10),
      })
      .select('*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)')
      .single();
    setReconcileSaving(false);
    if (error) { toast.error('Failed to reconcile'); return; }
    addTransaction(data);
    revalidateForEntity('adjustment');
    toast.success(`Reconciled to ${formatGHS(parseFloat(reconcileActual) || 0)}`);
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="bg-card border-border text-foreground max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editAccount ? 'Edit account' : 'Add account'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Name</Label>
            <Input
              placeholder="e.g. Bank, MoMo"
              className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-accent"
              {...register('name')}
            />
            {errors.name && <p className="text-[#F43F5E] text-xs">{errors.name.message}</p>}
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map(t => {
                const cfg = ACCOUNT_TYPE_CONFIG[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValue('type', t)}
                    className="h-14 rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-medium border transition-all"
                    style={{
                      borderColor: active ? cfg.color : 'var(--border)',
                      backgroundColor: active ? cfg.color + '18' : 'var(--muted)',
                      color: active ? cfg.color : 'var(--muted-foreground)',
                    }}
                  >
                    <span className="text-lg">{cfg.emoji}</span>
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Opening balance */}
          {!reconcileMode && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">
                {editAccount ? 'Opening balance' : 'Current balance — RIGHT NOW'}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">{CURRENCY_SYMBOL}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="h-11 pl-7 bg-input border-border text-foreground focus-visible:ring-accent amount"
                  {...register('opening_balance', { valueAsNumber: true })}
                />
              </div>
              {!editAccount && (
                <p className="text-muted-foreground/70 text-[11px]">
                  Enter the actual balance in this account today — not zero, unless it's empty.
                  Sika adds/subtracts from this as you log transactions.
                </p>
              )}
              {errors.opening_balance && <p className="text-[#F43F5E] text-xs">{errors.opening_balance.message}</p>}
            </div>
          )}

          {/* Set as default */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-muted-foreground text-sm">Set as default</Label>
              <p className="text-muted-foreground/70 text-[11px]">Used for new transactions</p>
            </div>
            <button
              type="button"
              onClick={() => setValue('is_default', !isDefault)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
              style={{ backgroundColor: isDefault ? '#00D9A3' : 'var(--border)' }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                style={{ transform: isDefault ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </div>

          {/* Active toggle — edit only */}
          {editAccount && (
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-sm">Active</Label>
              <button
                type="button"
                onClick={() => setValue('is_active', !isActive)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
                style={{ backgroundColor: isActive ? '#00D9A3' : 'var(--border)' }}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  style={{ transform: isActive ? 'translateX(22px)' : 'translateX(2px)' }}
                />
              </button>
            </div>
          )}

          {/* Reconcile section — editing only */}
          {editAccount && currentBalance !== undefined && (
            <div className="border border-border rounded-xl p-3 space-y-3">
              <button
                type="button"
                onClick={() => { setReconcileMode(v => !v); setReconcileActual(''); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Scale className="w-4 h-4" />
                <span className="font-medium">Reconcile to real balance</span>
                <span className="ml-auto text-muted-foreground/70 text-xs">{reconcileMode ? '▴' : '▾'}</span>
              </button>

              {reconcileMode && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Sika shows</span>
                    <span className="text-foreground font-semibold tabular-nums">{formatGHS(currentBalance)}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">{CURRENCY_SYMBOL}</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Actual current balance"
                      value={reconcileActual}
                      onChange={(e) => setReconcileActual(e.target.value)}
                      className="h-10 pl-7 bg-input border-border text-foreground focus-visible:ring-accent amount"
                    />
                  </div>
                  {reconcileActual !== '' && (() => {
                    const diff = (parseFloat(reconcileActual) || 0) - currentBalance;
                    const isPos = diff >= 0;
                    return (
                      <div className="flex items-center justify-between text-sm rounded-lg px-3 py-2"
                        style={{ backgroundColor: isPos ? '#00D9A318' : '#F43F5E18' }}>
                        <span className="text-muted-foreground">Adjustment</span>
                        <span style={{ color: isPos ? '#00D9A3' : '#F43F5E' }} className="font-semibold tabular-nums">
                          {isPos ? '+' : ''}{formatGHS(diff)}
                        </span>
                      </div>
                    );
                  })()}
                  <Button
                    type="button"
                    onClick={handleReconcileFromModal}
                    disabled={reconcileSaving || reconcileActual === '' || (parseFloat(reconcileActual) || 0) === currentBalance}
                    className="w-full h-10 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl text-sm"
                  >
                    {reconcileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create adjustment & close'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {!reconcileMode && (
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editAccount ? 'Save changes' : 'Add account'}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Re-exported for use on accounts page balance display
export { formatGHS };
