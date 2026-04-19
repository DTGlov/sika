'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import { useAuthStore } from '@/stores/auth-store';
import { TransactionSheet } from '@/components/transactions/transaction-sheet';
import { AddTransactionFab } from '@/components/transactions/add-transaction-fab';
import { BottomNav } from './bottom-nav';
import { SideRail } from './side-rail';

interface AppShellProps {
  user: User;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const { setUser } = useAuthStore();
  const pathname = usePathname();

  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  return (
    <div className="min-h-screen bg-[#0A0A0B] overflow-x-hidden">
      <SideRail />

      {/* Main content — indented right to clear the side rail on md+ */}
      <div
        className="md:pl-16 lg:pl-60 md:pb-0"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </div>

      <AddTransactionFab />
      <TransactionSheet />
      <BottomNav />
    </div>
  );
}
