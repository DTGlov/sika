import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { Profile, IncomeSource } from '@/types';
import type { Account } from '@/types/account';
import type { Streaks } from '@/types/streak';
import type { Momentum } from '@/types/momentum';
import type { UserBadge } from '@/types/badge';

interface BadgeCelebrationItem {
  userBadgeId: string;
  badgeId: string;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  incomeSources: IncomeSource[];
  accounts: Account[];
  dismissedHints: string[];
  hintsLoaded: boolean;
  streaks: Streaks | null;
  momentum: Momentum | null;
  userBadges: UserBadge[];
  badgeCelebrationQueue: BadgeCelebrationItem[];
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setIncomeSources: (sources: IncomeSource[]) => void;
  setAccounts: (accounts: Account[]) => void;
  setDismissedHints: (hints: string[]) => void;
  addDismissedHint: (hintId: string) => void;
  setStreaks: (streaks: Streaks | null) => void;
  setMomentum: (momentum: Momentum | null) => void;
  setUserBadges: (badges: UserBadge[]) => void;
  enqueueBadgeCelebrations: (badges: UserBadge[]) => void;
  shiftBadgeCelebration: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  incomeSources: [],
  accounts: [],
  dismissedHints: [],
  hintsLoaded: false,
  streaks: null,
  momentum: null,
  userBadges: [],
  badgeCelebrationQueue: [],
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setIncomeSources: (incomeSources) => set({ incomeSources }),
  setAccounts: (accounts) => set({ accounts }),
  setDismissedHints: (dismissedHints) => set({ dismissedHints, hintsLoaded: true }),
  addDismissedHint: (hintId) =>
    set((s) => ({ dismissedHints: s.dismissedHints.includes(hintId) ? s.dismissedHints : [...s.dismissedHints, hintId] })),
  setStreaks: (streaks) => set({ streaks }),
  setMomentum: (momentum) => set({ momentum }),
  setUserBadges: (userBadges) => set({ userBadges }),
  enqueueBadgeCelebrations: (badges) =>
    set((s) => ({
      badgeCelebrationQueue: [
        ...s.badgeCelebrationQueue,
        ...badges
          .filter(b => !s.badgeCelebrationQueue.some(q => q.userBadgeId === b.id))
          .map(b => ({ userBadgeId: b.id, badgeId: b.badge_id })),
      ],
    })),
  shiftBadgeCelebration: () =>
    set((s) => ({ badgeCelebrationQueue: s.badgeCelebrationQueue.slice(1) })),
  reset: () => set({
    user: null, profile: null, incomeSources: [], accounts: [],
    dismissedHints: [], hintsLoaded: false, streaks: null, momentum: null,
    userBadges: [], badgeCelebrationQueue: [],
  }),
}));
