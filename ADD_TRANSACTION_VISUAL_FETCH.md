═══════════════════════════════════════════════════════════
SEARCH RESULTS — none of the assumed components exist
═══════════════════════════════════════════════════════════

Before printing files, here is what each search returned:

1. Multi-step orchestrator (`grep "currentStep|wizard|setStep" src/components/transactions/`):
   → ONLY hit: `transaction-sheet.tsx` (own internal `useState<Step>('amount')` + `setStep(...)` calls).
   → No `add-transaction-flow.tsx`, no `add-transaction-wizard.tsx`. There is NO `/transactions/new` route.

2. Amount step (`grep "How much"`):
   → ONLY hit: `transaction-sheet.tsx:425` — the string `'How much?'` is in a `stepTitles: Record<Step, string>` map. There is NO `AmountStep` component file.

3. Category step (`grep "What for"`):
   → ONLY hit: `transaction-sheet.tsx:426` — string in same `stepTitles` map. No `CategoryStep` file.

4. Details step (`grep "Any details"`):
   → ONLY hit: `transaction-sheet.tsx:428` — string in the same map. No `DetailsStep` file.

5. Step indicator (`grep "StepIndicator|step-indicator" src/`):
   → Zero hits. The 3-segment progress capsule is 7 inline lines at `transaction-sheet.tsx:451-461`.

6. Number pad (`grep "NumberPad|number-pad|numberPad" src/`):
   → Zero hits. The keypad lives inside `amount-keypad.tsx`, which is the unified amount-display + type-pills + 3×4 grid component (NOT a separate number pad).

7. Account chip / selector (`grep "AccountChip|account-chip|AccountSelector|account-selector" src/`):
   → Zero hits. Account chip rows are **inline** in three places inside `transaction-sheet.tsx`:
   - Step `amount` (single From-only row): lines 486-510
   - Step `accounts` (transfer From + arrow + To): lines 558-602
   - Step `reconcile` (single row): lines 635-655

8. Type pills (`grep "TypePills|type-pills|TypeSelector"`):
   → Zero hits. Pills are **inline** in `amount-keypad.tsx:46-61`. Adjustment is NOT in this picker.

9. "Reconcile balance instead" link:
   → ONLY hit: `transaction-sheet.tsx:474-483` (an inline `<button>`). No separate component.

10. "Paid from a target?" affordance:
    → ONLY hits: `transaction-sheet.tsx:764, 839` and the entire enclosing block at lines 752-883 (130+ inline JSX lines). No separate component.

11. Category card (`grep "CategoryCard|category-card" src/`):
    → Zero hits. The single-card UI is the **inline `<button>`** inside `.map(...)` in `category-grid.tsx` (lines 35-51) and `income-category-picker.tsx` (lines 36-53 for presets, 56-97 for "Other").

12. Module CSS files (`find src/components/transactions -name "*.css"`):
    → Zero. Only `src/app/globals.css` (printed below) defines `.amount` (the tabular-mono number utility) and `.glow-accent`.

13. Animations between steps:
    → framer-motion is imported but used for **only two things**: the FAB pulse (`add-transaction-fab.tsx`) and the "Paid from a target?" expand/collapse (`AnimatePresence` + `motion.div` at `transaction-sheet.tsx:784-879`). **There is NO step-to-step animation** — when `step` changes, the conditional render swaps instantly with no transition.

The visual design lives entirely in **6 files**, printed below. Quotes of the inline visual elements (with line ranges) follow each file in the summary section so you can locate them quickly.

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
FILE: src/components/ui/sheet.tsx
═══════════════════════════════════════════════════════════
"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPortal>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}


