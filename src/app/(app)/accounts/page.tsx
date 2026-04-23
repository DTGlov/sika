'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Star, Scale, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { useTransactionStore } from '@/stores/transaction-store';
import { ACCOUNT_TYPE_CONFIG, computeAccountBalances } from '@/lib/accounts';
import { formatGHS } from '@/lib/utils';
import { revalidateForEntity } from '@/lib/revalidation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountModal } from '@/components/accounts/account-modal';
import { HintCard } from '@/components/hint-card';
import type { Account } from '@/types/account';

export default function AccountsPage() {
  const { user, accounts, setAccounts } = useAuthStore();
  const { mutationCount, openReconcileSheet } = useTransactionStore();
  const supabase = createClient();
  useProfile();

  const [balances, setBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | undefined>();

  // Delete-with-reassign state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [txnCountForDelete, setTxnCountForDelete] = useState(0);
  const [reassignToId, setReassignToId] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Compute balances — re-runs on any mutation (transfers, new transactions, etc.)
  useEffect(() => {
    if (!user || accounts.length === 0) return;

    async function loadBalances() {
      setBalancesLoading(true);
      const { data } = await supabase
        .from('transactions')
        .select('account_id, to_account_id, amount, type')
        .eq('user_id', user!.id);
      setBalances(computeAccountBalances(accounts, data ?? []));
      setBalancesLoading(false);
    }
    loadBalances();
  // mutationCount ensures balances re-fetch after any transaction mutation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accounts, mutationCount]);

  const totalBalance = accounts.reduce((sum, a) => sum + (balances[a.id] ?? a.opening_balance), 0);

  // Show accounts_intro hint only when all accounts still have the default 0 opening balance
  const allBalancesAreZero = accounts.length > 0 && accounts.every(a => a.opening_balance === 0);

  async function startDelete(acc: Account) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', acc.id);

    setTxnCountForDelete(count ?? 0);
    const otherAcc = accounts.find(a => a.id !== acc.id);
    setReassignToId(otherAcc?.id ?? '');
    setDeletingId(acc.id);
  }

  async function confirmDelete() {
    if (!deletingId || !user) return;
    setDeleteLoading(true);

    if (txnCountForDelete > 0 && reassignToId) {
      const { error: reassignErr } = await supabase
        .from('transactions')
        .update({ account_id: reassignToId })
        .eq('account_id', deletingId);
      if (reassignErr) {
        toast.error('Failed to reassign transactions');
        setDeleteLoading(false);
        return;
      }
    }

    const { error } = await supabase.from('accounts').delete().eq('id', deletingId);
    if (error) {
      toast.error('Failed to delete account');
      setDeleteLoading(false);
      return;
    }

    const updated = accounts.filter(a => a.id !== deletingId);
    setAccounts(updated);
    revalidateForEntity('account');
    setDeletingId(null);
    setDeleteLoading(false);
    toast.success('Account deleted');
  }

  function handleSaved(all: Account[]) {
    const active = all.filter(a => a.is_active);
    setAccounts(active);
  }

  const deletingAcc = accounts.find(a => a.id === deletingId);
  const reassignOptions = accounts.filter(a => a.id !== deletingId);

  return (
    <div className="max-w-2xl mx-auto pb-8 px-4 pt-6 md:px-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <Button
          onClick={() => { setEditAccount(undefined); setModalOpen(true); }}
          className="h-9 px-3 text-sm bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-medium rounded-xl gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {/* Accounts intro hint — only when all accounts are still at ₵0 opening balance */}
      {allBalancesAreZero && (
        <HintCard
          hintId="accounts_intro"
          title="Set your real balances"
          body="These accounts represent where your money physically lives. Set the actual current balance for each (your bank, MoMo, cash) so Sika tracks your money accurately. Tap any account → Edit → Opening balance."
          icon={Wallet}
          variant="banner"
          className="mb-4"
        />
      )}

      {/* Reconcile reminder hint */}
      <HintCard
        hintId="accounts_reconcile_reminder"
        title="Keep balances accurate"
        body="Tap the scale icon on any account to reconcile — compare what Sika shows against your actual bank balance and log any difference as an adjustment."
        icon={Scale}
        variant="banner"
        className="mb-4"
      />

      {/* Total balance */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <p className="text-muted-foreground text-sm mb-1">Total balance</p>
        {balancesLoading ? (
          <Skeleton className="h-9 w-40 bg-muted" />
        ) : (
          <p className="text-3xl font-bold text-foreground tabular-nums">{formatGHS(totalBalance)}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">The money currently in your accounts.</p>
      </div>

      {/* Account list */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No accounts yet. Tap "Add" to create one.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => {
            const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
            const balance = balances[acc.id] ?? acc.opening_balance;
            return (
              <div
                key={acc.id}
                className="bg-card border border-border rounded-2xl p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full shrink-0 self-center"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: cfg.color + '18' }}
                    >
                      {cfg.emoji}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-foreground font-semibold text-sm">{acc.name}</p>
                        {acc.is_default && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                            style={{ backgroundColor: cfg.color + '22', color: cfg.color }}>
                            <Star className="w-2.5 h-2.5" /> Default
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs capitalize">{cfg.label}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openReconcileSheet({ accountId: acc.id, sikaBalance: balance })}
                      className="w-8 h-8 rounded-lg text-muted-foreground hover:text-muted-foreground/80 flex items-center justify-center transition-colors"
                      title="Reconcile balance"
                    >
                      <Scale className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setEditAccount(acc); setModalOpen(true); }}
                      className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!acc.is_default && (
                      <button
                        onClick={() => startDelete(acc)}
                        className="w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border">
                  {balancesLoading ? (
                    <Skeleton className="h-6 w-28 bg-muted" />
                  ) : (
                    <p className="text-xl font-bold tabular-nums" style={{ color: cfg.color }}>
                      {formatGHS(balance)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      <AccountModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditAccount(undefined); }}
        editAccount={editAccount}
        currentBalance={editAccount ? (balances[editAccount.id] ?? editAccount.opening_balance) : undefined}
        onSaved={handleSaved}
      />

      {/* Delete confirmation overlay */}
      {deletingId && deletingAcc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeletingId(null)} />
          <div className="relative z-10 bg-card border border-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-foreground font-bold text-base mb-2">Delete &quot;{deletingAcc.name}&quot;?</h3>
            {txnCountForDelete > 0 ? (
              <>
                <p className="text-muted-foreground text-sm mb-4">
                  This account has {txnCountForDelete} transaction{txnCountForDelete !== 1 ? 's' : ''}.
                  Choose an account to reassign them to:
                </p>
                <div className="space-y-2 mb-4">
                  {reassignOptions.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setReassignToId(a.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left"
                      style={{
                        borderColor: reassignToId === a.id ? ACCOUNT_TYPE_CONFIG[a.type].color : 'var(--border)',
                        backgroundColor: reassignToId === a.id ? ACCOUNT_TYPE_CONFIG[a.type].color + '11' : 'var(--muted)',
                      }}
                    >
                      <span className="text-lg">{ACCOUNT_TYPE_CONFIG[a.type].emoji}</span>
                      <span className="text-foreground text-sm">{a.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm mb-4">This account has no transactions. It will be permanently deleted.</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeletingId(null)}
                className="flex-1 h-11 border-border text-muted-foreground hover:bg-muted rounded-xl">
                Cancel
              </Button>
              <Button onClick={confirmDelete}
                disabled={deleteLoading || (txnCountForDelete > 0 && !reassignToId)}
                className="flex-1 h-11 bg-[#F43F5E] hover:bg-[#E03354] text-white font-semibold rounded-xl">
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
