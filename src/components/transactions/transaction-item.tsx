'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Pencil, Scale, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useTransactionStore } from '@/stores/transaction-store';
import { formatTransactionDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';
import { revalidateForEntity } from '@/lib/revalidation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const { format } = useCurrency();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    const { error } = await supabase.from('transactions').delete().eq('id', txn.id);
    if (error) {
      toast.error('Failed to delete');
      setIsDeleting(false);
      return;
    }
    setShowDeleteDialog(false);
    setIsDeleting(false);
    setDeleting(true);
    removeTransaction(txn.id);
    revalidateForEntity('transaction');
    toast.success('Transaction deleted');
  }

  const txnLabel =
    txn.note ??
    (txn.type === 'transfer'
      ? `${txn.account?.name ?? '?'} → ${txn.to_account?.name ?? '?'}`
      : txn.type === 'adjustment'
      ? 'Balance adjustment'
      : (txn.category?.name ?? 'this transaction'));

  return (
    <>
      <AnimatePresence>
        {!deleting && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
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
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">
                    {txn.type === 'transfer'
                      ? `${txn.account?.name ?? '?'} → ${txn.to_account?.name ?? '?'}`
                      : txn.type === 'adjustment'
                      ? 'Balance Adjustment'
                      : (txn.category?.name ?? 'Uncategorized')}
                  </p>
                  {txn.type === 'adjustment' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium shrink-0">
                      adj
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  {txn.type !== 'transfer' && txn.account && (
                    <span className="text-muted-foreground/70 text-xs truncate">{txn.account.name}</span>
                  )}
                  {txn.generated_from_recurring && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#60A5FA18] text-[#60A5FA] font-medium shrink-0">
                      Auto
                    </span>
                  )}
                  {txn.paid_from_goal_id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#00D9A318] text-[#D4A017] font-medium shrink-0">
                      🎯 From fund
                    </span>
                  )}
                  {txn.note && <p className="text-muted-foreground text-xs truncate">{txn.note}</p>}
                </div>
                <p className="text-muted-foreground text-xs truncate">{formatTransactionDate(txn.transaction_date)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <p className={`amount text-sm font-semibold whitespace-nowrap ${
                txn.type === 'income' ? 'text-[#D4A017]' :
                txn.type === 'transfer' ? 'text-muted-foreground' :
                txn.type === 'adjustment' ? (txn.amount >= 0 ? 'text-[#D4A017]' : 'text-[#F43F5E]') :
                'text-foreground'
              }`}>
                {txn.type === 'income' ? '+' :
                 txn.type === 'transfer' ? '' :
                 txn.type === 'adjustment' ? (txn.amount >= 0 ? '+' : '') :
                 '-'}{format(Math.abs(txn.amount))}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Transaction actions"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 p-2 -mr-2 rounded-full text-muted-foreground hover:bg-muted/40 active:bg-muted/60 transition-colors"
                    />
                  }
                >
                  <MoreVertical className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => openLogSheet(txn)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-[#F43F5E] focus:text-[#F43F5E]"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this transaction?</DialogTitle>
            <DialogDescription>
              This will permanently remove &ldquo;{txnLabel}&rdquo; ({format(Math.abs(txn.amount))}) from your records. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-[#F43F5E] text-white hover:bg-[#E11D48]"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
