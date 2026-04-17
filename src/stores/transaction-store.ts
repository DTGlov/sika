import { create } from 'zustand';
import type { Transaction, Category, DashboardStats } from '@/types';

interface TransactionState {
  transactions: Transaction[];
  categories: Category[];
  dashboardStats: DashboardStats | null;
  isLogSheetOpen: boolean;
  editingTransaction: Transaction | null;
  mutationCount: number;
  setTransactions: (txns: Transaction[]) => void;
  setCategories: (cats: Category[]) => void;
  setDashboardStats: (stats: DashboardStats) => void;
  openLogSheet: (txn?: Transaction) => void;
  closeLogSheet: () => void;
  addTransaction: (txn: Transaction) => void;
  updateTransaction: (txn: Transaction) => void;
  removeTransaction: (id: string) => void;
  bumpMutation: () => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: [],
  categories: [],
  dashboardStats: null,
  isLogSheetOpen: false,
  editingTransaction: null,
  mutationCount: 0,
  setTransactions: (transactions) => set({ transactions }),
  setCategories: (categories) => set({ categories }),
  setDashboardStats: (dashboardStats) => set({ dashboardStats }),
  openLogSheet: (txn) => set({ isLogSheetOpen: true, editingTransaction: txn ?? null }),
  closeLogSheet: () => set({ isLogSheetOpen: false, editingTransaction: null }),
  addTransaction: (txn) =>
    set((s) => ({ transactions: [txn, ...s.transactions] })),
  updateTransaction: (txn) =>
    set((s) => ({
      transactions: s.transactions.map((t) => (t.id === txn.id ? txn : t)),
    })),
  removeTransaction: (id) =>
    set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
  bumpMutation: () => set((s) => ({ mutationCount: s.mutationCount + 1 })),
}));