═══════════════════════════════════════════════════════════
FILE: src/app/globals.css
═══════════════════════════════════════════════════════════
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-geist-sans);

  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Sika brand tokens */
  --color-sika-base: #0E1A2E;
  --color-sika-elevated: #162540;
  --color-sika-hover: #1E2F47;
  --color-sika-text: #F8ECC2;
  --color-sika-secondary: #8A9BB5;
  --color-sika-accent: #D4A017;
  --color-sika-accent-hover: #B8891A;
  --color-sika-accent-glow: #E8B520;
  --color-sika-success: #00D9A3;
  --color-sika-warning: #FBBF24;
  --color-sika-danger: #F43F5E;
  --color-sika-border: #1E3050;
  --color-sika-needs: #00D9A3;
  --color-sika-wants: #FBBF24;
  --color-sika-savings: #60A5FA;

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: #FBF7EE;
  --foreground: #0E1A2E;
  --card: #FFFFFF;
  --card-foreground: #0E1A2E;
  --popover: #FFFFFF;
  --popover-foreground: #0E1A2E;
  --primary: #D4A017;
  --primary-foreground: #0E1A2E;
  --secondary: #F1EFE6;
  --secondary-foreground: #0E1A2E;
  --muted: #F1EFE6;
  --muted-foreground: #6B7A8D;
  --accent: #D4A017;
  --accent-foreground: #0E1A2E;
  --destructive: #F43F5E;
  --border: #E2DCCF;
  --input: #F1EFE6;
  --ring: #D4A017;
  --radius: 0.75rem;
}

.dark {
  --background: #0E1A2E;
  --foreground: #F8ECC2;
  --card: #162540;
  --card-foreground: #F8ECC2;
  --popover: #162540;
  --popover-foreground: #F8ECC2;
  --primary: #D4A017;
  --primary-foreground: #0E1A2E;
  --secondary: #1E2F47;
  --secondary-foreground: #F8ECC2;
  --muted: #1E2F47;
  --muted-foreground: #8A9BB5;
  --accent: #D4A017;
  --accent-foreground: #0E1A2E;
  --destructive: #F43F5E;
  --border: #1E3050;
  --input: #1E2F47;
  --ring: #D4A017;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
  html {
    @apply font-sans;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #D4A017;
  }
}

