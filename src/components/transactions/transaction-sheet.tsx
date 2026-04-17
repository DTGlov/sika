'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useTransactionStore } from '@/stores/transaction-store';
import { useAuthStore } from '@/stores/auth-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountKeypad } from './amount-keypad';
import { CategoryGrid } from './category-grid';
import type { TransactionType } from '@/types';

type Step = 'amount' | 'category' | 'details';

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
  const { user } = useAuthStore();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('0');
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [txDate, setTxDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  // Pre-fill form when editing an existing transaction
  useEffect(() => {
    if (isLogSheetOpen && editingTransaction) {
      setAmount(editingTransaction.amount.toString());
      setTxType(editingTransaction.type);
      setCategoryId(editingTransaction.category_id);
      setNote(editingTransaction.note ?? '');
      setTxDate(editingTransaction.transaction_date);
      setStep('amount');
    }
  }, [isLogSheetOpen, editingTransaction]);

  function handleClose() {
    closeLogSheet();
    setTimeout(() => {
      setStep('amount');
      setAmount('0');
      setTxType('expense');
      setCategoryId(null);
      setNote('');
      setTxDate(format(new Date(), 'yyyy-MM-dd'));
    }, 300);
  }

  async function handleSave() {
    if (!user || parseFloat(amount) <= 0) return;
    setSaving(true);

    if (editingTransaction) {
      const { data, error } = await supabase
        .from('transactions')
        .update({
          amount: parseFloat(amount),
          type: txType,
          category_id: categoryId,
          note: note || null,
          transaction_date: txDate,
        })
        .eq('id', editingTransaction.id)
        .select('*, category:categories(*, bucket:budget_buckets(*))')
        .single();

      setSaving(false);
      if (error) { toast.error('Failed to update transaction'); return; }
      updateTransaction(data);
      bumpMutation();
      toast.success('Transaction updated');
    } else {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          amount: parseFloat(amount),
          type: txType,
          category_id: categoryId,
          note: note || null,
          transaction_date: txDate,
        })
        .select('*, category:categories(*, bucket:budget_buckets(*))')
        .single();

      setSaving(false);
      if (error) { toast.error('Failed to save transaction'); return; }
      addTransaction(data);
      bumpMutation();
      toast.success(`${txType === 'income' ? 'Income' : 'Expense'} logged!`);
    }

    handleClose();
  }

  const numAmount = parseFloat(amount) || 0;
  const canProceedAmount = numAmount > 0;

  const stepTitles: Record<Step, string> = {
    amount: editingTransaction ? 'Edit amount' : 'How much?',
    category: 'What for?',
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

        <div className="flex gap-1.5 mb-6">
          {(['amount', 'category', 'details'] as Step[]).map((s, i) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: (['amount', 'category', 'details'] as Step[]).indexOf(step) >= i ? '#00D9A3' : '#27272A' }}
            />
          ))}
        </div>

        {step === 'amount' && (
          <div className="space-y-6">
            <AmountKeypad
              value={amount}
              onChange={setAmount}
              type={txType}
              onTypeChange={setTxType}
            />
            <Button
              onClick={() => setStep('category')}
              disabled={!canProceedAmount}
              className="w-full h-13 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold text-base rounded-xl flex items-center justify-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

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
                onClick={() => setStep('amount')}
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
                onClick={() => setStep('category')}
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
