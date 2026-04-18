import type { Account, AccountType } from '@/types/account';

export const ACCOUNT_TYPE_CONFIG: Record<AccountType, { label: string; color: string; emoji: string }> = {
  bank:       { label: 'Bank',       color: '#00D9A3', emoji: '🏦' },
  momo:       { label: 'MoMo',       color: '#FBBF24', emoji: '📱' },
  cash:       { label: 'Cash',       color: '#A1A1AA', emoji: '💵' },
  savings:    { label: 'Savings',    color: '#60A5FA', emoji: '🐷' },
  investment: { label: 'Investment', color: '#8B5CF6', emoji: '📈' },
  other:      { label: 'Other',      color: '#F97316', emoji: '👛' },
};

type BalanceTxn = {
  account_id: string | null;
  to_account_id: string | null;
  amount: number;
  type: string;
};

export function computeAccountBalances(
  accounts: Account[],
  transactions: BalanceTxn[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const acc of accounts) {
    balances[acc.id] = acc.opening_balance;
  }

  for (const txn of transactions) {
    if (txn.type === 'income' && txn.account_id && txn.account_id in balances) {
      balances[txn.account_id] += txn.amount;
    } else if (txn.type === 'expense' && txn.account_id && txn.account_id in balances) {
      balances[txn.account_id] -= txn.amount;
    } else if (txn.type === 'transfer') {
      if (txn.account_id && txn.account_id in balances) {
        balances[txn.account_id] -= txn.amount;
      }
      if (txn.to_account_id && txn.to_account_id in balances) {
        balances[txn.to_account_id] += txn.amount;
      }
    } else if (txn.type === 'adjustment') {
      // Signed amount: positive = balance increases, negative = balance decreases
      if (txn.account_id && txn.account_id in balances) {
        balances[txn.account_id] += txn.amount;
      }
    }
  }

  return balances;
}
