'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Pause, Play, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { useTransactionStore } from '@/stores/transaction-store';
import { formatGHS } from '@/lib/utils';
import { revalidateForEntity } from '@/lib/revalidation';
import {
  formatScheduleSummary, getNextDueDate, generateDueTransactions, FREQUENCY_LABELS,
} from '@/lib/recurring';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RecurringModal } from '@/components/recurring/recurring-modal';
import type { RecurringTransaction, RecurringFrequency } from '@/types';

type TabFilter = 'all' | 'active' | 'paused';

const TEMPLATES: Array<{
  label: string;
  emoji: string;
  defaults: { type: 'expense' | 'income'; frequency: RecurringFrequency; schedule_day?: number; auto_log: boolean; note: string };
}> = [
  { label: 'Monthly rent', emoji: '🏠', defaults: { type: 'expense', frequency: 'monthly', auto_log: true, note: 'Monthly rent' } },
  { label: 'Subscription', emoji: '📱', defaults: { type: 'expense', frequency: 'monthly', auto_log: true, note: 'Subscription' } },
  { label: 'Monthly salary', emoji: '💼', defaults: { type: 'income', frequency: 'monthly', auto_log: false, note: 'Monthly salary' } },
  { label: 'Weekly allowance', emoji: '💰', defaults: { type: 'income', frequency: 'weekly', schedule_day: 1, auto_log: false, note: 'Weekly allowance' } },
  { label: 'Utility bill', emoji: '⚡', defaults: { type: 'expense', frequency: 'monthly', auto_log: false, note: 'Utility bill' } },
];

