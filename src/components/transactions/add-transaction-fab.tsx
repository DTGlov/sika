'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useTransactionStore } from '@/stores/transaction-store';
import { useHaptics } from '@/hooks/use-haptics';

export function AddTransactionFab() {
  const { openLogSheet } = useTransactionStore();
  const { light } = useHaptics();

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.6 }}
      whileTap={{ scale: 0.92 }}
      onClick={() => { light(); openLogSheet(); }}
      aria-label="Log a transaction"
      // Mobile: centered, lifted ~112px + safe-area above the bottom nav
      // Desktop: fixed bottom-right corner, no bottom nav
      className="fixed z-40 w-14 h-14 rounded-full bg-[#00D9A3] text-[#0A0A0B] shadow-lg flex items-center justify-center
        bottom-[calc(5.4375rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2
        md:bottom-6 md:left-auto md:right-6 md:translate-x-0"
    >
      <motion.div
        animate={{ boxShadow: ['0 0 0 0 rgba(0,217,163,0.4)', '0 0 0 12px rgba(0,217,163,0)'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        className="absolute inset-0 rounded-full"
      />
      <Plus className="w-6 h-6 relative z-10" strokeWidth={2.5} />
    </motion.button>
  );
}
