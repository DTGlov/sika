'use client';

import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatCurrencyCompact } from '@/lib/format/currency';
import { getCurrencySymbol } from '@/lib/currencies';

export function useCurrency() {
  const profile = useAuthStore(s => s.profile);
  const currencyCode = profile?.currency ?? 'GHS';
  const symbol = getCurrencySymbol(currencyCode);

  const format = (amount: number) => formatCurrency(amount, currencyCode);
  const formatCompact = (amount: number) => formatCurrencyCompact(amount, currencyCode);

  return { currencyCode, symbol, format, formatCompact };
}