export default function RecurringPage() {
  const { user } = useAuthStore();
  const { mutationCount } = useTransactionStore();
  useProfile();
  const supabase = createClient();

  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<RecurringTransaction | undefined>();
  const [defaultModalValues, setDefaultModalValues] = useState<Record<string, unknown>>({});
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('recurring_transactions')
        .select('*, account:accounts!account_id(id,name,type,color,icon), category:categories(*, bucket:budget_buckets(*))')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      setItems((data ?? []) as RecurringTransaction[]);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mutationCount]);

  async function handleSync() {
    if (!user) return;
    setSyncing(true);
    await generateDueTransactions(supabase, user.id);
    revalidateForEntity('transaction');
    setSyncing(false);
    toast.success('Recurring transactions synced');
  }

  async function handleTogglePause(item: RecurringTransaction) {
    const { error } = await supabase
      .from('recurring_transactions')
      .update({ is_paused: !item.is_paused })
      .eq('id', item.id);
    if (error) { toast.error('Failed to update'); return; }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_paused: !i.is_paused } : i));
    toast.success(item.is_paused ? 'Resumed' : 'Paused');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring transaction? Already-generated transactions are kept.')) return;
    const { error } = await supabase
      .from('recurring_transactions')
      .update({ is_active: false })
      .eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    toast.success('Deleted');
  }

  function openTemplate(tmpl: typeof TEMPLATES[0]) {
    setEditItem(undefined);
    setDefaultModalValues(tmpl.defaults);
    setModalOpen(true);
  }

  const filtered = items.filter(i => {
    if (tab === 'active') return !i.is_paused;
    if (tab === 'paused') return i.is_paused;
    return true;
  });

  const incomeItems = filtered.filter(i => i.type === 'income');
  const expenseItems = filtered.filter(i => i.type === 'expense');

  const today = new Date();

  return (
    <div className="max-w-2xl mx-auto pb-8 px-4 pt-6 md:px-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#FAFAFA]">Recurring</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-9 h-9 rounded-xl text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F] flex items-center justify-center transition-colors"
            title="Sync now"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <Button
            onClick={() => { setEditItem(undefined); setDefaultModalValues({}); setModalOpen(true); }}
            className="h-9 px-3 text-sm bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-medium rounded-xl gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[#141416] border border-[#27272A] rounded-xl p-1">
        {(['active', 'paused', 'all'] as TabFilter[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 h-8 rounded-lg text-xs font-medium capitalize transition-colors"
            style={{
              backgroundColor: tab === t ? '#1C1C1F' : 'transparent',
              color: tab === t ? '#FAFAFA' : '#71717A',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Quick-add templates */}
      {items.length === 0 && !loading && (
        <div className="mb-5">
          <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider mb-3">Common templates</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMPLATES.map(tmpl => (
              <button
                key={tmpl.label}
                onClick={() => openTemplate(tmpl)}
                className="flex items-center gap-2 bg-[#141416] border border-[#27272A] rounded-2xl p-3 text-left hover:border-[#3F3F46] transition-colors"
              >
                <span className="text-xl shrink-0">{tmpl.emoji}</span>
                <span className="text-[#A1A1AA] text-xs leading-tight">{tmpl.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl bg-[#141416]" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#71717A] text-sm">
          {tab === 'paused' ? 'No paused recurring transactions.' : 'No recurring transactions yet. Tap "Add" to create one.'}
        </div>
      ) : (
        <div className="space-y-6">
          {[
            { label: 'Income', list: incomeItems, color: '#00D9A3' },
            { label: 'Expense', list: expenseItems, color: '#F43F5E' },
          ].map(({ label, list, color }) =>
            list.length === 0 ? null : (
              <div key={label}>
                <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider mb-2">{label}</p>
                <div className="space-y-3">
                  {list.map(item => {
                    const nextDue = getNextDueDate(item, today);
                    return (
                      <div
                        key={item.id}
                        className="bg-[#141416] border border-[#27272A] rounded-2xl p-4"
                        style={{ borderLeftColor: color, borderLeftWidth: 3, opacity: item.is_paused ? 0.6 : 1 }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[#FAFAFA] font-semibold text-sm truncate">
                                {item.note ?? item.category?.name ?? FREQUENCY_LABELS[item.frequency]}
                              </p>
                              {item.is_paused && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#FBBF2418] text-[#FBBF24] font-medium shrink-0">
                                  Paused
                                </span>
                              )}
                              {!item.auto_log && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#A1A1AA18] text-[#A1A1AA] font-medium shrink-0">
                                  Nudge
                                </span>
                              )}
                            </div>
                            <p className="text-[#71717A] text-xs mt-0.5">{formatScheduleSummary(item)}</p>
                            <p className="text-[#52525B] text-xs">
                              {item.account?.name}
                              {item.category ? ` · ${item.category.name}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleTogglePause(item)}
                              className="w-8 h-8 rounded-lg text-[#71717A] hover:text-[#FAFAFA] flex items-center justify-center transition-colors"
                              title={item.is_paused ? 'Resume' : 'Pause'}
                            >
                              {item.is_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => { setEditItem(item); setModalOpen(true); }}
                              className="w-8 h-8 rounded-lg text-[#71717A] hover:text-[#FAFAFA] flex items-center justify-center transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="w-8 h-8 rounded-lg text-[#71717A] hover:text-[#F43F5E] flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-[#27272A] flex items-center justify-between">
                          <p className="text-xl font-bold tabular-nums" style={{ color }}>
                            {formatGHS(item.amount)}
                          </p>
                          <p className="text-[#52525B] text-xs">
                            {nextDue
                              ? `Next: ${format(nextDue, 'MMM d, yyyy')}`
                              : 'No future occurrences'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Templates shown when items exist too */}
      {items.length > 0 && (
        <div className="mt-8">
          <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider mb-3">Quick templates</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {TEMPLATES.map(tmpl => (
              <button
                key={tmpl.label}
                onClick={() => openTemplate(tmpl)}
                className="flex items-center gap-2 bg-[#141416] border border-[#27272A] rounded-2xl px-3 py-2 shrink-0 hover:border-[#3F3F46] transition-colors"
              >
                <span className="text-base">{tmpl.emoji}</span>
                <span className="text-[#A1A1AA] text-xs whitespace-nowrap">{tmpl.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <RecurringModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(undefined); }}
        editItem={editItem}
        defaultValues={defaultModalValues as Parameters<typeof RecurringModal>[0]['defaultValues']}
        onSaved={() => revalidateForEntity('transaction')}
      />
    </div>
  );
}
