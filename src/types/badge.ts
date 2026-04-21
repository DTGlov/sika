export type BadgeRarity = 'common' | 'rare';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon_name: string; // Lucide icon name
  rarity: BadgeRarity;
  sort_order: number;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  unlocked_at: string;
  celebration_shown: boolean;
}

export interface BadgeWithUnlockStatus extends Badge {
  unlocked: boolean;
  unlocked_at: string | null;
}

// LOCKED — do not modify this constant
export const BADGES_CATALOG = {
  first_steps:         { name: 'First Steps',         description: 'Log your first transaction',                    iconName: 'Footprints',    rarity: 'common' as const, sortOrder: 1 },
  week_warrior:        { name: 'Week Warrior',        description: 'Maintain a 7-day logging streak',               iconName: 'Flame',         rarity: 'common' as const, sortOrder: 2 },
  goal_getter:         { name: 'Goal Getter',         description: 'Complete your first target goal',               iconName: 'Target',        rarity: 'common' as const, sortOrder: 3 },
  consistent_saver:    { name: 'Consistent Saver',    description: 'Maintain a 4-week savings streak',              iconName: 'PiggyBank',     rarity: 'common' as const, sortOrder: 4 },
  century_club:        { name: 'Century Club',        description: 'Log 100 total transactions',                    iconName: 'Hash',          rarity: 'rare' as const,   sortOrder: 5 },
  month_of_discipline: { name: 'Month of Discipline', description: 'Maintain a 30-day logging streak',              iconName: 'CalendarCheck', rarity: 'rare' as const,   sortOrder: 6 },
  seeker:              { name: 'Seeker',              description: 'Complete 5 target goals',                       iconName: 'Compass',       rarity: 'rare' as const,   sortOrder: 7 },
  safety_net:          { name: 'Safety Net',          description: 'Life Savings reaches 3x your monthly Needs',    iconName: 'Shield',        rarity: 'rare' as const,   sortOrder: 8 },
};

export type BadgeId = keyof typeof BADGES_CATALOG;

// Rarity visual config
export const RARITY_CONFIG = {
  common: {
    frameColor: '#00D9A3',
    frameGradient: 'radial-gradient(circle, rgba(0,217,163,0.15) 0%, rgba(0,217,163,0) 70%)',
    glowIntensity: 0.2,
  },
  rare: {
    frameColor: '#D4AF37',
    frameGradient: 'radial-gradient(circle, rgba(212,175,55,0.25) 0%, rgba(212,175,55,0) 70%)',
    glowIntensity: 0.35,
  },
};
