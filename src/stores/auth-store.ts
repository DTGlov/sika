import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { Profile, IncomeSource } from '@/types';
import type { Account } from '@/types/account';
import type { Streaks } from '@/types/streak';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  incomeSources: IncomeSource[];
  accounts: Account[];
  dismissedHints: string[];
  hintsLoaded: boolean;
  streaks: Streaks | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setIncomeSources: (sources: IncomeSource[]) => void;
  setAccounts: (accounts: Account[]) => void;
  setDismissedHints: (hints: string[]) => void;
  addDismissedHint: (hintId: string) => void;
  setStreaks: (streaks: Streaks | null) => void;
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
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setIncomeSources: (incomeSources) => set({ incomeSources }),
  setAccounts: (accounts) => set({ accounts }),
  setDismissedHints: (dismissedHints) => set({ dismissedHints, hintsLoaded: true }),
  addDismissedHint: (hintId) =>
    set((s) => ({ dismissedHints: s.dismissedHints.includes(hintId) ? s.dismissedHints : [...s.dismissedHints, hintId] })),
  setStreaks: (streaks) => set({ streaks }),
  reset: () => set({ user: null, profile: null, incomeSources: [], accounts: [], dismissedHints: [], hintsLoaded: false, streaks: null }),
}));
