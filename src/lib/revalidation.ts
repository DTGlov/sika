// Revalidation matrix — which mutations affect which client-side views.
//
// In this client-side Next.js app, "revalidation" means bumping mutationCount
// in the Zustand store. Every page that fetches data has a useEffect whose
// deps include mutationCount, so it automatically re-fetches when anything
// mutates. revalidateForEntity() is the single call-site for this.
//
// Mutations → affected routes:
//   transaction (create/update/delete) → /dashboard, /transactions, /accounts
//   account    (create/update/delete) → /accounts, /dashboard, /transactions, /settings
//   transfer   (create/update/delete) → /dashboard, /transactions, /accounts
//   adjustment (create/update/delete) → /dashboard, /transactions, /accounts
//   category   (create/update/delete) → /settings, /dashboard, /transactions
//   incomeSource (create/update/delete) → /settings, /dashboard
//   profile    (update)              → /dashboard, /settings
//   bucket     (update)              → /dashboard, /settings

export const REVALIDATION_MAP = {
  transaction:       ['/dashboard', '/transactions', '/accounts', '/streaks'],
  account:           ['/accounts', '/dashboard', '/transactions', '/settings'],
  transfer:          ['/dashboard', '/transactions', '/accounts'],
  adjustment:        ['/dashboard', '/transactions', '/accounts'],
  category:          ['/settings', '/dashboard', '/transactions'],
  incomeSource:      ['/settings', '/dashboard'],
  profile:           ['/dashboard', '/settings'],
  bucket:            ['/dashboard', '/settings'],
  goal:                  ['/goals', '/dashboard'],
  goal_contribution:     ['/goals', '/dashboard', '/accounts', '/transactions', '/streaks'],
  sinking_fund_payment:  ['/goals', '/dashboard', '/accounts', '/transactions'],
  card_theme:            ['/dashboard', '/settings'],
} as const;

import { useTransactionStore } from '@/stores/transaction-store';

export function revalidateForEntity(_entity: keyof typeof REVALIDATION_MAP): void {
  useTransactionStore.getState().bumpMutation();
}
