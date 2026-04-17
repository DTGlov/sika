'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { formatGHS, formatTransactionDate } from '@/lib/utils';
import type { Transaction } from '@/types';

interface RecentTransactionsProps {
  transactions: Transaction[];
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.55, ease: 'easeOut' }}
      className="bg-[#141416] border border-[#27272A] rounded-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A]">
        <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider">Recent</p>
        <Link
          href="/transactions"
          className="flex items-center gap-1 text-[#00D9A3] text-xs font-medium hover:text-[#00F5B8] transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="px-5 py-10 text-center text-[#71717A] text-sm">
          No transactions yet. Tap + to log one.
        </div>
      ) : (
        <div className="divide-y divide-[#27272A]">
          {transactions.map((txn) => (
            <div key={txn.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-[#1C1C1F] transition-colors">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                  style={{
                    background: txn.category?.bucket
                      ? `${txn.category.bucket.color}22`
                      : '#1C1C1F',
                  }}
                >
                  {txn.category?.icon ? (
                    <span className="text-sm">{getIconEmoji(txn.category.icon)}</span>
                  ) : (
                    <span className="text-[#71717A] text-xs">?</span>
                  )}
                </div>
                <div>
                  <p className="text-[#FAFAFA] text-sm font-medium">
                    {txn.category?.name ?? 'Uncategorized'}
                  </p>
                  <p className="text-[#71717A] text-xs">{formatTransactionDate(txn.transaction_date)}</p>
                </div>
              </div>
              <p className={`amount text-sm font-semibold ${txn.type === 'income' ? 'text-[#00D9A3]' : 'text-[#FAFAFA]'}`}>
                {txn.type === 'income' ? '+' : '-'}{formatGHS(txn.amount)}
              </p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function getIconEmoji(icon: string): string {
  const map: Record<string, string> = {
    home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
    car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
    'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
    'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
    gift: '🎁',
  };
  return map[icon] ?? '💸';
}
