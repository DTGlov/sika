'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2, ChevronRight, ArrowRight, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useTransactionStore } from '@/stores/transaction-store';
import { useAuthStore } from '@/stores/auth-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountKeypad } from './amount-keypad';
import { CategoryGrid } from './category-grid';
import { ACCOUNT_TYPE_CONFIG } from '@/lib/accounts';
import { formatGHS } from '@/lib/utils';
import { revalidateForEntity } from '@/lib/revalidation';
import type { TransactionType } from '@/types';

type Step = 'amount' | 'category' | 'accounts' | 'details' | 'reconcile';

export function TransactionSheet() {
  const {
    isLogSheetOpen,
    closeLogSheet,
    categories,
    addTransaction,
    updateTransaction,
    editingTransaction,
    reconcileContext,
    dashboardStats,
  } = useTransactionStore();
  const { user, accounts } = useAuthStore();
  const supabase = createClient();

  const defaultAccountId = accounts.find(a => a.is_default)?.id ?? accounts[0]?.id ?? null;

  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('0');
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [txDate, setTxDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  // Reconcile-specific state
  const [reconcileActual, setReconcileActual] = useState('');

  const sikaBalance = reconcileContext?.accountId === accountId
    ? reconcileContext.sikaBalance
    : dashboardStats?.accountBalances[accountId ?? ''] ?? 0;

  const reconcileDiff = (parseFloat(reconcileActual) || 0) - sikaBalance;
  const reconcileIsPositive = reconcileDiff >= 0;

  // Pre-fill form when opening
  useEffect(() => {
    if (!isLogSheetOpen) return;

    if (reconcileContext) {
      setTxType('adjustment');
      setAccountId(reconcileContext.accountId);
      setStep('reconcile');
      setReconcileActual('');
      setNote('');
    } else if (editingTransaction) {
      setAmount(Math.abs(editingTransaction.amount).toString());
      setTxType(editingTransaction.type);
      setCategoryId(editingTransaction.category_id);
      setAccountId(editingTransaction.account_id ?? defaultAccountId);
      setToAccountId(editingTransaction.to_account_id);
      setNote(editingTransaction.note ?? '');
      setTxDate(editingTransaction.transaction_date);
      setStep(editingTransaction.type === 'adjustment' ? 'reconcile' : 'amount');
      if (editingTransaction.type === 'adjustment') {
        // Reverse-compute actual balance for editing: show the stored diff
        setReconcileActual('');
      }
    } else {
      setAccountId(defaultAccountId);
      setStep('amount');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogSheetOpen, editingTransaction, reconcileContext]);

  function handleClose() {
    closeLogSheet();
    setTimeout(() => {
      setStep('amount');
      setAmount('0');
      setTxType('expense');
      setCategoryId(null);
      setAccountId(defaultAccountId);
      setToAccountId(null);
      setNote('');
      setTxDate(format(new Date(), 'yyyy-MM-dd'));
      setReconcileActual('');
    }, 300);
  }

  function handleTypeChange(t: TransactionType) {
    setTxType(t);
    if (t === 'adjustment') {
      setStep('reconcile');
      setReconcileActual('');
    } else {
      setStep('amount');
      if (t === 'transfer') {
        setCategoryId(null);
        const other = accounts.find(a => a.id !== accountId);
        setToAccountId(other?.id ?? null);
      }
    }
  }

  function handleNext() {
    if (txType === 'transfer') {
      setStep('accounts');
    } else {
      setStep('category');
    }
  }

  function handleBack() {
    if (step === 'details') {
      setStep(txType === 'transfer' ? 'accounts' : 'category');
    } else {
      setStep('amount');
    }
  }

  async function handleSave() {
    if (!user || parseFloat(amount) <= 0) return;
    if (txType === 'transfer' && (!accountId || !toAccountId || accountId === toAccountId)) {
      toast.error('Select two different accounts for the transfer');
      return;
    }
    setSaving(true);

    const payload = {
      amount: parseFloat(amount),
      type: txType,
      category_id: (txType === 'transfer' || txType === 'adjustment') ? null : categoryId,
      account_id: accountId,
      to_account_id: txType === 'transfer' ? toAccountId : null,
      note: note || null,
      transaction_date: txDate,
    };

    const selectClause = '*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)';

    if (editingTransaction) {
      const { data, error } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', editingTransaction.id)
        .select(selectClause)
        .single();
      setSaving(false);
      if (error) { toast.error('Failed to update transaction'); return; }
      updateTransaction(data);
      revalidateForEntity('transaction');
      toast.success('Transaction updated');
    } else {
      const { data, error } = await supabase
        .from('transactions')
        .insert({ user_id: user.id, ...payload })
        .select(selectClause)
        .single();
      setSaving(false);
      if (error) { toast.error('Failed to save transaction'); return; }
      addTransaction(data);
      revalidateForEntity('transaction');
      toast.success(txType === 'income' ? 'Income logged!' : txType === 'transfer' ? 'Transfer recorded!' : 'Expense logged!');
    }

    handleClose();
  }

  async function handleReconcileSave() {
    if (!user || !accountId || reconcileActual === '') return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      amount: reconcileDiff, // signed: positive=increase, negative=decrease
      type: 'adjustment' as const,
      category_id: null,
      account_id: accountId,
      to_account_id: null,
      note: note || `Reconciled to ${formatGHS(parseFloat(reconcileActual) || 0)}`,
      transaction_date: format(new Date(), 'yyyy-MM-dd'),
    };

    const selectClause = '*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)';

    if (editingTransaction && editingTransaction.type === 'adjustment') {
      const { data, error } = await supabase
        .from('transactions')
        .update({ amount: reconcileDiff, note: payload.note })
        .eq('id', editingTransaction.id)
        .select(selectClause)
        .single();
      setSaving(false);
      if (error) { toast.error('Failed to update adjustment'); return; }
      updateTransaction(data);
    } else {
      const { data, error } = await supabase
        .from('transactions')
        .insert(payload)
        .select(selectClause)
        .single();
      setSaving(false);
      if (error) { toast.error('Failed to reconcile'); return; }
      addTransaction(data);
    }

    revalidateForEntity('adjustment');
    toast.success(`Reconciled to ${formatGHS(parseFloat(reconcileActual) || 0)}`);
    handleClose();
  }

  const numAmount = parseFloat(amount) || 0;
  const canProceedAmount = numAmount > 0;
  const stepList: Step[] = txType === 'transfer'
    ? ['amount', 'accounts', 'details']
    : txType === 'adjustment'
    ? ['reconcile']
    : ['amount', 'category', 'details'];

  const stepTitles: Record<Step, string> = {
    amount: editingTransaction ? 'Edit amount' : 'How much?',
    category: 'What for?',
    accounts: 'Transfer between',
    details: 'Any details?',
    reconcile: 'Reconcile balance',
  };

  return (
    <Sheet open={isLogSheetOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="bottom"
        className="bg-[#141416] border-t border-[#27272A] rounded-t-3xl px-4 pb-8 pt-4 max-h-[92svh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-[#27272A] rounded-full mx-auto mb-4" />

        <SheetHeader className="mb-4">
          <SheetTitle className="text-[#FAFAFA] text-lg font-bold text-left">
            {stepTitles[step]}
          </SheetTitle>
        </SheetHeader>

        {/* Step progress */}
        <div className="flex gap-1.5 mb-6">
          {stepList.map((s, i) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: stepList.indexOf(step) >= i ? '#00D9A3' : '#27272A' }}
            />
          ))}
        </div>

        {/* STEP: Amount (expense/income) */}
        {step === 'amount' && txType !== 'adjustment' && (
          <div className="space-y-4">
            <AmountKeypad
              value={amount}
              onChange={setAmount}
              type={txType === 'transfer' ? 'transfer' : txType}
              onTypeChange={handleTypeChange}
            />

            {/* Reconcile shortcut */}
            {!editingTransaction && (
              <button
                type="button"
                onClick={() => handleTypeChange('adjustment')}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-[#52525B] hover:text-[#A1A1AA] transition-colors py-1"
              >
                <Scale className="w-3.5 h-3.5" />
                Reconcile an account balance instead
              </button>
            )}

            {/* Account chips — not for transfer */}
            {txType !== 'transfer' && accounts.length > 0 && (
              <div>
                <p className="text-[#71717A] text-xs mb-2">Account</p>
                <div className="flex flex-wrap gap-2">
                  {accounts.map(acc => {
                    const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                    const active = accountId === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setAccountId(acc.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all"
                        style={{
                          borderColor: active ? cfg.color : '#27272A',
                          backgroundColor: active ? cfg.color + '18' : '#1C1C1F',
                          color: active ? cfg.color : '#71717A',
                        }}
                      >
                        <span>{cfg.emoji}</span>
                        <span>{acc.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              onClick={handleNext}
              disabled={!canProceedAmount}
              className="w-full h-13 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold text-base rounded-xl flex items-center justify-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* STEP: Category */}
        {step === 'category' && (
          <div className="space-y-4">
            <CategoryGrid
              categories={categories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              transactionType={txType}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack}
                className="flex-1 h-12 border-[#27272A] text-[#A1A1AA] hover:bg-[#1C1C1F] rounded-xl">
                Back
              </Button>
              <Button onClick={() => setStep('details')}
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl">
                Next
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Accounts (transfer) */}
        {step === 'accounts' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-[#A1A1AA] text-sm">From</p>
              <div className="flex flex-wrap gap-2">
                {accounts.map(acc => {
                  const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                  const active = accountId === acc.id;
                  return (
                    <button key={acc.id} type="button" onClick={() => setAccountId(acc.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
                      style={{
                        borderColor: active ? cfg.color : '#27272A',
                        backgroundColor: active ? cfg.color + '18' : '#1C1C1F',
                        color: active ? cfg.color : '#71717A',
                      }}>
                      <span>{cfg.emoji}</span><span>{acc.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[#52525B]">
              <div className="flex-1 h-px bg-[#27272A]" />
              <ArrowRight className="w-4 h-4" />
              <div className="flex-1 h-px bg-[#27272A]" />
            </div>
            <div className="space-y-2">
              <p className="text-[#A1A1AA] text-sm">To</p>
              <div className="flex flex-wrap gap-2">
                {accounts.filter(a => a.id !== accountId).map(acc => {
                  const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                  const active = toAccountId === acc.id;
                  return (
                    <button key={acc.id} type="button" onClick={() => setToAccountId(acc.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
                      style={{
                        borderColor: active ? cfg.color : '#27272A',
                        backgroundColor: active ? cfg.color + '18' : '#1C1C1F',
                        color: active ? cfg.color : '#71717A',
                      }}>
                      <span>{cfg.emoji}</span><span>{acc.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack}
                className="flex-1 h-12 border-[#27272A] text-[#A1A1AA] hover:bg-[#1C1C1F] rounded-xl">
                Back
              </Button>
              <Button onClick={() => setStep('details')} disabled={!accountId || !toAccountId}
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl">
                Next
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Reconcile */}
        {step === 'reconcile' && (
          <div className="space-y-4">
            {/* Account selector */}
            {!reconcileContext && (
              <div>
                <p className="text-[#A1A1AA] text-sm mb-2">Account</p>
                <div className="flex flex-wrap gap-2">
                  {accounts.map(acc => {
                    const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                    const active = accountId === acc.id;
                    return (
                      <button key={acc.id} type="button" onClick={() => setAccountId(acc.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
                        style={{
                          borderColor: active ? cfg.color : '#27272A',
                          backgroundColor: active ? cfg.color + '18' : '#1C1C1F',
                          color: active ? cfg.color : '#71717A',
                        }}>
                        <span>{cfg.emoji}</span><span>{acc.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sika's current balance */}
            {accountId && (
              <div className="bg-[#1C1C1F] border border-[#27272A] rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-[#71717A] text-sm">Sika shows</span>
                <span className="text-[#FAFAFA] font-semibold tabular-nums">{formatGHS(sikaBalance)}</span>
              </div>
            )}

            {/* Actual balance input */}
            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">Actual current balance</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] font-mono text-sm">₵</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={reconcileActual}
                  onChange={(e) => setReconcileActual(e.target.value)}
                  className="h-12 pl-7 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] focus-visible:ring-[#00D9A3] amount"
                />
              </div>
            </div>

            {/* Diff preview */}
            {reconcileActual !== '' && (
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: reconcileIsPositive ? '#00D9A318' : '#F43F5E18' }}
              >
                <span className="text-[#A1A1AA] text-sm">Adjustment</span>
                <span
                  className="font-semibold tabular-nums text-sm"
                  style={{ color: reconcileIsPositive ? '#00D9A3' : '#F43F5E' }}
                >
                  {reconcileIsPositive ? '+' : ''}{formatGHS(reconcileDiff)}
                </span>
              </div>
            )}

            {/* Note */}
            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">Note (optional)</label>
              <Input
                placeholder="e.g. Bank statement reconciliation"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-11 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#52525B] focus-visible:ring-[#00D9A3]"
              />
            </div>

            <div className="flex gap-2">
              {!reconcileContext && (
                <Button variant="outline" onClick={() => handleTypeChange('expense')}
                  className="flex-1 h-12 border-[#27272A] text-[#A1A1AA] hover:bg-[#1C1C1F] rounded-xl">
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleReconcileSave}
                disabled={saving || reconcileActual === '' || !accountId || reconcileDiff === 0}
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : reconcileActual
                  ? `Reconcile to ${formatGHS(parseFloat(reconcileActual) || 0)}`
                  : 'Reconcile'}
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Details */}
        {step === 'details' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">Note (optional)</label>
              <Input
                placeholder="What was this for?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-12 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#71717A] focus-visible:ring-[#00D9A3]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">Date</label>
              <Input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="h-12 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] focus-visible:ring-[#00D9A3]"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack}
                className="flex-1 h-12 border-[#27272A] text-[#A1A1AA] hover:bg-[#1C1C1F] rounded-xl">
                Back
              </Button>
              <Button onClick={handleSave} disabled={saving || !canProceedAmount}
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTransaction ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
