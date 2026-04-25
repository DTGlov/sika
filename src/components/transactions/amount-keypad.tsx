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
