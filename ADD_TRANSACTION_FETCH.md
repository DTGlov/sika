═══════════════════════════════════════════════════════════
FILE: src/components/transactions/add-transaction-fab.tsx
═══════════════════════════════════════════════════════════
'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useTransactionStore } from '@/stores/transaction-store';
import { useHaptics } from '@/hooks/use-haptics';

export function AddTransactionFab() {
  const { openLogSheet } = useTransactionStore();
  const { light } = useHaptics();

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.6 }}
      whileTap={{ scale: 0.92 }}
      onClick={() => { light(); openLogSheet(); }}
      aria-label="Log a transaction"
      // Mobile: centered, lifted ~112px + safe-area above the bottom nav
      // Desktop: fixed bottom-right corner, no bottom nav
      className="fixed z-40 w-14 h-14 rounded-full bg-[#D4A017] text-[#0E1A2E] shadow-lg flex items-center justify-center
        bottom-[calc(5.4375rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2
        md:bottom-6 md:left-auto md:right-6 md:translate-x-0"
    >
      <motion.div
        animate={{ boxShadow: ['0 0 0 0 rgba(0,217,163,0.4)', '0 0 0 12px rgba(0,217,163,0)'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        className="absolute inset-0 rounded-full"
      />
      <Plus className="w-6 h-6 relative z-10" strokeWidth={2.5} />
    </motion.button>
  );
}


═══════════════════════════════════════════════════════════
FILE: src/components/transactions/transaction-sheet.tsx
═══════════════════════════════════════════════════════════
'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronRight, ArrowRight, Scale, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useHaptics } from '@/hooks/use-haptics';
import { hapticToast } from '@/lib/toast-with-haptic';
import { createClient } from '@/lib/supabase/client';
import { useTransactionStore } from '@/stores/transaction-store';
import { useAuthStore } from '@/stores/auth-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountKeypad } from './amount-keypad';
import { CategoryGrid } from './category-grid';
import { IncomeCategoryPicker, INCOME_PRESETS } from './income-category-picker';
import type { IncomePresetKey } from './income-category-picker';
import { ACCOUNT_TYPE_CONFIG } from '@/lib/accounts';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';
import { revalidateForEntity } from '@/lib/revalidation';
import { HintCard } from '@/components/hint-card';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { NextCycleModal } from '@/components/goals/next-cycle-modal';
import { InsufficientBalanceSheet } from './insufficient-balance-sheet';
import { analytics } from '@/lib/analytics/identify';
import { fetchGoals, fetchGoalAmounts } from '@/lib/goals';
import { updateLoggingStreak, loggingMilestoneMessage } from '@/lib/streaks';
import { awardMomentum } from '@/lib/momentum';
import { checkAndUnlockBadges } from '@/lib/badges';
import { MomentumFloatContainer, TierUpModal } from '@/components/momentum-float';
import type { TransactionType } from '@/types';
import type { Goal } from '@/types/goal';
import type { TierConfig } from '@/types/momentum';

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
    openReconcileSheet,
  } = useTransactionStore();
  const { user, accounts, setStreaks, setMomentum, enqueueBadgeCelebrations } = useAuthStore();
  const { format: formatMoney, symbol } = useCurrency();
  const { medium: hapticMedium } = useHaptics();
  const [momentumFloats, setMomentumFloats] = useState<Array<{ id: string; points: number }>>([]);
  const [tierUpTier, setTierUpTier] = useState<TierConfig | null>(null);
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

  // Income category picker state
  const [incomeCategoryKey, setIncomeCategoryKey] = useState<IncomePresetKey | null>(null);
  const [incomeCustomEmoji, setIncomeCustomEmoji] = useState('');
  const [incomeCustomLabel, setIncomeCustomLabel] = useState('');

  // Target goal payment
  const [sinkingFundGoals, setSinkingFundGoals] = useState<Goal[]>([]);
  const [paidFromGoalId, setPaidFromGoalId] = useState<string | null>(null);
  const [sfExpanded, setSfExpanded] = useState(false);
  const [sfHintDismissed, setSfHintDismissed] = useState(false);
  const [sfBalance, setSfBalance] = useState<number | null>(null);
  const [sfBalanceLoading, setSfBalanceLoading] = useState(false);
  const [nextCycleGoal, setNextCycleGoal] = useState<Goal | null>(null);

  // Insufficient balance guard
  const [insufficientOpen, setInsufficientOpen] = useState(false);

  // Reconcile-specific state
  const [reconcileActual, setReconcileActual] = useState('');

  const sikaBalance = reconcileContext?.accountId === accountId
    ? reconcileContext.sikaBalance
    : dashboardStats?.accountBalances[accountId ?? ''] ?? 0;

  const reconcileDiff = (parseFloat(reconcileActual) || 0) - sikaBalance;
  const reconcileIsPositive = reconcileDiff >= 0;

  // Fetch active target-type goals when sheet opens
  useEffect(() => {
    if (!isLogSheetOpen || !user) return;
    fetchGoals(supabase, user.id).then(goals => {
      setSinkingFundGoals(goals.filter(g => g.goal_type === 'target' && !g.completed_at && !g.is_archived));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogSheetOpen, user]);

  // Fetch effective balance whenever the selected target goal changes
  useEffect(() => {
    if (!paidFromGoalId) { setSfBalance(null); return; }
    setSfBalanceLoading(true);
    fetchGoalAmounts(supabase, paidFromGoalId).then(({ net }) => {
      setSfBalance(net);
      setSfBalanceLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidFromGoalId]);

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
      setPaidFromGoalId(null);
      setSfExpanded(false);
      setSfBalance(null);
      setIncomeCategoryKey(null);
      setIncomeCustomEmoji('');
      setIncomeCustomLabel('');
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

  function getFromAccountBalance(): number {
    return dashboardStats?.accountBalances[accountId ?? ''] ?? 0;
  }

  function handleNext() {
    if (txType === 'transfer') {
      setStep('accounts');
    } else if (txType === 'expense') {
      const balance = getFromAccountBalance();
      if (balance <= 0 || parseFloat(amount) > balance) {
        setInsufficientOpen(true);
        return;
      }
      setStep('category');
    } else {
      setStep('category');
    }
  }

  function handleInsufficientTopUp() {
    setInsufficientOpen(false);
    handleTypeChange('income');
  }

  function handleInsufficientChangeAccount() {
    setInsufficientOpen(false);
  }

  function handleInsufficientReconcile() {
    const balance = getFromAccountBalance();
    openReconcileSheet({ accountId: accountId!, sikaBalance: balance });
    setInsufficientOpen(false);
  }

  function handleBack() {
    if (step === 'details') {
      setStep(txType === 'transfer' ? 'accounts' : 'category');
    } else {
      setStep('amount');
    }
  }

  async function handleMomentumAward(eventType: Parameters<typeof awardMomentum>[2]) {
    if (!user) return;
    const result = await awardMomentum(supabase, user.id, eventType);
    setMomentum(result.momentum);
    const floatId = `${Date.now()}-${Math.random()}`;
    setMomentumFloats(prev => [...prev, { id: floatId, points: result.points_awarded }]);
    if (result.tier_changed) setTierUpTier(result.new_tier);
  }

  function resolveIncomeCategory(): { effectiveCategoryId: string | null; notePrefix: string } {
    if (!incomeCategoryKey) return { effectiveCategoryId: null, notePrefix: '' };
    if (incomeCategoryKey === 'other') {
      const prefix = [incomeCustomEmoji, incomeCustomLabel].filter(Boolean).join(' ');
      return { effectiveCategoryId: null, notePrefix: prefix ? `${prefix} — ` : '' };
    }
    const preset = INCOME_PRESETS.find(p => p.key === incomeCategoryKey);
    const matched = preset
      ? categories.find(c =>
          c.name.toLowerCase() === preset.label.toLowerCase() &&
          (c.category_type === 'income' || c.category_type === 'adjustment')
        )
      : null;
    return { effectiveCategoryId: matched?.id ?? null, notePrefix: '' };
  }

  async function handleSave() {
    if (!user || parseFloat(amount) <= 0) return;
    if (txType === 'transfer' && (!accountId || !toAccountId || accountId === toAccountId)) {
      hapticToast.error('Select two different accounts for the transfer');
      return;
    }
    setSaving(true);

    let effectiveCategoryId = categoryId;
    let effectiveNote = note;
    if (txType === 'income') {
      const { effectiveCategoryId: incCatId, notePrefix } = resolveIncomeCategory();
      effectiveCategoryId = incCatId;
      effectiveNote = notePrefix + note;
    }

    const payload = {
      amount: parseFloat(amount),
      type: txType,
      category_id: (txType === 'transfer' || txType === 'adjustment') ? null : effectiveCategoryId,
      account_id: accountId,
      to_account_id: txType === 'transfer' ? toAccountId : null,
      note: effectiveNote || null,
      transaction_date: txDate,
      paid_from_goal_id: txType === 'expense' ? paidFromGoalId : null,
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
      if (error) { hapticToast.error('Failed to update transaction'); return; }
      updateTransaction(data);
      revalidateForEntity('transaction');
      hapticMedium();
      toast.success('Transaction updated');
    } else {
      const { data, error } = await supabase
        .from('transactions')
        .insert({ user_id: user.id, ...payload })
        .select(selectClause)
        .single();
      setSaving(false);
      if (error) { hapticToast.error('Failed to save transaction'); return; }
      hapticMedium();
      addTransaction(data);
      const cat = categories.find(c => c.id === effectiveCategoryId);
      analytics.transactionLogged({
        type: txType,
        bucket: cat?.bucket?.name as string | undefined,
      });

      // Update logging streak for user-initiated transactions
      updateLoggingStreak(supabase, user.id).then(result => {
        if (result.streaks) setStreaks(result.streaks);
        if (result.milestone_hit) {
          toast.success(loggingMilestoneMessage(result.milestone_hit), { duration: 5000 });
          if (result.milestone_hit === 7) {
            handleMomentumAward('logging_streak_7_days');
          }
        } else if (result.freeze_earned) {
          toast(`❄️ Streak freeze earned! ${result.streaks.freezes_banked} banked.`);
        }
        checkAndUnlockBadges(supabase, user.id, 'streak_updated').then(({ newlyUnlocked }) => {
          if (newlyUnlocked.length > 0) enqueueBadgeCelebrations(newlyUnlocked);
        });
      });
      handleMomentumAward('transaction_logged');
      checkAndUnlockBadges(supabase, user.id, 'transaction_logged').then(({ newlyUnlocked }) => {
        if (newlyUnlocked.length > 0) enqueueBadgeCelebrations(newlyUnlocked);
      });

      if (paidFromGoalId && txType === 'expense') {
        revalidateForEntity('sinking_fund_payment');
        const goal = sinkingFundGoals.find(g => g.id === paidFromGoalId);
        if (goal && goal.target_amount != null && !goal.completed_at) {
          const { contributions } = await fetchGoalAmounts(supabase, goal.id);
          const paymentsRes = await supabase
            .from('transactions')
            .select('amount')
            .eq('paid_from_goal_id', goal.id)
            .eq('type', 'expense');
          const totalPaid = (paymentsRes.data ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
          if (contributions >= goal.target_amount && totalPaid >= goal.target_amount) {
            await supabase
              .from('goals')
              .update({ completed_at: new Date().toISOString() })
              .eq('id', goal.id);
            toast.success(`${goal.name} is complete! 🎉`);
            setNextCycleGoal({ ...goal, completed_at: new Date().toISOString() });
            handleMomentumAward('goal_completed');
            checkAndUnlockBadges(supabase, user.id, 'goal_completed').then(({ newlyUnlocked }) => {
              if (newlyUnlocked.length > 0) enqueueBadgeCelebrations(newlyUnlocked);
            });
          } else {
            toast.success('Expense logged');
          }
        } else {
          toast.success('Expense logged');
        }
      } else {
        revalidateForEntity('transaction');
        toast.success(txType === 'income' ? 'Income logged!' : txType === 'transfer' ? 'Transfer recorded!' : 'Expense logged!');
      }
    }

    handleClose();
  }

  async function handleReconcileSave() {
    if (!user || !accountId || reconcileActual === '') return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      amount: reconcileDiff,
      type: 'adjustment' as const,
      category_id: null,
      account_id: accountId,
      to_account_id: null,
      note: note || `Reconciled to ${formatMoney(parseFloat(reconcileActual) || 0)}`,
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
      if (error) { hapticToast.error('Failed to update adjustment'); return; }
      updateTransaction(data);
    } else {
      const { data, error } = await supabase
        .from('transactions')
        .insert(payload)
        .select(selectClause)
        .single();
      setSaving(false);
      if (error) { hapticToast.error('Failed to reconcile'); return; }
      addTransaction(data);
    }

    revalidateForEntity('adjustment');
    toast.success(`Reconciled to ${formatMoney(parseFloat(reconcileActual) || 0)}`);
    handleMomentumAward('account_reconciled');
    checkAndUnlockBadges(supabase, user.id, 'account_reconciled').then(({ newlyUnlocked }) => {
      if (newlyUnlocked.length > 0) enqueueBadgeCelebrations(newlyUnlocked);
    });
    handleClose();
  }

  const numAmount = parseFloat(amount) || 0;
  const canProceedAmount = numAmount > 0;

  const sfOverpayment = paidFromGoalId && sfBalance !== null && numAmount > sfBalance;
  const sfAfterBalance = sfBalance !== null ? sfBalance - numAmount : null;
  const sfWillFulfill = sfAfterBalance !== null && sfAfterBalance <= 0 && numAmount > 0 && sfBalance !== null && sfBalance > 0;
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

  const incomeCategoryValid = incomeCategoryKey !== null &&
    (incomeCategoryKey !== 'other' || incomeCustomLabel.trim().length > 0);

  return (
    <>
    <Sheet open={isLogSheetOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="bottom"
        className="bg-card border-t border-border rounded-t-3xl px-4 pb-8 pt-4 max-h-[92svh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />

        <SheetHeader className="mb-4">
          <SheetTitle className="text-foreground text-lg font-bold text-left">
            {stepTitles[step]}
          </SheetTitle>
        </SheetHeader>

        {/* Step progress */}
        <div className="flex gap-1.5 mb-6">
          {stepList.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                stepList.indexOf(step) >= i ? 'bg-[#D4A017]' : 'bg-muted'
              )}
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
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
              >
                <Scale className="w-3.5 h-3.5" />
                Reconcile an account balance instead
              </button>
            )}

            {/* Account chips — not for transfer */}
            {txType !== 'transfer' && accounts.length > 0 && (
              <div>
                <p className="text-muted-foreground text-xs mb-2">Account</p>
                <div className="flex flex-wrap gap-2">
                  {accounts.map(acc => {
                    const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                    const active = accountId === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setAccountId(acc.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                          !active && 'border-border bg-muted text-muted-foreground'
                        )}
                        style={active ? { borderColor: cfg.color, backgroundColor: cfg.color + '18', color: cfg.color } : undefined}
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
              className="w-full h-13 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold text-base rounded-xl flex items-center justify-center gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* STEP: Category */}
        {step === 'category' && (
          <div className="space-y-4">
            {txType === 'income' ? (
              <IncomeCategoryPicker
                selectedKey={incomeCategoryKey}
                onSelect={setIncomeCategoryKey}
                customEmoji={incomeCustomEmoji}
                customLabel={incomeCustomLabel}
                onCustomChange={(e, l) => { setIncomeCustomEmoji(e); setIncomeCustomLabel(l); }}
              />
            ) : (
              <CategoryGrid
                categories={categories}
                selectedId={categoryId}
                onSelect={setCategoryId}
                transactionType={txType}
              />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack}
                className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted rounded-xl">
                Back
              </Button>
              <Button
                onClick={() => setStep('details')}
                disabled={txType === 'income' && !incomeCategoryValid}
                className="flex-1 h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed">
                Next
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Accounts (transfer) */}
        {step === 'accounts' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">From</p>
              <div className="flex flex-wrap gap-2">
                {accounts.map(acc => {
                  const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                  const active = accountId === acc.id;
                  return (
                    <button key={acc.id} type="button" onClick={() => setAccountId(acc.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                        !active && 'border-border bg-muted text-muted-foreground'
                      )}
                      style={active ? { borderColor: cfg.color, backgroundColor: cfg.color + '18', color: cfg.color } : undefined}>
                      <span>{cfg.emoji}</span><span>{acc.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground/60">
              <div className="flex-1 h-px bg-border" />
              <ArrowRight className="w-4 h-4" />
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">To</p>
              <div className="flex flex-wrap gap-2">
                {accounts.filter(a => a.id !== accountId).map(acc => {
                  const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                  const active = toAccountId === acc.id;
                  return (
                    <button key={acc.id} type="button" onClick={() => setToAccountId(acc.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                        !active && 'border-border bg-muted text-muted-foreground'
                      )}
                      style={active ? { borderColor: cfg.color, backgroundColor: cfg.color + '18', color: cfg.color } : undefined}>
                      <span>{cfg.emoji}</span><span>{acc.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack}
                className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted rounded-xl">
                Back
              </Button>
              <Button
                onClick={() => {
                  const balance = getFromAccountBalance();
                  if (balance <= 0 || parseFloat(amount) > balance) {
                    setInsufficientOpen(true);
                    return;
                  }
                  setStep('details');
                }}
                disabled={!accountId || !toAccountId}
                className="flex-1 h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed">
                Next
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Reconcile */}
        {step === 'reconcile' && (
          <div className="space-y-4">
            <HintCard
              hintId="transaction_sheet_reconcile"
              title="What is Reconcile?"
              body="Use Reconcile when Sika's account balance doesn't match your real account. Enter the actual balance and Sika logs an adjustment to match reality. Doesn't affect your buckets."
              variant="inline"
            />
            {/* Account selector */}
            {!reconcileContext && (
              <div>
                <p className="text-muted-foreground text-sm mb-2">Account</p>
                <div className="flex flex-wrap gap-2">
                  {accounts.map(acc => {
                    const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
                    const active = accountId === acc.id;
                    return (
                      <button key={acc.id} type="button" onClick={() => setAccountId(acc.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                          !active && 'border-border bg-muted text-muted-foreground'
                        )}
                        style={active ? { borderColor: cfg.color, backgroundColor: cfg.color + '18', color: cfg.color } : undefined}>
                        <span>{cfg.emoji}</span><span>{acc.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sika's current balance */}
            {accountId && (
              <div className="bg-muted border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Sika shows</span>
                <span className="text-foreground font-semibold tabular-nums">{formatMoney(sikaBalance)}</span>
              </div>
            )}

            {/* Actual balance input */}
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">Actual current balance ({symbol})</label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={reconcileActual}
                onChange={(e) => setReconcileActual(e.target.value)}
                className="h-12 px-3 bg-muted border-border text-foreground focus-visible:ring-[#D4A017] amount"
              />
            </div>

            {/* Diff preview */}
            {reconcileActual !== '' && (
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: reconcileIsPositive ? '#00D9A318' : '#F43F5E18' }}
              >
                <span className="text-muted-foreground text-sm">Adjustment</span>
                <span
                  className="font-semibold tabular-nums text-sm"
                  style={{ color: reconcileIsPositive ? '#00D9A3' : '#F43F5E' }}
                >
                  {reconcileIsPositive ? '+' : ''}{formatMoney(reconcileDiff)}
                </span>
              </div>
            )}

            {/* Note */}
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">Note (optional)</label>
              <Input
                placeholder="e.g. Bank statement reconciliation"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-11 bg-muted border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-[#D4A017]"
              />
            </div>

            <div className="flex gap-2">
              {!reconcileContext && (
                <Button variant="outline" onClick={() => handleTypeChange('expense')}
                  className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted rounded-xl">
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleReconcileSave}
                disabled={saving || reconcileActual === '' || !accountId || reconcileDiff === 0}
                className="flex-1 h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed"
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : reconcileActual
                  ? `Reconcile to ${formatMoney(parseFloat(reconcileActual) || 0)}`
                  : 'Reconcile'}
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Details */}
        {step === 'details' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">Note (optional)</label>
              <Input
                placeholder="What was this for?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-[#D4A017]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">Date</label>
              <Input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="h-12 bg-muted border-border text-foreground focus-visible:ring-[#D4A017]"
              />
            </div>

            {/* Target goal payment — only for expense with active target-type goals */}
            {txType === 'expense' && sinkingFundGoals.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSfExpanded(v => !v);
                      setSfHintDismissed(false);
                    }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="text-muted-foreground/60">{sfExpanded ? '▾' : '▸'}</span>
                    Paid from a target?
                  </button>
                  <Popover>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Why isn't my perpetual goal here?"
                          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      }
                    />
                    <PopoverContent side="bottom" align="start" sideOffset={8} collisionPadding={16}>
                      Perpetual goals (like Life Savings) are designed to be untouchable and don&apos;t appear here. For real emergencies, log as a normal expense.
                    </PopoverContent>
                  </Popover>
                </div>

                <AnimatePresence>
                  {sfExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-2 space-y-2 overflow-hidden"
                    >
                      {!sfHintDismissed && (
                        <HintCard
                          hintId="target_intro"
                          title="What's a target?"
                          body="For big expenses you're saving toward — trips, electronics, rent. Save monthly toward the target amount. When you actually pay, flag it here so Sika doesn't double-count — the saving already accounted for it."
                          cta="Got it"
                        />
                      )}
                      <select
                        value={paidFromGoalId ?? ''}
                        onChange={e => { setPaidFromGoalId(e.target.value || null); setSfBalance(null); }}
                        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-base text-foreground focus:outline-none focus:border-[#D4A017] transition-colors"
                      >
                        <option value="">— Not from a target</option>
                        {sinkingFundGoals.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>

                      {/* Perpetual goals note */}
                      <div className="border-t border-border mt-2 pt-2">
                        <p className="text-xs text-muted-foreground leading-relaxed px-1">
                          Perpetual goals (like Life Savings) don&apos;t appear here — they&apos;re protected.
                        </p>
                      </div>

                      {/* Live balance preview */}
                      {paidFromGoalId && !sfBalanceLoading && sfBalance !== null && (
                        sfOverpayment ? (
                          <div className="rounded-xl bg-[#F43F5E]/10 border border-[#F43F5E]/30 px-3 py-2.5 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-[#F43F5E] shrink-0" />
                              <p className="text-[#F43F5E] text-xs font-medium">
                                Not enough in this target yet
                              </p>
                            </div>
                            <p className="text-muted-foreground text-xs leading-relaxed">
                              Goal has{' '}
                              <span className="text-foreground font-medium">{formatMoney(sfBalance)}</span>{' '}
                              saved. You can either:
                            </p>
                            <ul className="text-muted-foreground text-xs space-y-0.5 ml-2">
                              <li>• Reduce this payment to {formatMoney(sfBalance)} or less</li>
                              <li>• Contribute {formatMoney(numAmount - sfBalance)} more to the goal first</li>
                              <li>• Uncheck &ldquo;Paid from target&rdquo; and log as a regular expense</li>
                            </ul>
                          </div>
                        ) : sfBalance === 0 ? (
                          <div className="rounded-xl bg-[#F43F5E]/10 border border-[#F43F5E]/30 px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-[#F43F5E] shrink-0" />
                              <p className="text-[#F43F5E] text-xs font-medium">
                                This goal has no saved amount yet — contribute first.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-muted border border-border px-3 py-2.5 space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Goal balance</span>
                              <span className="text-foreground tabular-nums">{formatMoney(sfBalance)}</span>
                            </div>
                            {numAmount > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">After this payment</span>
                                <span className={cn('tabular-nums font-medium', sfWillFulfill ? 'text-[#D4A017]' : 'text-foreground')}>
                                  {sfWillFulfill
                                    ? `${symbol}0 — goal will be fulfilled`
                                    : formatMoney(Math.max(0, sfAfterBalance ?? 0)) + ' remaining'}
                                </span>
                              </div>
                            )}
                            {!sfWillFulfill && (
                              <p className="text-muted-foreground text-xs pt-0.5">
                                This expense won't count against your buckets.
                              </p>
                            )}
                          </div>
                        )
                      )}

                      {paidFromGoalId && sfBalanceLoading && (
                        <p className="text-muted-foreground/60 text-xs">Checking goal balance…</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack}
                className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted rounded-xl">
                Back
              </Button>
              <Button onClick={handleSave} disabled={saving || !canProceedAmount || !!sfOverpayment}
                className="flex-1 h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTransaction ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>

    <InsufficientBalanceSheet
      open={insufficientOpen}
      onClose={() => setInsufficientOpen(false)}
      accountName={accounts.find(a => a.id === accountId)?.name ?? 'Account'}
      accountBalance={getFromAccountBalance()}
      amountRequested={parseFloat(amount) || 0}
      onTopUp={handleInsufficientTopUp}
      onChangeAccount={handleInsufficientChangeAccount}
      onReconcile={handleInsufficientReconcile}
    />

    {nextCycleGoal && (
      <NextCycleModal
        open={!!nextCycleGoal}
        onClose={() => setNextCycleGoal(null)}
        completedGoal={nextCycleGoal}
      />
    )}

    <MomentumFloatContainer
      floats={momentumFloats}
      onDone={id => setMomentumFloats(prev => prev.filter(f => f.id !== id))}
    />

    {tierUpTier && (
      <TierUpModal
        open={!!tierUpTier}
        onClose={() => setTierUpTier(null)}
        tier={tierUpTier}
      />
    )}
  </>
  );
}


═══════════════════════════════════════════════════════════
FILE: src/components/transactions/amount-keypad.tsx
═══════════════════════════════════════════════════════════
'use client';

import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CURRENCY_SYMBOL } from '@/lib/constants';

interface AmountKeypadProps {
  value: string;
  onChange: (value: string) => void;
  type: 'expense' | 'income' | 'transfer';
  onTypeChange: (type: 'expense' | 'income' | 'transfer') => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export function AmountKeypad({ value, onChange, type, onTypeChange }: AmountKeypadProps) {
  function press(key: string) {
    if (key === '⌫') {
      onChange(value.slice(0, -1) || '0');
      return;
    }
    if (key === '.' && value.includes('.')) return;
    const parts = value.split('.');
    if (parts[1]?.length >= 2) return;

    const next = value === '0' && key !== '.' ? key : value + key;
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-3xl font-mono text-muted-foreground">{CURRENCY_SYMBOL}</span>
          <span
            className={cn(
              'amount text-5xl font-bold tracking-tight',
              type === 'income' ? 'text-[#D4A017]' : 'text-foreground'
            )}
          >
            {value || '0'}
          </span>
        </div>
      </div>

      <div className="flex gap-2 justify-center">
        {(['expense', 'income', 'transfer'] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTypeChange(t)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
              type === t
                ? 'bg-[#D4A017] text-[#0E1A2E]'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            onClick={() => press(key)}
            className={cn(
              'h-14 rounded-xl text-xl font-semibold transition-colors active:scale-95',
              key === '⌫'
                ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                : 'bg-muted text-foreground hover:bg-muted/80'
            )}
          >
            {key === '⌫' ? <Delete className="w-5 h-5 mx-auto" /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}


═══════════════════════════════════════════════════════════
FILE: src/components/transactions/category-grid.tsx
═══════════════════════════════════════════════════════════
'use client';

import { cn } from '@/lib/utils';
import type { Category } from '@/types';

function getIconEmoji(icon: string | null): string {
  if (!icon) return '💸';
  const map: Record<string, string> = {
    home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
    car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
    'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
    'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
    gift: '🎁',
  };
  return map[icon] ?? '💸';
}

interface CategoryGridProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  transactionType: string;
}

export function CategoryGrid({ categories, selectedId, onSelect, transactionType }: CategoryGridProps) {
  const filtered = categories.filter((c) => {
    // Fallback for categories loaded before the migration ran
    const ctype = c.category_type ?? (c.bucket_id ? 'expense' : 'income');
    if (transactionType === 'income') return ctype === 'income' || ctype === 'adjustment';
    return ctype === 'expense' || ctype === 'adjustment';
  });

  return (
    <div className="grid grid-cols-3 gap-2">
      {filtered.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all',
            selectedId === cat.id
              ? 'border-[#D4A017] bg-[#D4A017]/10'
              : 'border-border bg-muted hover:border-muted-foreground/30'
          )}
        >
          <span className="text-xl">{getIconEmoji(cat.icon)}</span>
          <span className="text-xs text-muted-foreground text-center leading-tight font-medium line-clamp-2">
            {cat.name}
          </span>
        </button>
      ))}
    </div>
  );
}


═══════════════════════════════════════════════════════════
FILE: src/components/transactions/income-category-picker.tsx
═══════════════════════════════════════════════════════════
'use client';

import { cn } from '@/lib/utils';

export const INCOME_PRESETS = [
  { key: 'salary', label: 'Salary', emoji: '💼' },
  { key: 'side_hustle', label: 'Side Hustle', emoji: '⚡' },
  { key: 'gift', label: 'Gift', emoji: '🎁' },
  { key: 'refund', label: 'Refund', emoji: '💸' },
  { key: 'loan_repayment', label: 'Loan Repayment', emoji: '🤝' },
  { key: 'sale', label: 'Sale', emoji: '🏷️' },
  { key: 'bonus', label: 'Bonus', emoji: '🎉' },
] as const;

export type IncomePresetKey = typeof INCOME_PRESETS[number]['key'] | 'other';

interface IncomeCategoryPickerProps {
  selectedKey: IncomePresetKey | null;
  onSelect: (key: IncomePresetKey) => void;
  customEmoji: string;
  customLabel: string;
  onCustomChange: (emoji: string, label: string) => void;
}

export function IncomeCategoryPicker({
  selectedKey, onSelect, customEmoji, customLabel, onCustomChange,
}: IncomeCategoryPickerProps) {
  const isOtherSelected = selectedKey === 'other';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {INCOME_PRESETS.map((preset) => {
          const isSelected = selectedKey === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onSelect(preset.key)}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all',
                isSelected
                  ? 'border-[#D4A017] bg-[#D4A017]/10'
                  : 'border-border bg-muted hover:border-muted-foreground/30'
              )}
            >
              <span className="text-xl">{preset.emoji}</span>
              <span className={cn('text-xs font-medium text-center leading-tight', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Other — always shown as its own row */}
      <button
        type="button"
        onClick={() => onSelect('other')}
        className={cn(
          'w-full flex items-center gap-2 p-3 rounded-xl border transition-all text-left',
          isOtherSelected
            ? 'border-[#D4A017] bg-[#D4A017]/10'
            : 'border-border bg-muted hover:border-muted-foreground/30'
        )}
      >
        {isOtherSelected ? (
          <>
            <input
              type="text"
              value={customEmoji}
              onChange={(e) => { e.stopPropagation(); onCustomChange(e.target.value.slice(0, 2), customLabel); }}
              onClick={(e) => e.stopPropagation()}
              placeholder="✏️"
              maxLength={2}
              className="w-8 shrink-0 text-center bg-transparent outline-none"
              style={{ fontSize: 20 }}
            />
            <input
              type="text"
              value={customLabel}
              onChange={(e) => { e.stopPropagation(); onCustomChange(customEmoji, e.target.value.slice(0, 30)); }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Label…"
              maxLength={30}
              autoFocus
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
              style={{ fontSize: 16 }}
            />
          </>
        ) : (
          <>
            <span className="text-xl">✏️</span>
            <span className="text-xs font-medium text-muted-foreground">Other</span>
          </>
        )}
      </button>
    </div>
  );
}


═══════════════════════════════════════════════════════════
FILE: src/components/transactions/transaction-item.tsx
═══════════════════════════════════════════════════════════
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Pencil, Scale, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useTransactionStore } from '@/stores/transaction-store';
import { formatTransactionDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';
import { revalidateForEntity } from '@/lib/revalidation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Transaction } from '@/types';

function getIconEmoji(icon: string | null): string {
  if (!icon) return '💸';
  const map: Record<string, string> = {
    home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
    car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
    'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
    'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
    gift: '🎁',
  };
  return map[icon] ?? '💸';
}

interface TransactionItemProps {
  transaction: Transaction;
}

export function TransactionItem({ transaction: txn }: TransactionItemProps) {
  const { removeTransaction, openLogSheet } = useTransactionStore();
  const supabase = createClient();
  const { format } = useCurrency();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    const { error } = await supabase.from('transactions').delete().eq('id', txn.id);
    if (error) {
      toast.error('Failed to delete');
      setIsDeleting(false);
      return;
    }
    setShowDeleteDialog(false);
    setIsDeleting(false);
    setDeleting(true);
    removeTransaction(txn.id);
    revalidateForEntity('transaction');
    toast.success('Transaction deleted');
  }

  const txnLabel =
    txn.note ??
    (txn.type === 'transfer'
      ? `${txn.account?.name ?? '?'} → ${txn.to_account?.name ?? '?'}`
      : txn.type === 'adjustment'
      ? 'Balance adjustment'
      : (txn.category?.name ?? 'this transaction'));

  return (
    <>
      <AnimatePresence>
        {!deleting && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{
                  background: txn.type === 'adjustment'
                    ? 'color-mix(in srgb, var(--muted-foreground) 10%, transparent)'
                    : txn.category?.bucket
                    ? `${txn.category.bucket.color}22`
                    : 'var(--card)',
                }}
              >
                {txn.type === 'adjustment' ? <Scale className="w-5 h-5 text-muted-foreground" /> : getIconEmoji(txn.category?.icon ?? null)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">
                    {txn.type === 'transfer'
                      ? `${txn.account?.name ?? '?'} → ${txn.to_account?.name ?? '?'}`
                      : txn.type === 'adjustment'
                      ? 'Balance Adjustment'
                      : (txn.category?.name ?? 'Uncategorized')}
                  </p>
                  {txn.type === 'adjustment' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium shrink-0">
                      adj
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  {txn.type !== 'transfer' && txn.account && (
                    <span className="text-muted-foreground/70 text-xs truncate">{txn.account.name}</span>
                  )}
                  {txn.generated_from_recurring && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#60A5FA18] text-[#60A5FA] font-medium shrink-0">
                      Auto
                    </span>
                  )}
                  {txn.paid_from_goal_id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#00D9A318] text-[#D4A017] font-medium shrink-0">
                      🎯 From fund
                    </span>
                  )}
                  {txn.note && <p className="text-muted-foreground text-xs truncate">{txn.note}</p>}
                </div>
                <p className="text-muted-foreground text-xs truncate">{formatTransactionDate(txn.transaction_date)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <p className={`amount text-sm font-semibold whitespace-nowrap ${
                txn.type === 'income' ? 'text-[#D4A017]' :
                txn.type === 'transfer' ? 'text-muted-foreground' :
                txn.type === 'adjustment' ? (txn.amount >= 0 ? 'text-[#D4A017]' : 'text-[#F43F5E]') :
                'text-foreground'
              }`}>
                {txn.type === 'income' ? '+' :
                 txn.type === 'transfer' ? '' :
                 txn.type === 'adjustment' ? (txn.amount >= 0 ? '+' : '') :
                 '-'}{format(Math.abs(txn.amount))}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Transaction actions"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 p-2 -mr-2 rounded-full text-muted-foreground hover:bg-muted/40 active:bg-muted/60 transition-colors"
                    />
                  }
                >
                  <MoreVertical className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => openLogSheet(txn)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-[#F43F5E] focus:text-[#F43F5E]"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this transaction?</DialogTitle>
            <DialogDescription>
              This will permanently remove &ldquo;{txnLabel}&rdquo; ({format(Math.abs(txn.amount))}) from your records. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-[#F43F5E] text-white hover:bg-[#E11D48] disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


═══════════════════════════════════════════════════════════
FILE: src/components/transactions/insufficient-balance-sheet.tsx
═══════════════════════════════════════════════════════════
'use client';

import { Plus, ArrowLeftRight, Scale, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { useCurrency } from '@/hooks/use-currency';

interface InsufficientBalanceSheetProps {
  open: boolean;
  onClose: () => void;
  accountName: string;
  accountBalance: number;
  amountRequested: number;
  onTopUp: () => void;
  onChangeAccount: () => void;
  onReconcile: () => void;
}

export function InsufficientBalanceSheet({
  open,
  onClose,
  accountName,
  accountBalance,
  amountRequested,
  onTopUp,
  onChangeAccount,
  onReconcile,
}: InsufficientBalanceSheetProps) {
  const { format } = useCurrency();
  if (!open) return null;

  const isNegative = accountBalance < 0;
  const isEmpty = accountBalance === 0;
  const isInsufficient = accountBalance > 0 && amountRequested > accountBalance;

  const headline = isNegative
    ? `${accountName} is underwater`
    : isEmpty
    ? `${accountName} is empty`
    : isInsufficient
    ? `${accountName} only has ${format(accountBalance)}`
    : `${accountName} is empty`;

  const description = isNegative
    ? `Balance is ${format(accountBalance)} — you're already overspent.`
    : isEmpty
    ? `${accountName} has no money to spend right now.`
    : isInsufficient
    ? `You're trying to spend ${format(amountRequested)}, but only ${format(accountBalance)} is available.`
    : `${accountName} has no money to spend right now.`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[#141416] border border-[#27272A] rounded-t-3xl md:rounded-3xl w-full max-w-md p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#52525B] hover:text-[#A1A1AA] transition-colors p-1"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#FBBF24]/10 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-[#FBBF24]" />
          </div>
          <div>
            <h2 className="text-[#FAFAFA] font-semibold text-base leading-snug">
              {headline}
            </h2>
            <p className="text-[#71717A] text-sm mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Action rows */}
        <div className="space-y-2">
          <button
            onClick={onTopUp}
            className="w-full flex items-center justify-between p-4 bg-[#1C1C1F] hover:bg-[#27272A] rounded-xl transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D4A017]/10 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-[#D4A017]" />
              </div>
              <div>
                <p className="text-[#FAFAFA] text-sm font-medium">Top up {accountName}</p>
                <p className="text-[#71717A] text-xs mt-0.5">Log incoming money to this account</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#52525B] shrink-0" />
          </button>

          <button
            onClick={onChangeAccount}
            className="w-full flex items-center justify-between p-4 bg-[#1C1C1F] hover:bg-[#27272A] rounded-xl transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#60A5FA]/10 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-4 h-4 text-[#60A5FA]" />
              </div>
              <div>
                <p className="text-[#FAFAFA] text-sm font-medium">Use a different account</p>
                <p className="text-[#71717A] text-xs mt-0.5">Pick another account to spend from</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#52525B] shrink-0" />
          </button>

          <button
            onClick={onReconcile}
            className="w-full flex items-center justify-between p-4 bg-[#1C1C1F] hover:bg-[#27272A] rounded-xl transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#A78BFA]/10 flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4 text-[#A78BFA]" />
              </div>
              <div>
                <p className="text-[#FAFAFA] text-sm font-medium">Reconcile balance</p>
                <p className="text-[#71717A] text-xs mt-0.5">If your real balance is actually higher</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#52525B] shrink-0" />
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 text-[#52525B] text-sm py-2 hover:text-[#A1A1AA] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}


═══════════════════════════════════════════════════════════
FILE: src/stores/transaction-store.ts
═══════════════════════════════════════════════════════════
import { create } from 'zustand';
import type { Transaction, Category, DashboardStats } from '@/types';

interface ReconcileContext {
  accountId: string;
  sikaBalance: number;
}

interface TransactionState {
  transactions: Transaction[];
  categories: Category[];
  dashboardStats: DashboardStats | null;
  isLogSheetOpen: boolean;
  editingTransaction: Transaction | null;
  reconcileContext: ReconcileContext | null;
  mutationCount: number;
  setTransactions: (txns: Transaction[]) => void;
  setCategories: (cats: Category[]) => void;
  setDashboardStats: (stats: DashboardStats) => void;
  openLogSheet: (txn?: Transaction) => void;
  openReconcileSheet: (context: ReconcileContext) => void;
  closeLogSheet: () => void;
  addTransaction: (txn: Transaction) => void;
  updateTransaction: (txn: Transaction) => void;
  removeTransaction: (id: string) => void;
  bumpMutation: () => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: [],
  categories: [],
  dashboardStats: null,
  isLogSheetOpen: false,
  editingTransaction: null,
  reconcileContext: null,
  mutationCount: 0,
  setTransactions: (transactions) => set({ transactions }),
  setCategories: (categories) => set({ categories }),
  setDashboardStats: (dashboardStats) => set({ dashboardStats }),
  openLogSheet: (txn) => set({ isLogSheetOpen: true, editingTransaction: txn ?? null, reconcileContext: null }),
  openReconcileSheet: (context) => set({ isLogSheetOpen: true, editingTransaction: null, reconcileContext: context }),
  closeLogSheet: () => set({ isLogSheetOpen: false, editingTransaction: null, reconcileContext: null }),
  addTransaction: (txn) =>
    set((s) => ({ transactions: [txn, ...s.transactions] })),
  updateTransaction: (txn) =>
    set((s) => ({
      transactions: s.transactions.map((t) => (t.id === txn.id ? txn : t)),
    })),
  removeTransaction: (id) =>
    set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
  bumpMutation: () => set((s) => ({ mutationCount: s.mutationCount + 1 })),
}));


═══════════════════════════════════════════════════════════
FILE: src/lib/revalidation.ts
═══════════════════════════════════════════════════════════
// Revalidation matrix — which mutations affect which client-side views.
//
// In this client-side Next.js app, "revalidation" means bumping mutationCount
// in the Zustand store. Every page that fetches data has a useEffect whose
// deps include mutationCount, so it automatically re-fetches when anything
// mutates. revalidateForEntity() is the single call-site for this.
//
// Mutations → affected routes:
//   transaction (create/update/delete) → /dashboard, /transactions, /accounts
//   account    (create/update/delete) → /accounts, /dashboard, /transactions, /settings
//   transfer   (create/update/delete) → /dashboard, /transactions, /accounts
//   adjustment (create/update/delete) → /dashboard, /transactions, /accounts
//   category   (create/update/delete) → /settings, /dashboard, /transactions
//   incomeSource (create/update/delete) → /settings, /dashboard
//   profile    (update)              → /dashboard, /settings
//   bucket     (update)              → /dashboard, /settings

export const REVALIDATION_MAP = {
  transaction:       ['/dashboard', '/transactions', '/accounts', '/streaks', '/health'],
  account:           ['/accounts', '/dashboard', '/transactions', '/settings'],
  transfer:          ['/dashboard', '/transactions', '/accounts'],
  adjustment:        ['/dashboard', '/transactions', '/accounts'],
  category:          ['/settings', '/dashboard', '/transactions'],
  incomeSource:      ['/settings', '/dashboard'],
  profile:           ['/dashboard', '/settings'],
  bucket:            ['/dashboard', '/settings'],
  goal:                  ['/goals', '/dashboard'],
  goal_contribution:     ['/goals', '/dashboard', '/accounts', '/transactions', '/streaks', '/health'],
  sinking_fund_payment:  ['/goals', '/dashboard', '/accounts', '/transactions'],
  card_theme:            ['/dashboard', '/settings'],
  momentum_event:        ['/dashboard', '/momentum', '/health'],
  badge_unlocked:        ['/dashboard', '/badges', '/health'],
  digest_read:           ['/dashboard', '/daily'],
  digest_generated:      ['/dashboard', '/daily'],
} as const;

import { useTransactionStore } from '@/stores/transaction-store';

export function revalidateForEntity(_entity: keyof typeof REVALIDATION_MAP): void {
  useTransactionStore.getState().bumpMutation();
}


═══════════════════════════════════════════════════════════
SUMMARY
═══════════════════════════════════════════════════════════

Files found and printed (9):
- src/components/transactions/add-transaction-fab.tsx — global FAB (the only "Add" trigger; no /transactions/new route)
- src/components/transactions/transaction-sheet.tsx — the unified add/edit/transfer/adjustment bottom sheet (933 lines). Handles all four flows from one component, with stepped UI: amount → category → details (or amount → accounts → details for transfer, or single-page reconcile for adjustment).
- src/components/transactions/amount-keypad.tsx — custom 3×4 numeric keypad with the inline expense | income | transfer pill switcher.
- src/components/transactions/category-grid.tsx — 3-col emoji grid for expense (and adjustment) categories. Filters categories client-side based on transactionType.
- src/components/transactions/income-category-picker.tsx — hardcoded 7 INCOME_PRESETS + an "Other" custom emoji+label row. NOT data-driven from `categories` table; matches preset name → category by name on save.
- src/components/transactions/transaction-item.tsx — list row with 3-dot dropdown (Edit re-opens the sheet via openLogSheet(txn); Delete shows a Dialog confirm and hard-deletes).
- src/components/transactions/insufficient-balance-sheet.tsx — modal that pops when user tries to spend more than account balance. Three options: top up, change account, reconcile.
- src/stores/transaction-store.ts — the Zustand store. Exposes openLogSheet/openReconcileSheet/closeLogSheet, addTransaction/updateTransaction/removeTransaction, dashboardStats, mutationCount + bumpMutation.
- src/lib/revalidation.ts — the single function the sheet calls after any successful write: revalidateForEntity('transaction' | 'adjustment' | 'sinking_fund_payment'). All it does is bumpMutation(); every data hook depends on mutationCount and re-fetches.

Files NOT found (with what I searched for):
- Add Transaction route (e.g. /transactions/new): searched `find src -path "*transactions*new*" -o -path "*transactions*add*" -type f -name "*.tsx"`. Only `add-transaction-fab.tsx` matched. There is NO standalone route — adding is via the global TransactionSheet bottom sheet triggered by the FAB.
- TransactionForm / AddTransactionForm component: searched `grep -rn "TransactionForm\|AddTransactionForm" src/`. No match. The form is the body of `TransactionSheet` itself; there is no separate form component.
- AccountPicker / account-picker: searched `grep -rn "AccountPicker\|account-picker" src/`. No match. The "account picker" is rendered inline in `transaction-sheet.tsx` (lines 486-510 for the From-only chip row, lines 558-602 for the From/To transfer rows).
- CategoryPicker / category-picker: searched `grep -rn "CategoryPicker\|category-picker" src/`. No match. The two category-picker UIs are `CategoryGrid` (expense/adjustment) and `IncomeCategoryPicker` (hardcoded income presets), both printed above.
- TypeSelector / explicit type-selector component: searched `grep -rn "type.*expense.*income.*transfer\|TypeSelector" src/components/`. No match. The expense/income/transfer pill selector is rendered inline inside `AmountKeypad` (lines 46-61). Adjustment is NOT in that picker — it's a separate "Reconcile an account balance instead" link in the sheet (transaction-sheet.tsx:474-483).
- Zod schema for the transaction form: searched `grep -rn "z\.object\|zodResolver" src/components/transactions/ src/app/\(app\)/transactions/`. No match. There is **no Zod schema** for the transaction form — the sheet uses plain `useState` and inline imperative validation in `handleSave`. (Account-modal.tsx, signup, and the onboarding modal DO use Zod, but the transaction sheet does not.) `src/lib/schemas/` directory does not exist.
- Optimistic-update helper or mutation wrapper: searched `grep -rn "optimistic\|insert.*transaction" src/lib/ src/stores/`. No dedicated wrapper. The sheet does NOT do optimistic updates — it awaits the Supabase insert/update, then on success calls `addTransaction(data)` / `updateTransaction(data)` to splice the returned (joined) row into the local store, and finally `revalidateForEntity('transaction')`. Errors abort with `hapticToast.error(...)` and the local state is never modified.
- Edit Transaction route or separate component: searched `grep -rn "EditTransaction\|edit.*transaction" src/`. No dedicated route or component. Edit reuses the same `TransactionSheet`: clicking Edit on `TransactionItem` calls `openLogSheet(txn)`, which sets `editingTransaction = txn` in the store; the sheet's mount-effect (transaction-sheet.tsx:128-139) pre-fills all form state from `editingTransaction`. The save path then takes the `editingTransaction` branch (`update().eq('id', editingTransaction.id)` instead of `insert(...)`).
- `from_account_id` column: searched `grep -rn "from_account_id" src/`. **Zero matches.** Confirmed: the schema has `account_id` and `to_account_id` only — NOT `from_account_id`.

Critical findings:

- **Transfer pattern: ONE row.** A transfer writes a single `transactions` row with `type='transfer'`, `account_id = source`, `to_account_id = destination`. Confirmed in `transaction-sheet.tsx:266-275` (insert payload) and the database CHECK constraints (`migrations/0003_accounts_and_cycles.sql:33-39`: `transfer_accounts_differ` requires both ids set + different on transfers; `non_transfer_no_to_account` requires `to_account_id IS NULL` for non-transfer rows). The account-balance computation walks this single row and subtracts from `account_id`, adds to `to_account_id` (`src/lib/accounts.ts:33-39`).

- **Optimistic update pattern: NONE.** The sheet awaits Supabase, then on success calls the store action `addTransaction(data)` (or `updateTransaction(data)`) with the *server-returned* joined row. So local state stays consistent with the DB. The store action `addTransaction` at `transaction-store.ts:44` does `set((s) => ({ transactions: [txn, ...s.transactions] }))` — a simple unshift, no rollback path needed since it only runs after the server confirmed.

- **Validation library: plain useState + inline imperative checks.** No Zod, no react-hook-form. Validation happens inside `handleSave` (`transaction-sheet.tsx:250-264`): early-returns if `parseFloat(amount) <= 0`, if transfer has missing/equal accounts, if income preset is invalid, if sinking-fund overpayment, etc. Step-progression buttons gate on local booleans like `canProceedAmount = numAmount > 0` and `incomeCategoryValid`.

- **Form library: plain useState.** The sheet declares ~15 separate `useState` hooks (`transaction-sheet.tsx:55-89`) for `step, amount, txType, categoryId, accountId, toAccountId, note, txDate, saving, incomeCategoryKey, incomeCustomEmoji, incomeCustomLabel, sinkingFundGoals, paidFromGoalId, sfExpanded, sfHintDismissed, sfBalance, sfBalanceLoading, nextCycleGoal, insufficientOpen, reconcileActual`. No useForm, no Formik, no Zod resolver. (Other surfaces in the app — `account-modal.tsx`, signup, onboarding modal — use react-hook-form + Zod, but the transaction sheet deliberately does not.)

- **Heavy client-side post-write side-effect chain.** After a successful insert (transaction-sheet.tsx:298-360): haptic, `addTransaction`, PostHog `analytics.transactionLogged`, `updateLoggingStreak`, `awardMomentum('transaction_logged')`, `checkAndUnlockBadges('transaction_logged')` and `('streak_updated')`, plus (for paid-from-goal expense) goal-completion check + `goal_completed` momentum/badges. The reconcile path additionally awards `'account_reconciled'` momentum and checks the matching badge category. iOS must replicate this chain or move it server-side, otherwise streaks/momentum/badges silently desync.

- **Adjustment has signed `amount`.** `reconcileDiff = (parseFloat(reconcileActual) || 0) - sikaBalance` is signed; it's written verbatim to `transactions.amount`. All other transaction types treat `amount` as a positive quantity. `transaction-item.tsx:129-138` renders the sign with adjustment-specific logic.

- **Insert payload exact shape** (transaction-sheet.tsx:266-275):
  ```
  {
    user_id, amount, type,
    category_id: (transfer || adjustment) ? null : effectiveCategoryId,
    account_id,
    to_account_id: transfer ? toAccountId : null,
    note: effectiveNote || null,
    transaction_date,
    paid_from_goal_id: expense ? paidFromGoalId : null,
  }
  ```
  Fields NOT sent and (per migration history) NOT on the table: `is_active`, `soft_deleted`. The `generated_from_recurring` column exists but is only set by the recurring-transaction generator, never by the sheet. The `goal_id` column exists and is set by the goal-contribution flow (`src/lib/goals.ts`), never by the sheet.
