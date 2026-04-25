export type TransactionType = 'expense' | 'income' | 'transfer' | 'adjustment';
export type BucketName = 'needs' | 'wants' | 'savings';
export type CategoryType = 'expense' | 'income' | 'adjustment' | 'transfer' | 'system';
export type IncomeFrequency = 'monthly' | 'weekly' | 'biweekly' | 'irregular';
export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export type { AccountType, Account, AccountRef } from './account';
export type { GoalType, Goal, GoalProgress } from './goal';
export type { Streaks, StreakUpdateResult } from './streak';
export type { CardTheme } from './card-theme';

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
  savings_percent: number;
  cycle_start_day?: number;
  accounts_banner_dismissed?: boolean;
  card_theme?: import('./card-theme').CardTheme;
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
  category_type: CategoryType;
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
  generated_from_recurring?: string | null;
  goal_id?: string | null;
  paid_from_goal_id?: string | null;
  category?: Category | null;
  account?: AccountRef | null;
  to_account?: AccountRef | null;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  type: 'expense' | 'income';
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  schedule_day: number | null;
  auto_log: boolean;
  last_generated_date: string | null;
  is_active: boolean;
  is_paused: boolean;
  created_at: string;
  updated_at: string;
  account?: AccountRef | null;
  category?: Category | null;
}

export interface IncomeNudge {
  incomeSource: IncomeSource;
  dueDate: string; // YYYY-MM-DD
}

export interface DashboardStats {
  totalSpentToday: number;
  totalSpentThisMonth: number;
  totalSpentLastMonth: number;
  totalReceived: number;
  totalSpentActual: number;
  cycleNet: number;
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
