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
                  ? 'border-[#00D9A3] bg-[#00D9A3]/10'
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
            ? 'border-[#00D9A3] bg-[#00D9A3]/10'
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
