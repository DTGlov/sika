'use client';

import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatGHSCompact, percentDelta } from '@/lib/utils';

interface SpendCardProps {
  title: string;
  amount: number;
  compareAmount?: number;
  compareLabel?: string;
  index?: number;
}

export function SpendCard({ title, amount, compareAmount, compareLabel, index = 0 }: SpendCardProps) {
  const delta = compareAmount !== undefined ? percentDelta(amount, compareAmount) : null;
  const isUp = delta !== null && delta > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 + index * 0.05, ease: 'easeOut' }}
      className="bg-card border border-border rounded-2xl p-5 hover:bg-muted transition-colors"
    >
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">{title}</p>
      <p className="amount text-2xl font-bold text-foreground">{formatGHSCompact(amount)}</p>
      {delta !== null && (
        <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${isUp ? 'text-[#F43F5E]' : 'text-[#D4A017]'}`}>
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{Math.abs(delta)}% vs {compareLabel ?? 'last period'}</span>
        </div>
      )}
    </motion.div>
  );
}
