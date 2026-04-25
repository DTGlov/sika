import type { BucketName } from '@/types';

export const CURRENCY = 'GHS';
export const CURRENCY_SYMBOL = '₵';
export const DEFAULT_MONTHLY_INCOME = 11500;

export const BUCKET_CONFIG: Record<BucketName, { label: string; color: string; description: string; explanation: string }> = {
  needs: {
    label: 'Needs',
    color: '#00D9A3',
    description: 'Essentials',
    explanation: "Expenses you can't reasonably cut — rent, utilities, groceries, transport, healthcare, gym, family support.",
  },
  wants: {
    label: 'Wants',
    color: '#FBBF24',
    description: 'Lifestyle',
    explanation: 'Optional quality-of-life expenses — eating out, entertainment, subscriptions, hobbies, shopping.',
  },
  savings: {
    label: 'Savings',
    color: '#60A5FA',
    description: 'Savings & Investments',
    explanation: 'Money committed to future-you this month — transfers to savings/investment accounts, goal contributions, or Savings-category expenses.',
  },
};

export const DEFAULT_BUCKET_PERCENTS: Record<BucketName, number> = {
  needs: 50,
  wants: 30,
  savings: 20,
};

export const TRANSACTION_TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
] as const;
