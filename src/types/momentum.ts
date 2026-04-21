export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface TierConfig {
  id: Tier;
  name: string;
  threshold: number;
  color: string;
  glowColor: string;
  iconName: string;
}

export const TIERS: Record<Tier, TierConfig> = {
  bronze:   { id: 'bronze',   name: 'Bronze',   threshold: 0,     color: '#CD7F32', glowColor: 'rgba(205, 127, 50, 0.3)',  iconName: 'Medal'  },
  silver:   { id: 'silver',   name: 'Silver',   threshold: 500,   color: '#C0C0C0', glowColor: 'rgba(192, 192, 192, 0.3)', iconName: 'Award'  },
  gold:     { id: 'gold',     name: 'Gold',     threshold: 2000,  color: '#D4AF37', glowColor: 'rgba(212, 175, 55, 0.35)', iconName: 'Trophy' },
  platinum: { id: 'platinum', name: 'Platinum', threshold: 5000,  color: '#E5E4E2', glowColor: 'rgba(229, 228, 226, 0.4)', iconName: 'Crown'  },
  diamond:  { id: 'diamond',  name: 'Diamond',  threshold: 10000, color: '#B9F2FF', glowColor: 'rgba(185, 242, 255, 0.4)', iconName: 'Gem'    },
};

export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

export type MomentumEventType =
  | 'transaction_logged'
  | 'transaction_logged_via_nudge'
  | 'goal_contribution'
  | 'goal_completed'
  | 'account_reconciled'
  | 'logging_streak_7_days'
  | 'bucket_within_limit_full_month';

export const MOMENTUM_AMOUNTS: Record<MomentumEventType, number> = {
  transaction_logged:               2,
  transaction_logged_via_nudge:     5,
  goal_contribution:               10,
  account_reconciled:               3,
  logging_streak_7_days:           50,
  goal_completed:                 100,
  bucket_within_limit_full_month:  75,
};

export interface Momentum {
  user_id: string;
  total_points: number;
  tier: Tier;
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
