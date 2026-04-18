import type { Account } from '@/types/account';

export type GoalType = 'savings' | 'perpetual' | 'sinking_fund';

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  goal_type: GoalType;
  target_amount: number | null;
  deadline: string | null;
  funding_account_id: string;
  priority: number;
  is_active: boolean;
  is_archived: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalProgress {
  goal: Goal;
  current_amount: number;
  progress_percent: number | null;
  days_remaining: number | null;
  required_monthly_pace: number | null;
  required_weekly_pace: number | null;
  is_on_track: boolean | null;
  funding_account: Account;
}
