import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isToday, isYesterday } from 'date-fns';
import { CURRENCY_SYMBOL } from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatGHS(amount: number): string {
  return `${CURRENCY_SYMBOL}${amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatGHSCompact(amount: number): string {
  if (amount >= 1_000_000) {
    return `${CURRENCY_SYMBOL}${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${CURRENCY_SYMBOL}${(amount / 1_000).toFixed(1)}K`;
  }
  return formatGHS(amount);
}

export function formatTransactionDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, MMM d');
}

export function formatShortDate(dateStr: string): string {
  return format(new Date(dateStr + 'T00:00:00'), 'MMM d');
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function percentDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function getProgressColor(percent: number): string {
  if (percent < 70) return '#00D9A3';
  if (percent < 90) return '#FBBF24';
  return '#F43F5E';
}
