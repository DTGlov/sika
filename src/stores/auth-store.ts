import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { Profile, IncomeSource } from '@/types';
import type { Account } from '@/types/account';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  incomeSources: IncomeSource[];
  accounts: Account[];
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setIncomeSources: (sources: IncomeSource[]) => void;
  setAccounts: (accounts: Account[]) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  incomeSources: [],
  accounts: [],
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setIncomeSources: (incomeSources) => set({ incomeSources }),
  setAccounts: (accounts) => set({ accounts }),
  reset: () => set({ user: null, profile: null, incomeSources: [], accounts: [] }),
}));
