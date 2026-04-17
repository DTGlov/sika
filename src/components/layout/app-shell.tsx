'use client';

import { useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuthStore } from '@/stores/auth-store';
import { TransactionSheet } from '@/components/transactions/transaction-sheet';
import { AddTransactionFab } from '@/components/transactions/add-transaction-fab';

interface AppShellProps {
  user: User;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const { setUser } = useAuthStore();

  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      {children}
      <AddTransactionFab />
      <TransactionSheet />
    </div>
  );
}
