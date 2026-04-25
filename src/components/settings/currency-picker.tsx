'use client';

import { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { ALL_CURRENCIES, POPULAR_CURRENCIES, type CurrencyOption } from '@/lib/currencies';

interface CurrencyPickerProps {
  value: string;
  onChange: (code: string) => void;
}

export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  const [search, setSearch] = useState('');

  const ordered = useMemo<CurrencyOption[]>(() => {
    const lowered = search.toLowerCase();
    if (!lowered) {
      const popular = POPULAR_CURRENCIES
        .map(code => ALL_CURRENCIES.find(c => c.code === code)!)
        .filter(Boolean);
      const rest = ALL_CURRENCIES.filter(c => !POPULAR_CURRENCIES.includes(c.code));
      return [...popular, ...rest];
    }
    return ALL_CURRENCIES.filter(
      c =>
        c.code.toLowerCase().includes(lowered) ||
        c.name.toLowerCase().includes(lowered) ||
        c.symbol.toLowerCase().includes(lowered),
    );
  }, [search]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search currencies…"
        className="w-full bg-card border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="overflow-y-auto max-h-[50vh] space-y-0.5">
        {ordered.map(currency => {
          const selected = currency.code === value;
          return (
            <button
              key={currency.code}
              onClick={() => onChange(currency.code)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors text-left ${
                selected
                  ? 'bg-accent/10 border border-accent/40'
                  : 'hover:bg-muted/50 border border-transparent'
              }`}
            >
              <div>
                <p className={`text-sm font-medium ${selected ? 'text-accent' : 'text-foreground'}`}>
                  {currency.code}
                </p>
                <p className="text-muted-foreground text-xs">{currency.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">{currency.symbol}</span>
                {selected && <Check className="w-4 h-4 text-accent" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
