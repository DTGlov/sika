'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { ACCOUNT_TYPE_CONFIG } from '@/lib/accounts';
import { formatGHS } from '@/lib/utils';
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
  onSaved: (accounts: Account[]) => void;
}

export function AccountModal({ open, onClose, editAccount, onSaved }: AccountModalProps) {
  const { user, accounts, setAccounts } = useAuthStore();
  const supabase = createClient();

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

  // Reset form when editAccount changes
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
          : { name: '', type: 'bank', opening_balance: 0, is_default: false, is_active: true }
      );
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
      icon: ACCOUNT_TYPE_CONFIG[values.type].emoji, // store emoji as icon
      color: ACCOUNT_TYPE_CONFIG[values.type].color,
      opening_balance: values.opening_balance,
      is_default: values.is_default,
      is_active: values.is_active,
    };

    let updatedAccounts: Account[];

    if (editAccount) {
      // If setting as default, clear existing default first
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
      // If new account should be default, clear existing
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
    reset();
    onClose();
    toast.success(editAccount ? 'Account updated' : 'Account created');
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="bg-[#141416] border-[#27272A] text-[#FAFAFA] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#FAFAFA]">
            {editAccount ? 'Edit account' : 'Add account'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA] text-sm">Name</Label>
            <Input
              placeholder="e.g. Bank, MoMo"
              className="h-11 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#52525B] focus-visible:ring-[#00D9A3]"
              {...register('name')}
            />
            {errors.name && <p className="text-[#F43F5E] text-xs">{errors.name.message}</p>}
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA] text-sm">Type</Label>
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
                      borderColor: active ? cfg.color : '#27272A',
                      backgroundColor: active ? cfg.color + '18' : '#1C1C1F',
                      color: active ? cfg.color : '#71717A',
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
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA] text-sm">Opening balance</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] font-mono text-sm">{CURRENCY_SYMBOL}</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-11 pl-7 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] focus-visible:ring-[#00D9A3] amount"
                {...register('opening_balance', { valueAsNumber: true })}
              />
            </div>
            <p className="text-[#52525B] text-[11px]">
              Current balance at time of setup. After this, Sika tracks all changes.
            </p>
            {errors.opening_balance && <p className="text-[#F43F5E] text-xs">{errors.opening_balance.message}</p>}
          </div>

          {/* Set as default */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[#A1A1AA] text-sm">Set as default</Label>
              <p className="text-[#52525B] text-[11px]">Used for new transactions</p>
            </div>
            <button
              type="button"
              onClick={() => setValue('is_default', !isDefault)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
              style={{ backgroundColor: isDefault ? '#00D9A3' : '#27272A' }}
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
              <Label className="text-[#A1A1AA] text-sm">Active</Label>
              <button
                type="button"
                onClick={() => setValue('is_active', !isActive)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
                style={{ backgroundColor: isActive ? '#00D9A3' : '#27272A' }}
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
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editAccount ? 'Save changes' : 'Add account'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Re-exported for use on accounts page balance display
export { formatGHS };
