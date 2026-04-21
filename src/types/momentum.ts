export type TierId = 'seedling' | 'sprout' | 'grower' | 'builder' | 'achiever' | 'seeker';

export interface TierConfig {
  id: TierId;
  label: string;
  emoji: string;
  color: string;
  minPoints: number;
}

export const TIERS: TierConfig[] = [
  { id: 'seedling', label: 'Seedling', emoji: '🌱', color: '#71717A', minPoints: 0 },
  { id: 'sprout',   label: 'Sprout',   emoji: '🌿', color: '#4ADE80', minPoints: 100 },
  { id: 'grower',   label: 'Grower',   emoji: '🌳', color: '#34D399', minPoints: 300 },
  { id: 'builder',  label: 'Builder',  emoji: '🔨', color: '#FBBF24', minPoints: 700 },
  { id: 'achiever', label: 'Achiever', emoji: '⭐', color: '#F97316', minPoints: 1500 },
  { id: 'seeker',   label: 'Seeker',   emoji: '💎', color: '#00D9A3', minPoints: 3000 },
];

export type MomentumEventType =
  | 'transaction_logged'
  | 'transaction_logged_via_nudge'
  | 'goal_contribution'
  | 'goal_completed'
  | 'account_reconciled'
  | 'logging_streak_7_days';

export const MOMENTUM_AMOUNTS: Record<MomentumEventType, number> = {
  transaction_logged: 5,
  transaction_logged_via_nudge: 10,
  goal_contribution: 15,
  goal_completed: 50,
  account_reconciled: 10,
  logging_streak_7_days: 25,
};

export interface Momentum {
  user_id: string;
  total_points: number;
  tier: TierId;
  created_at: string;
  updated_at: string;
}

export interface MomentumEvent {
  id: string;
  user_id: string;
  event_type: MomentumEventType;
  points: number;
  created_at: string;
}

export interface MomentumUpdateResult {
  momentum: Momentum;
  points_awarded: number;
  previous_total: number;
  tier_changed: boolean;
  new_tier: TierConfig;
  previous_tier: TierConfig;
}
