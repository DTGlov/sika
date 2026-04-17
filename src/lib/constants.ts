import type { BucketName } from '@/types';

export const CURRENCY = 'GHS';
export const CURRENCY_SYMBOL = '₵';
export const DEFAULT_MONTHLY_INCOME = 11500;

export const BUCKET_CONFIG: Record<BucketName, { label: string; color: string; description: string }> = {
  needs: {
    label: 'Needs',
    color: '#00D9A3',
    description: 'Essentials',
  },
  wants: {
    label: 'Wants',
    color: '#FBBF24',
    description: 'Lifestyle',
  },
  future: {
    label: 'Future',
    color: '#60A5FA',
    description: 'Savings & Investments',
  },
};

export const DEFAULT_BUCKET_PERCENTS: Record<BucketName, number> = {
  needs: 50,
  wants: 30,
  future: 20,
};

export const TRANSACTION_TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
] as const;
