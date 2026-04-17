'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useTransactionStore } from '@/stores/transaction-store';

export function AddTransactionFab() {
  const { openLogSheet } = useTransactionStore();

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.6 }}
      whileTap={{ scale: 0.92 }}
      onClick={() => openLogSheet()}
      className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[#00D9A3] text-[#0A0A0B] shadow-lg flex items-center justify-center"
      style={{ boxShadow: '0 0 0 0 rgba(0,217,163,0.4)' }}
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
