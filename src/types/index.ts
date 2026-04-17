export type TransactionType = 'expense' | 'income' | 'transfer';
export type BucketName = 'needs' | 'wants' | 'future';
export type IncomeFrequency = 'monthly' | 'weekly' | 'biweekly' | 'irregular';

export type { AccountType, Account, AccountRef } from './account';

export interface IncomeSource {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  expected_day: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  monthly_income: number;
  currency: string;
  needs_percent: number;
  wants_percent: number;
  future_percent: number;
  cycle_start_day?: number; // 1-28, default 1; optional until migration runs
  created_at: string;
  updated_at: string;
}

export interface BudgetBucket {
  id: string;
  user_id: string;
  name: BucketName;
  display_name: string;
  color: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  bucket_id: string | null;
  name: string;
  icon: string | null;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  bucket?: BudgetBucket | null;
}

import type { AccountRef } from './account';

export interface Transaction {
  id: string;
  user_id: string;
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  amount: number;
  type: TransactionType;
  note: string | null;
  transaction_date: string;
  created_at: string;
  category?: Category | null;
  account?: AccountRef | null;
  to_account?: AccountRef | null;
}

export interface DashboardStats {
  totalSpentToday: number;
  totalSpentThisMonth: number;
  totalSpentLastMonth: number;
  bucketSpend: Record<BucketName, number>;
  bucketLimits: Record<BucketName, number>;
  weeklySpend: { date: string; amount: number }[];
  recentTransactions: Transaction[];
  accountBalances: Record<string, number>;
}

export interface TransactionFormValues {
  amount: number;
  type: TransactionType;
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  note: string;
  transaction_date: string;
}
