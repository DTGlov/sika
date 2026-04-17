import type { IncomeSource } from '@/types';

export function calculateMonthlyEquivalent(
  amount: number,
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'irregular'
): number {
  switch (frequency) {
    case 'monthly': return amount;
    case 'weekly': return amount * 4.333; // avg weeks per month
    case 'biweekly': return amount * 2.167;
    case 'irregular': return amount; // assume monthly-ish
  }
}

export function totalMonthlyIncome(sources: IncomeSource[]): number {
  return sources
    .filter(s => s.is_active)
    .reduce((sum, s) => sum + calculateMonthlyEquivalent(s.amount, s.frequency), 0);
}

export const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  irregular: 'Irregular',
};

export const FREQUENCY_COLORS: Record<string, string> = {
  monthly: '#00D9A3',
  weekly: '#60A5FA',
  biweekly: '#FBBF24',
  irregular: '#A1A1AA',
};

export const DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// TODO(phase-1.5): Auto-log income transactions based on expected_day
// TODO(phase-1.5): Notify user "Your allowance is due today"
// TODO(phase-2): Show income streak (did my allowance hit on time?)
