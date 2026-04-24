'use client';

import { useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuthStore } from '@/stores/auth-store';
import { identifyUser } from '@/lib/analytics/identify';
import { TransactionSheet } from '@/components/transactions/transaction-sheet';
import { AddTransactionFab } from '@/components/transactions/add-transaction-fab';
import { BottomNav } from './bottom-nav';
import { SideRail } from './side-rail';
import { BadgeCelebrationHost } from '@/components/badges/badge-celebration-host';

interface AppShellProps {
  user: User;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const { setUser, profile } = useAuthStore();

  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  useEffect(() => {
    identifyUser(user.id, {
      name: profile?.full_name ?? user.user_metadata?.full_name ?? undefined,
      email: user.email ?? undefined,
    });
  }, [user, profile]);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SideRail />

      {/* Main content — indented right to clear the side rail on md+ */}
      <div
        className="md:pl-16 lg:pl-60 md:pb-0"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </div>

      <AddTransactionFab />
      <TransactionSheet />
      <BadgeCelebrationHost />
      <BottomNav />
    </div>
  );
}