@layer utilities {
  .amount {
    font-family: var(--font-geist-mono);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .glow-accent {
    box-shadow: 0 0 20px rgba(212, 160, 23, 0.25);
  }

  .gradient-card {
    background: linear-gradient(135deg, #162540 0%, #1E2F47 100%);
  }
}


═══════════════════════════════════════════════════════════
FILE: src/lib/accounts.ts (ACCOUNT_TYPE_CONFIG only — required for chip colors/emojis)
═══════════════════════════════════════════════════════════
import type { Account, AccountType } from '@/types/account';

export const ACCOUNT_TYPE_CONFIG: Record<AccountType, { label: string; color: string; emoji: string }> = {
  bank:       { label: 'Bank',       color: '#00D9A3', emoji: '🏦' },
  momo:       { label: 'MoMo',       color: '#FBBF24', emoji: '📱' },
  cash:       { label: 'Cash',       color: '#A1A1AA', emoji: '💵' },
  savings:    { label: 'Savings',    color: '#60A5FA', emoji: '🐷' },
  investment: { label: 'Investment', color: '#8B5CF6', emoji: '📈' },
  other:      { label: 'Other',      color: '#F97316', emoji: '👛' },
};

// (computeAccountBalances function omitted from this fetch — not visual)


═══════════════════════════════════════════════════════════
FILE: src/lib/constants.ts (CURRENCY_SYMBOL only — used by amount-keypad)
═══════════════════════════════════════════════════════════
export const CURRENCY = 'GHS';
export const CURRENCY_SYMBOL = '₵';
// (rest omitted from this fetch — not visual to add-transaction)


═══════════════════════════════════════════════════════════
INLINE-VISUAL EXTRACTION (for iOS line-by-line mapping)
═══════════════════════════════════════════════════════════

These are the exact line ranges inside `transaction-sheet.tsx` for each visual primitive your iOS team is searching for. Web has them inline — there is no separate file.

──────── Sheet container (the bottom-up modal frame) ────────
transaction-sheet.tsx:438-441
```
<SheetContent
  side="bottom"
  className="bg-card border-t border-border rounded-t-3xl px-4 pb-8 pt-4 max-h-[92svh] overflow-y-auto"
>
```
- Anchored `side="bottom"`. Rounded top corners only (`rounded-t-3xl`). Max-height clamped to 92% of small viewport height. Background = card token (light: white #FFFFFF, dark: #162540).
- 16px horizontal padding (`px-4`), 32px bottom padding (`pb-8`), 16px top padding (`pt-4`).

──────── Drag handle (10×4 grey pill at top of sheet) ────────
transaction-sheet.tsx:442
```
<div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
```
- Visual only — not draggable. Centered, 40px wide × 4px tall, `bg-muted` (light: #F1EFE6, dark: #1E2F47), 16px bottom margin.

──────── Sheet title (e.g. "How much?") ────────
transaction-sheet.tsx:444-448
```
<SheetHeader className="mb-4">
  <SheetTitle className="text-foreground text-lg font-bold text-left">
    {stepTitles[step]}
  </SheetTitle>
</SheetHeader>
```
- Note the **override**: `text-lg font-bold` (18px, 700). The base `SheetTitle` primitive defaults to `font-heading text-base font-medium` (16px, 500); this page overrides both. iOS should use 18pt Bold.
- Title text comes from a map at lines 424-430:
  ```
  amount: editingTransaction ? 'Edit amount' : 'How much?',
  category: 'What for?',
  accounts: 'Transfer between',
  details: 'Any details?',
  reconcile: 'Reconcile balance',
  ```

──────── Step indicator (3-segment gold capsule progress bar) ────────
transaction-sheet.tsx:451-461
```
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
```
- 4px tall (`h-1`), full-rounded, gap 6px (`gap-1.5`).
- Each segment fills `flex-1` (equal width). Segments at-or-before current step are `bg-[#D4A017]` (Sika gold); future segments are `bg-muted`.
- `stepList` is dynamic per type:
  - expense/income: `['amount', 'category', 'details']` → 3 segments
  - transfer: `['amount', 'accounts', 'details']` → 3 segments
  - adjustment: `['reconcile']` → 1 segment (full-width gold, no progression)

──────── Type pills (Expense / Income / Transfer) — INSIDE amount-keypad.tsx ────────
amount-keypad.tsx:46-61
```
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
```
- Pill = 12px horiz padding × 4px vert padding, `rounded-full`, `text-xs` (12px), `font-medium` (500), `capitalize`.
- Active = solid Sika gold #D4A017 with navy text #0E1A2E. Inactive = muted background, muted-foreground text.
- Adjustment is **not in this row** — it's reached via the inline link below the keypad.

──────── Number pad (3×4 grid) — INSIDE amount-keypad.tsx ────────
amount-keypad.tsx:63-78
```
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
```
- `KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫']` — 12 buttons in a 3-col grid (4 rows).
- Each button: 56px tall (`h-14`), `rounded-xl` (12px), `text-xl` (20px) `font-semibold` (600), `bg-muted`. Backspace key uses `text-muted-foreground`, others use `text-foreground`.
- `active:scale-95` for press feedback.
- Backspace renders `<Delete>` Lucide icon at 20×20px, centered.

──────── Amount display (currency symbol + amount text) — INSIDE amount-keypad.tsx ────────
amount-keypad.tsx:32-44
```
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
```
- Currency symbol: 30px (`text-3xl`), Geist Mono (`font-mono`), muted color.
- Amount value: 48px (`text-5xl`), 700 weight, Geist Mono via the `.amount` utility class (font-family: var(--font-geist-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em).
- Color: gold #D4A017 when type === 'income', otherwise foreground.
- Currency symbol text comes from `CURRENCY_SYMBOL = '₵'` (Ghana cedi) — printed at top of section above. Note this is hardcoded via `import { CURRENCY_SYMBOL } from '@/lib/constants'` and does NOT use the dynamic `useCurrency()` hook, so a user with a different currency selected on web still sees '₵' on the keypad. (Likely a small bug; flag for iOS.)

──────── "Reconcile an account balance instead" link ────────
transaction-sheet.tsx:473-483
```
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
```
- Full-width centered button, `text-xs` (12px), color = muted-foreground at 60% opacity (very faint).
- Lucide `Scale` icon 14×14px before text, gap 6px.
- 4px vert padding (`py-1`).
- **Only shown when not editing** (creating fresh).
- Clicking calls `handleTypeChange('adjustment')` — see below: this **transforms the same sheet inline** (does not dismiss).

──────── Account chip row (step `amount`, single From-only) ────────
transaction-sheet.tsx:486-510
```
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
```
- Section label: "Account", `text-xs` (12px), muted color, 8px below before chip row.
- Chip: `flex` row, gap 6px, 12px horiz / 6px vert padding, `rounded-xl` (12px), `text-xs` (12px), `font-medium` (500), 1px border.
- **Inactive:** `border-border bg-muted text-muted-foreground`.
- **Active:** inline style borders + tints by `cfg.color` from ACCOUNT_TYPE_CONFIG. Background = `cfg.color + '18'` which is 9.4% alpha hex (0x18 = 24/255). Text & border = full `cfg.color`.
- Account types with their colors (from `lib/accounts.ts`):
  - bank → `#00D9A3` (teal/green) emoji `🏦`
  - momo → `#FBBF24` (amber) emoji `📱`
  - cash → `#A1A1AA` (grey) emoji `💵`
  - savings → `#60A5FA` (blue) emoji `🐷`
  - investment → `#8B5CF6` (purple) emoji `📈`
  - other → `#F97316` (orange) emoji `👛`
- Hidden when `txType === 'transfer'` (the transfer step has its own From/To version).

──────── Account chip row (step `accounts`, From + arrow + To) ────────
transaction-sheet.tsx:559-602
```
<div className="space-y-5">
  <div className="space-y-2">
    <p className="text-muted-foreground text-sm">From</p>
    <div className="flex flex-wrap gap-2">
      {accounts.map(acc => { ... same chip JSX as above ... })}
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
      {accounts.filter(a => a.id !== accountId).map(acc => { ... })}
    </div>
  </div>
</div>
```
- Larger chips than the `amount`-step version: `text-sm` (14px) and `py-2` instead of `py-1.5`.
- Section labels are `text-sm` (14px) here vs `text-xs` (12px) on the `amount` step.
- Arrow divider: two flex-1 horizontal hairlines (`h-px bg-border`) with a 16×16 right-arrow Lucide icon between, all at 60% opacity muted color.
- "To" row excludes the currently-selected From account.

──────── Category grid (step `category`) — category-grid.tsx ────────
category-grid.tsx:34-52
```
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
```
- 3-column grid, gap 8px.
- Card: `flex-col` centered, gap 6px, 12px padding, `rounded-xl` (12px), 1px border.
- **Inactive:** `border-border bg-muted` (muted, neutral tile).
- **Active:** `border-[#D4A017] bg-[#D4A017]/10` (gold border + 10% gold tint).
- Emoji: 20px (`text-xl`).
- Label: 12px (`text-xs`) muted-foreground, centered, tight leading, max 2 lines.
- Filter rule (lines 26-31): when `transactionType === 'income'` show categories with `category_type` of `income` or `adjustment`; otherwise show `expense` or `adjustment`. So the grid auto-filters on entry.

──────── Income category picker (step `category` when type=income) — income-category-picker.tsx ────────
- Same 3-col grid pattern as expense (lines 32-54), but data source is the hardcoded `INCOME_PRESETS` constant (7 items: Salary, Side Hustle, Gift, Refund, Loan Repayment, Sale, Bonus).
- Each preset card: emoji 20px + label 12px, same active/inactive border/bg colors as expense grid.
- Below the grid: a single full-width "Other" row (lines 56-97) that, when selected, swaps to two inline `<input>` fields side-by-side (an emoji input on the left, a label input on the right) — same border styling and color treatment.

──────── "Paid from a target?" expandable affordance (step `details`) ────────
transaction-sheet.tsx:752-883

Trigger header (lines 753-782):
```
<div className="flex items-center gap-1.5">
  <button
    type="button"
    onClick={() => { setSfExpanded(v => !v); setSfHintDismissed(false); }}
    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
  >
    <span className="text-muted-foreground/60">{sfExpanded ? '▾' : '▸'}</span>
    Paid from a target?
  </button>
  <Popover>
    <PopoverTrigger render={<button ... aria-label="Why isn't my perpetual goal here?"
      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"><Info className="w-3.5 h-3.5" /></button>} />
    <PopoverContent side="bottom" align="start" sideOffset={8} collisionPadding={16}>
      Perpetual goals (like Life Savings) are designed to be untouchable and don't appear here. For real emergencies, log as a normal expense.
    </PopoverContent>
  </Popover>
</div>
```
- Disclosure indicator is a Unicode `▸` (collapsed) / `▾` (expanded) glyph at 60% muted-foreground.
- Label "Paid from a target?" is `text-xs` (12px), muted-foreground.
- Trailing 14×14 Lucide `Info` icon opens a Popover with the protected-perpetual-goals explanation.

Expand body (lines 784-882) — wrapped in `<AnimatePresence>` with framer-motion `motion.div` (lines 786-879):
```
<motion.div
  initial={{ opacity: 0, height: 0 }}
  animate={{ opacity: 1, height: 'auto' }}
  exit={{ opacity: 0, height: 0 }}
  transition={{ duration: 0.2 }}
  className="mt-2 space-y-2 overflow-hidden"
>
```
- 200ms height + opacity animation, top margin 8px, `space-y-2` (8px between children).
- Children:
  - **Goal selector** (lines 801-812): native `<select>` with options including `— Not from a target` placeholder + each active target-type goal. Styled `bg-muted border border-border rounded-xl px-3 py-2.5 text-base`, focuses to gold `#D4A017` border.
  - **Footnote** (lines 815-819): "Perpetual goals (like Life Savings) don't appear here — they're protected.", `text-xs` muted, separated by a top border line (`border-t border-border mt-2 pt-2`).
  - **Live preview cards** (lines 822-874) — three states based on `sfBalance` and overpayment:
    - **Overpayment** (red `#F43F5E` 10% bg + 30% border): warning triangle, message, three numbered options for the user.
    - **Empty goal** (`sfBalance === 0`): same red treatment, single "contribute first" message.
    - **Healthy** (default): muted card showing "Goal balance" line + "After this payment" line. The latter highlights gold `#D4A017` and reads "₵0 — goal will be fulfilled" if this payment will hit the target, otherwise "X remaining".
  - **Loading state** (line 877): "Checking goal balance…" 60% muted-foreground.

How `goal_id` (actually `paid_from_goal_id`) is set: ONLY by the user, manually, via the `<select>` in this expandable section. There is **no auto-detection** — no inference from category, amount, or date. The select's onChange (line 803) writes `setPaidFromGoalId(e.target.value || null)`. The selected value is then passed straight into the insert payload (transaction-sheet.tsx:274): `paid_from_goal_id: txType === 'expense' ? paidFromGoalId : null`. Note the column on the database is `paid_from_goal_id` (NOT `goal_id` — that's a separate column used by goal contributions, which are *transfers*, not expenses).

──────── Action button row (Back + Next/Save) ────────
transaction-sheet.tsx:885-894 (details step) — same shape on every step
```
<div className="flex gap-2">
  <Button variant="outline" onClick={handleBack}
    className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted rounded-xl">
    Back
  </Button>
  <Button onClick={handleSave} disabled={saving || !canProceedAmount || !!sfOverpayment}
    className="flex-1 h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl ...">
    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTransaction ? 'Update' : 'Save'}
  </Button>
</div>
```
- Two equal-width buttons (`flex-1`), gap 8px, height 48px (`h-12`), `rounded-xl`.
- Back: outline variant, muted-foreground text, hover → muted bg.
- Primary: solid Sika gold #D4A017, navy text #0E1A2E, hover → darker gold #B8891A. Disabled state → muted bg + muted-foreground text.
- The first step's primary button is full-width (`w-full`) and 52px tall (`h-13`), with a `<ChevronRight>` icon — see lines 513-519 of transaction-sheet.tsx.

══════════════════════════════════════════════════════════════
SUMMARY
══════════════════════════════════════════════════════════════

Files found and printed (8):
- src/components/transactions/transaction-sheet.tsx (the entire 933-line wizard, including all step bodies, step indicator, type pills wrapper, account chips, reconcile link, paid-from-target affordance — there are NO separate step components)
- src/components/transactions/amount-keypad.tsx (number pad + amount display + type pills, all in one)
- src/components/transactions/category-grid.tsx (expense/adjustment 3-col grid with inline `<button>` cards — there is NO CategoryCard component)
- src/components/transactions/income-category-picker.tsx (hardcoded INCOME_PRESETS + custom "Other" row)
- src/components/transactions/insufficient-balance-sheet.tsx (over-spend modal — visual reference for sheet styling)
- src/components/transactions/add-transaction-fab.tsx (the only entry point — there is NO /transactions/new route)
- src/components/ui/sheet.tsx (the wrapping sheet primitive — base styling for the bottom-sheet pattern; uses base-ui-react Dialog)
- src/app/globals.css (Sika brand color tokens, .amount class, font tokens)

Plus extracted snippets from src/lib/accounts.ts (ACCOUNT_TYPE_CONFIG) and src/lib/constants.ts (CURRENCY_SYMBOL) — these power the visual chip/keypad treatment.

Files NOT found (with what I searched for):
- Multi-step orchestrator (add-transaction-flow.tsx / add-transaction-wizard.tsx): searched `grep -rn "currentStep\|wizard\|setStep" src/components/transactions/ src/app/(app)/transactions/`. Only hits inside `transaction-sheet.tsx`. NO orchestrator file exists. The "wizard" is 5 conditional `{step === 'X' && (...)}` JSX blocks inside one component, all driven by a single `const [step, setStep] = useState<Step>('amount')` (line 61).
- AmountStep / CategoryStep / DetailsStep components: searched `grep -rn "How much\|What for\|Any details" src/components/transactions/`. Only hits are the literal title strings inside `transaction-sheet.tsx`'s `stepTitles` map (lines 425-428). NO step component files exist.
- StepIndicator / step-indicator: searched `grep -rn "StepIndicator\|step-indicator" src/`. Zero hits. The 3-segment progress capsule is 11 inline lines at `transaction-sheet.tsx:451-461`.
- NumberPad / number-pad: searched `grep -rn "NumberPad\|number-pad\|numberPad" src/`. Zero hits. The keypad lives **inside** `amount-keypad.tsx` (not a separate file). The whole `AmountKeypad` component IS the amount display + type pills + number pad combined.
- AccountChip / account-chip / AccountSelector / account-selector: searched `grep -rn "AccountChip\|account-chip\|AccountSelector\|account-selector" src/`. Zero hits. Account chip rows are inline in three places inside `transaction-sheet.tsx`: lines 486-510 (amount step), 558-602 (transfer step), 635-655 (reconcile step).
- TypePills / TypeSelector: searched `grep -rn "TypePills\|TypeSelector" src/`. Zero hits. The pill row is inline in `amount-keypad.tsx:46-61`.
- "Reconcile an account balance instead" component: only inline at `transaction-sheet.tsx:474-483`. NO separate component.
- "Paid from a target?" component: only inline at `transaction-sheet.tsx:752-883`. NO separate component.
- CategoryCard / category-card: searched `grep -rn "CategoryCard\|category-card" src/`. Zero hits. The single-card UI is the inline `<button>` inside `.map(...)` in `category-grid.tsx` (lines 35-51).
- module CSS files alongside transaction components: `find src/components/transactions -name "*.css" -o -name "*.module.css"`. Zero hits. Only `src/app/globals.css` defines `.amount` (mono+tabular-nums utility) and `.glow-accent` and `.gradient-card`.

Critical visual design notes:

- **Color tokens used.** The transaction sheet uses a mix of CSS variables (semantic tokens) and **hardcoded hex literals** (Sika brand). The hardcoded hex values are:
  - `#D4A017` — Sika gold/accent (active pill bg, primary button, step-indicator complete, focus rings, "From fund" badge text). Hover → `#B8891A`.
  - `#0E1A2E` — Sika navy (text on gold buttons; never used for body text in this sheet).
  - `#00D9A3` — success green (positive adjustment diff bg/text).
  - `#F43F5E` — danger red (negative adjustment diff, error labels, overpayment warning).
  - `#FBBF24` — warning amber (insufficient-balance-sheet header icon).
  - `#60A5FA` — blue (insufficient-balance-sheet "use a different account" icon, pending recurring).
  - `#A78BFA` — purple (insufficient-balance-sheet reconcile icon — different from anything else).
  - `#141416`, `#1C1C1F`, `#27272A`, `#52525B`, `#71717A`, `#FAFAFA`, `#A1A1AA` — neutral greys hardcoded **only** in `insufficient-balance-sheet.tsx` (this single file ignores the design tokens and uses Zinc-style hexes throughout, while every other transaction file uses semantic tokens like `bg-card`, `text-foreground`, `text-muted-foreground`). Flag for iOS — this sheet's palette will look different from the rest in dark mode.
  - Semantic tokens used elsewhere: `bg-card`, `bg-muted`, `bg-input`, `text-foreground`, `text-muted-foreground`, `text-muted-foreground/60`, `border-border`, `border-[#D4A017]`. These map to the `:root` / `.dark` blocks in `globals.css` (printed above):
    - `--card`: light #FFFFFF, dark #162540
    - `--muted`: light #F1EFE6, dark #1E2F47
    - `--muted-foreground`: light #6B7A8D, dark #8A9BB5
    - `--foreground`: light #0E1A2E, dark #F8ECC2
    - `--border`: light #E2DCCF, dark #1E3050
    - `--background`: light #FBF7EE, dark #0E1A2E
    - `--accent`: #D4A017 (both modes)
  - Account chip colors come from `ACCOUNT_TYPE_CONFIG` (printed above): teal/amber/grey/blue/purple/orange.
  - **NOT used in the transaction sheet:** none of the `--color-sika-*` brand-token aliases declared in `globals.css` (e.g. `bg-sika-base`). The component code reaches around them with raw hex.

- **Typography weights and sizes.**
  - Sheet title: `text-lg font-bold` = 18px, 700.
  - Step section labels ("Account", "From", "To", "Date", "Note (optional)"): `text-sm` (14px) or `text-xs` (12px), regular weight, muted color.
  - "Reconcile an account balance instead" affordance: `text-xs` (12px), muted-foreground at 60% alpha.
  - "Paid from a target?": `text-xs` (12px), muted-foreground.
  - Amount value (in keypad): `text-5xl` (48px), `font-bold` (700), Geist Mono via `.amount` class (font-variant-numeric: tabular-nums; letter-spacing: -0.02em).
  - Currency symbol next to amount: `text-3xl` (30px), `font-mono`, muted-foreground.
  - Number pad keys: `text-xl` (20px), `font-semibold` (600).
  - Type pills: `text-xs` (12px), `font-medium` (500), `capitalize`.
  - Account chips (amount step): `text-xs` (12px), `font-medium` (500).
  - Account chips (transfer step): `text-sm` (14px), `font-medium` (500).
  - Category card label: `text-xs` (12px), `font-medium` (500), `line-clamp-2`.
  - Buttons (Next/Save/Update): `text-base` (16px), `font-semibold` (600).
  - Body text (e.g. inside HintCard): `text-xs` (12px), `leading-relaxed`.

- **Animation libraries in use.** framer-motion (`framer-motion@^11`) is imported but used **sparingly**:
  - Step transitions: NONE. When `step` changes, the conditional render swaps with no transition — there is no slide, fade, or crossfade between steps. iOS should mirror this (instant swap) unless intentionally improving on web.
  - "Paid from a target?" expand/collapse: framer-motion `<AnimatePresence>` + `motion.div` with `initial/animate/exit` of `opacity` + `height: 'auto' | 0`, 200ms duration (transaction-sheet.tsx:784-879).
  - FAB pulse: framer-motion box-shadow keyframe loop on a sibling overlay div (add-transaction-fab.tsx:26-30), 2s infinite easeOut.
  - FAB mount: spring `stiffness: 300, damping: 20, delay: 0.6` (add-transaction-fab.tsx:16).
  - Sheet itself: animation comes from base-ui-react via `data-side=bottom:data-starting-style:translate-y-[2.5rem]` Tailwind classes (sheet.tsx:56) — pure CSS transition, 200ms ease-in-out.
  - Number pad press: `active:scale-95` Tailwind utility, no framer-motion.

- **Custom hooks specific to the wizard.** None named `useTransactionFlow` or similar. The sheet uses these app-wide hooks (printed in transaction-sheet.tsx imports):
  - `useTransactionStore()` (Zustand) — drives `isLogSheetOpen`, `editingTransaction`, `reconcileContext`, `categories`, `dashboardStats`, plus mutators.
  - `useAuthStore()` — `user`, `accounts`.
  - `useCurrency()` — `format`, `symbol` for currency formatting (note: `amount-keypad.tsx` does NOT use this; it imports `CURRENCY_SYMBOL` directly — see Critical bug below).
  - `useHaptics()` — `medium()` haptic on save, `light()` on FAB tap.
  - There is no `useStep`, no `useTransactionFlow`, no `useWizard`. The step machine is 14 raw `useState` declarations at lines 61-89 of `transaction-sheet.tsx`.

- **Component composition: how step state is passed.** It is **not passed** — there is no parent → child step wiring. All five step bodies are inline siblings inside the single `TransactionSheet` component, and they all read the same `step` local state via `{step === 'amount' && <jsx/>}` gates. The two child components that do exist (`AmountKeypad`, `CategoryGrid`, `IncomeCategoryPicker`, `InsufficientBalanceSheet`) take props (value/onChange/type/onTypeChange for keypad; categories/selectedId/onSelect/transactionType for grid; etc.) — they don't know about the wizard. So: **no context, no URL state, no props drilling for steps.** Everything is local `useState`.

- **Reconcile flow: dismiss or transform inline?** **Transforms the SAME sheet inline.** Evidence:
  - `handleTypeChange('adjustment')` at `transaction-sheet.tsx:170-172` simply calls `setTxType('adjustment'); setStep('reconcile');` — same component instance, just a different conditional branch.
  - The "Reconcile an account balance instead" link (`transaction-sheet.tsx:474-483`) calls exactly that handler.
  - The reconcile-from-accounts-list flow (clicking Scale icon on `/accounts`) calls `useTransactionStore.getState().openReconcileSheet({ accountId, sikaBalance })` (`accounts/page.tsx:199`); the store action sets `reconcileContext`, opens the same `TransactionSheet`, and the sheet's mount-effect (lines 122-127) reads `reconcileContext` and goes straight to `step='reconcile'`. Same sheet, same instance.
  - The reconcile-from-insufficient-balance flow (`handleInsufficientReconcile`, `transaction-sheet.tsx:211-215`) calls the same `openReconcileSheet`. Closes the InsufficientBalanceSheet sub-modal but keeps the parent `TransactionSheet` open and switches it into reconcile mode.

- **Paid-from-target: how `paid_from_goal_id` is set, what triggers it.**
  - **Only manual.** There is zero auto-set logic. The user must:
    1. Reach step `details` with `txType === 'expense'`.
    2. Have at least one active target-type goal (`sinkingFundGoals.length > 0`); otherwise the affordance is hidden entirely (`transaction-sheet.tsx:752`).
    3. Click "Paid from a target?" to expand (`setSfExpanded(true)`, line 758).
    4. Pick a goal from the native `<select>` (line 801-812). The onChange writes `setPaidFromGoalId(e.target.value || null)`.
  - The selected `paidFromGoalId` is passed straight to the insert payload at line 274: `paid_from_goal_id: txType === 'expense' ? paidFromGoalId : null`.
  - On save, if `paidFromGoalId` is set AND the goal is target-type AND not yet completed, the post-insert side-effect chain re-fetches the goal's contributions+payments (lines 328-355) and may mark the goal as complete (`update goals.completed_at`) — but this is AFTER the insert, not part of how the column is set.
  - The user can only pick from goals where `goal_type === 'target' && !completed_at && !is_archived` (filter at line 102 of the same file). Perpetual / "Life Savings" goals are explicitly excluded — see the inline footnote on line 817 and the popover hint at line 779.

(Plus the bonus finding from the previous fetch, just to keep it surfaced:)

- **Critical visual-bug to flag for iOS:** `amount-keypad.tsx` hardcodes `CURRENCY_SYMBOL` (= '₵') at the top of the keypad, but the rest of the app uses the dynamic `useCurrency().symbol` (which respects `profile.currency`). A user on web who set their currency to USD will see a `$` everywhere else but `₵` on the keypad. This is in `amount-keypad.tsx:33`. iOS should use the dynamic symbol via the equivalent currency hook everywhere, including the keypad amount display.
