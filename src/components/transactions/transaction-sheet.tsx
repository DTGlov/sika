'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2, ChevronRight, ArrowRight } from 'lucide-react';
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
import type { TransactionType } from '@/types';

type Step = 'amount' | 'category' | 'accounts' | 'details';

export function TransactionSheet() {
  const {
    isLogSheetOpen,
    closeLogSheet,
    categories,
    addTransaction,
    updateTransaction,
    editingTransaction,
    bumpMutation,
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

  // Pre-fill form when editing
  useEffect(() => {
    if (isLogSheetOpen && editingTransaction) {
      setAmount(editingTransaction.amount.toString());
      setTxType(editingTransaction.type);
      setCategoryId(editingTransaction.category_id);
      setAccountId(editingTransaction.account_id ?? defaultAccountId);
      setToAccountId(editingTransaction.to_account_id);
      setNote(editingTransaction.note ?? '');
      setTxDate(editingTransaction.transaction_date);
      setStep('amount');
    } else if (isLogSheetOpen && !editingTransaction) {
      setAccountId(defaultAccountId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogSheetOpen, editingTransaction]);

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
    }, 300);
  }

  function handleTypeChange(t: TransactionType) {
    setTxType(t);
    if (t === 'transfer') {
      setCategoryId(null);
      // pre-set to_account to first account that's not accountId
      const other = accounts.find(a => a.id !== accountId);
      setToAccountId(other?.id ?? null);
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
      category_id: txType === 'transfer' ? null : categoryId,
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
      bumpMutation();
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
      bumpMutation();
      toast.success(txType === 'income' ? 'Income logged!' : txType === 'transfer' ? 'Transfer recorded!' : 'Expense logged!');
    }

    handleClose();
  }

  const numAmount = parseFloat(amount) || 0;
  const canProceedAmount = numAmount > 0;
  const stepList: Step[] = txType === 'transfer'
    ? ['amount', 'accounts', 'details']
    : ['amount', 'category', 'details'];

  const stepTitles: Record<Step, string> = {
    amount: editingTransaction ? 'Edit amount' : 'How much?',
    category: 'What for?',
    accounts: 'Transfer between',
    details: 'Any details?',
  };

  return (
    <Sheet open={isLogSheetOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="bottom"
        className="bg-[#141416] border-t border-[#27272A] rounded-t-3xl px-4 pb-8 pt-4 max-h-[92svh] overflow-y-auto md:side-right"
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

        {/* STEP: Amount */}
        {step === 'amount' && (
          <div className="space-y-4">
            <AmountKeypad
              value={amount}
              onChange={setAmount}
              type={txType}
              onTypeChange={handleTypeChange}
            />

            {/* Account chips — not shown for transfer (handled in accounts step) */}
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

        {/* STEP: Category (expense/income) */}
        {step === 'category' && (
          <div className="space-y-4">
            <CategoryGrid
              categories={categories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              transactionType={txType}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 h-12 border-[#27272A] text-[#A1A1AA] hover:bg-[#1C1C1F] rounded-xl"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep('details')}
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
              >
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
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setAccountId(acc.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
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
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setToAccountId(acc.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
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

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 h-12 border-[#27272A] text-[#A1A1AA] hover:bg-[#1C1C1F] rounded-xl"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep('details')}
                disabled={!accountId || !toAccountId}
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
              >
                Next
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
                className="h-12 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#71717A] focus-visible:ring-[#00D9A3] focus-visible:border-[#00D9A3]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">Date</label>
              <Input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="h-12 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] focus-visible:ring-[#00D9A3] focus-visible:border-[#00D9A3]"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1 h-12 border-[#27272A] text-[#A1A1AA] hover:bg-[#1C1C1F] rounded-xl"
              >
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !canProceedAmount}
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTransaction ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
