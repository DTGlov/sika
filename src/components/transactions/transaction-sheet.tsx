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
import { formatGHS } from '@/lib/utils';
import { cn } from '@/lib/utils';
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
    toast.success(`Reconciled to ${formatGHS(parseFloat(reconcileActual) || 0)}`);
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
                stepList.indexOf(step) >= i ? 'bg-[#00D9A3]' : 'bg-muted'
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
              className="w-full h-13 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold text-base rounded-xl flex items-center justify-center gap-2"
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
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl">
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
                <span className="text-foreground font-semibold tabular-nums">{formatGHS(sikaBalance)}</span>
              </div>
            )}

            {/* Actual balance input */}
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">Actual current balance</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">₵</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={reconcileActual}
                  onChange={(e) => setReconcileActual(e.target.value)}
                  className="h-12 pl-7 bg-muted border-border text-foreground focus-visible:ring-[#00D9A3] amount"
                />
              </div>
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
                  {reconcileIsPositive ? '+' : ''}{formatGHS(reconcileDiff)}
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
                className="h-11 bg-muted border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-[#00D9A3]"
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
              <label className="text-muted-foreground text-sm">Note (optional)</label>
              <Input
                placeholder="What was this for?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-[#00D9A3]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">Date</label>
              <Input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="h-12 bg-muted border-border text-foreground focus-visible:ring-[#00D9A3]"
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
                        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-[#00D9A3] transition-colors"
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
                              <span className="text-foreground font-medium">{formatGHS(sfBalance)}</span>{' '}
                              saved. You can either:
                            </p>
                            <ul className="text-muted-foreground text-xs space-y-0.5 ml-2">
                              <li>• Reduce this payment to {formatGHS(sfBalance)} or less</li>
                              <li>• Contribute {formatGHS(numAmount - sfBalance)} more to the goal first</li>
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
                              <span className="text-foreground tabular-nums">{formatGHS(sfBalance)}</span>
                            </div>
                            {numAmount > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">After this payment</span>
                                <span className={cn('tabular-nums font-medium', sfWillFulfill ? 'text-[#00D9A3]' : 'text-foreground')}>
                                  {sfWillFulfill
                                    ? '₵0 — goal will be fulfilled'
                                    : formatGHS(Math.max(0, sfAfterBalance ?? 0)) + ' remaining'}
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
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl">
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
