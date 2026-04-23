'use client';

import { Plus, ArrowLeftRight, Scale, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatGHS } from '@/lib/utils';

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
  if (!open) return null;

  const isNegative = accountBalance < 0;
  const isEmpty = accountBalance === 0;
  const isInsufficient = accountBalance > 0 && amountRequested > accountBalance;

  const headline = isNegative
    ? `${accountName} is underwater`
    : isEmpty
    ? `${accountName} is empty`
    : isInsufficient
    ? `${accountName} only has ${formatGHS(accountBalance)}`
    : `${accountName} is empty`;

  const description = isNegative
    ? `Balance is ${formatGHS(accountBalance)} — you're already overspent.`
    : isEmpty
    ? `${accountName} has no money to spend right now.`
    : isInsufficient
    ? `You're trying to spend ${formatGHS(amountRequested)}, but only ${formatGHS(accountBalance)} is available.`
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
              <div className="w-8 h-8 rounded-lg bg-[#00D9A3]/10 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-[#00D9A3]" />
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
