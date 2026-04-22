'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Pencil, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useTransactionStore } from '@/stores/transaction-store';
import { formatGHS, formatTransactionDate } from '@/lib/utils';
import { revalidateForEntity } from '@/lib/revalidation';
import type { Transaction } from '@/types';

function getIconEmoji(icon: string | null): string {
  if (!icon) return '💸';
  const map: Record<string, string> = {
    home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
    car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
    'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
    'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
    gift: '🎁',
  };
  return map[icon] ?? '💸';
}

interface TransactionItemProps {
  transaction: Transaction;
}

export function TransactionItem({ transaction: txn }: TransactionItemProps) {
  const { removeTransaction, openLogSheet } = useTransactionStore();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this transaction?')) return;
    setDeleting(true);
    const { error } = await supabase.from('transactions').delete().eq('id', txn.id);
    if (error) {
      toast.error('Failed to delete');
      setDeleting(false);
      return;
    }
    removeTransaction(txn.id);
    revalidateForEntity('transaction');
    toast.success('Deleted');
  }

  return (
    <AnimatePresence>
      {!deleting && (
        <motion.div
          layout
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center justify-between px-4 py-3.5 hover:bg-muted transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{
                background: txn.type === 'adjustment'
                  ? 'color-mix(in srgb, var(--muted-foreground) 10%, transparent)'
                  : txn.category?.bucket
                  ? `${txn.category.bucket.color}22`
                  : 'var(--card)',
              }}
            >
              {txn.type === 'adjustment' ? <Scale className="w-5 h-5 text-muted-foreground" /> : getIconEmoji(txn.category?.icon ?? null)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-foreground text-sm font-medium">
                  {txn.type === 'transfer'
                    ? `${txn.account?.name ?? '?'} → ${txn.to_account?.name ?? '?'}`
                    : txn.type === 'adjustment'
                    ? 'Balance Adjustment'
                    : (txn.category?.name ?? 'Uncategorized')}
                </p>
                {txn.type === 'adjustment' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                    adj
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {txn.type !== 'transfer' && txn.account && (
                  <span className="text-muted-foreground/70 text-xs">{txn.account.name}</span>
                )}
                {txn.generated_from_recurring && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#60A5FA18] text-[#60A5FA] font-medium">
                    Auto
                  </span>
                )}
                {txn.paid_from_goal_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#00D9A318] text-[#00D9A3] font-medium">
                    🎯 From fund
                  </span>
                )}
                {txn.note && <p className="text-muted-foreground text-xs">{txn.note}</p>}
              </div>
              <p className="text-muted-foreground text-xs">{formatTransactionDate(txn.transaction_date)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <p className={`amount text-sm font-semibold ${
              txn.type === 'income' ? 'text-[#00D9A3]' :
              txn.type === 'transfer' ? 'text-muted-foreground' :
              txn.type === 'adjustment' ? (txn.amount >= 0 ? 'text-[#00D9A3]' : 'text-[#F43F5E]') :
              'text-foreground'
            }`}>
              {txn.type === 'income' ? '+' :
               txn.type === 'transfer' ? '' :
               txn.type === 'adjustment' ? (txn.amount >= 0 ? '+' : '') :
               '-'}{formatGHS(Math.abs(txn.amount))}
            </p>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => openLogSheet(txn)}
                className="w-8 h-8 rounded-lg bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDelete}
                className="w-8 h-8 rounded-lg bg-muted text-muted-foreground hover:text-[#F43F5E] flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
