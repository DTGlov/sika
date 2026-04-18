export interface Streaks {
  user_id: string;
  logging_current: number;
  logging_longest: number;
  logging_last_date: string | null;
  savings_current: number;
  savings_longest: number;
  savings_last_week: string | null;
  freezes_banked: number;
  freezes_earned_total: number;
  logging_milestones_shown: number[];
  savings_milestones_shown: number[];
  created_at: string;
  updated_at: string;
}

export interface StreakUpdateResult {
  streaks: Streaks;
  logging_incremented: boolean;
  logging_broken: boolean;
  savings_incremented: boolean;
  savings_broken: boolean;
  freeze_used: boolean;
  freeze_earned: boolean;
  milestone_hit: number | null;
}
