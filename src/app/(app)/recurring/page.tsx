'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Plus, Pencil, Pause, Play, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  format, differenceInCalendarDays, startOfDay, isBefore, addDays, parse,
} from 'date-fns';
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
import { HintCard } from '@/components/hint-card';
import type { RecurringTransaction, RecurringFrequency } from '@/types';

type TabValue = 'expense' | 'income' | 'paused';

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

function parseDateStr(str: string): Date {
  const d = parse(str, 'yyyy-MM-dd', new Date());
  return startOfDay(d);
}

interface DueDateInfo {
  label: string;
  color: string;
  bold: boolean;
}

function getDueDateInfo(item: RecurringTransaction, today: Date): DueDateInfo {
  const todayStart = startOfDay(today);

  if (!item.auto_log) {
    const overdueFrom = item.last_generated_date
      ? addDays(parseDateStr(item.last_generated_date), 1)
      : parseDateStr(item.start_date);
    const firstMissed = getNextDueDate({ ...item, last_generated_date: null }, overdueFrom);
    if (firstMissed && isBefore(startOfDay(firstMissed), todayStart)) {
      return {
        label: `OVERDUE since ${format(firstMissed, 'MMM d')}`,
        color: 'var(--destructive)',
        bold: true,
      };
    }
  }

  const nextDue = getNextDueDate(item, today);
  if (!nextDue) return { label: 'No future occurrences', color: 'var(--text-fg-disabled)', bold: false };

  const diffDays = differenceInCalendarDays(startOfDay(nextDue), todayStart);

  if (diffDays === 0) return { label: 'TODAY', color: 'var(--accent)', bold: true };
  if (diffDays === 1) return { label: 'Tomorrow', color: 'var(--text-fg)', bold: false };
  if (diffDays <= 7) return { label: `in ${diffDays} days (${format(nextDue, 'EEE MMM d')})`, color: 'var(--text-fg)', bold: false };
  if (diffDays <= 30) return { label: format(nextDue, 'EEE MMM d'), color: 'var(--text-fg-muted)', bold: false };
  return { label: format(nextDue, 'MMM d, yyyy'), color: 'var(--text-fg-disabled)', bold: false };
}

function getNextDueTimestamp(item: RecurringTransaction, today: Date): number {
  const next = getNextDueDate(item, today);
  return next ? next.getTime() : Infinity;
}

interface RecurringCardProps {
  item: RecurringTransaction;
  accentColor: string;
  today: Date;
  onTogglePause: (item: RecurringTransaction) => void;
  onEdit: (item: RecurringTransaction) => void;
  onDelete: (id: string) => void;
}

function RecurringCard({ item, accentColor, today, onTogglePause, onEdit, onDelete }: RecurringCardProps) {
  const dueInfo = getDueDateInfo(item, today);
  const name = item.note ?? item.category?.name ?? FREQUENCY_LABELS[item.frequency];

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden"
      style={{ borderLeftColor: accentColor, borderLeftWidth: 3 }}
    >
      {/* Due date header */}
      <div className="px-4 pt-3 pb-2.5 flex items-center justify-between">
        <p
          className="text-xs font-semibold"
          style={{ color: dueInfo.color, fontWeight: dueInfo.bold ? 700 : 500 }}
        >
          {item.is_paused ? 'Paused' : `Next due: ${dueInfo.label}`}
        </p>
        <div className="flex items-center gap-1">
          {!item.auto_log && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-fg-secondary/10 text-fg-secondary font-medium">
              Nudge
            </span>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Name + amount + actions */}
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-fg font-bold text-base truncate">{name}</p>
          <p className="text-fg-disabled text-xs mt-0.5">
            {item.account?.name}
            {item.category ? ` · ${item.category.name}` : ''}
            {' · '}{formatScheduleSummary(item)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <p className="text-lg font-bold tabular-nums" style={{ color: accentColor }}>
            {formatGHS(item.amount)}
          </p>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onTogglePause(item)}
              className="w-8 h-8 rounded-lg text-fg-muted hover:text-fg flex items-center justify-center transition-colors"
              title={item.is_paused ? 'Resume' : 'Pause'}
            >
              {item.is_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onEdit(item)}
              className="w-8 h-8 rounded-lg text-fg-muted hover:text-fg flex items-center justify-center transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="w-8 h-8 rounded-lg text-fg-muted hover:text-destructive flex items-center justify-center transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecurringContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { mutationCount } = useTransactionStore();
  useProfile();
  const supabase = createClient();

  const tab = (searchParams.get('tab') ?? 'expense') as TabValue;

  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<RecurringTransaction | undefined>();
  const [defaultModalValues, setDefaultModalValues] = useState<Record<string, unknown>>({});
  const [syncing, setSyncing] = useState(false);

  const today = new Date();

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('recurring_transactions')
        .select('*, account:accounts!account_id(id,name,type,color,icon), category:categories(*, bucket:budget_buckets(*))')
        .eq('user_id', user!.id)
        .eq('is_active', true);
      setItems((data ?? []) as RecurringTransaction[]);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mutationCount]);

  function setTab(t: TabValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const expenseItems = useMemo(
    () => items
      .filter(i => i.type === 'expense' && !i.is_paused)
      .sort((a, b) => getNextDueTimestamp(a, today) - getNextDueTimestamp(b, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  );

  const incomeItems = useMemo(
    () => items
      .filter(i => i.type === 'income' && !i.is_paused)
      .sort((a, b) => getNextDueTimestamp(a, today) - getNextDueTimestamp(b, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  );

  const pausedItems = useMemo(
    () => items
      .filter(i => i.is_paused)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [items]
  );

  const TABS: { value: TabValue; label: string; count: number }[] = [
    { value: 'expense', label: 'Expense', count: expenseItems.length },
    { value: 'income', label: 'Income', count: incomeItems.length },
    { value: 'paused', label: 'Paused', count: pausedItems.length },
  ];

  const visibleItems =
    tab === 'expense' ? expenseItems :
    tab === 'income' ? incomeItems :
    pausedItems;

  const accentColor = tab === 'income' ? 'var(--accent)' : tab === 'expense' ? 'var(--destructive)' : 'var(--color-sika-wants)';

  async function handleSync() {
    if (!user) return;
    setSyncing(true);
    await generateDueTransactions(supabase, user.id);
    revalidateForEntity('transaction');
    setSyncing(false);
    toast.success('Recurring transactions synced');
  }

  async function handleTogglePause(item: RecurringTransaction) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_paused: !i.is_paused } : i));
    const { error } = await supabase
      .from('recurring_transactions')
      .update({ is_paused: !item.is_paused })
      .eq('id', item.id);
    if (error) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_paused: item.is_paused } : i));
      toast.error('Failed to update');
      return;
    }
    toast.success(item.is_paused ? 'Resumed' : 'Paused');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring transaction? Already-generated transactions are kept.')) return;
    setItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase
      .from('recurring_transactions')
      .update({ is_active: false })
      .eq('id', id);
    if (error) {
      toast.error('Failed to delete');
      revalidateForEntity('transaction');
    } else {
      toast.success('Deleted');
    }
  }

  function openTemplate(tmpl: typeof TEMPLATES[0]) {
    setEditItem(undefined);
    setDefaultModalValues(tmpl.defaults);
    setModalOpen(true);
  }

  return (
    <div className="max-w-2xl mx-auto pb-8 px-4 pt-6 md:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-fg">Recurring</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-9 h-9 rounded-xl text-fg-muted hover:text-fg hover:bg-elevated flex items-center justify-center transition-colors"
            title="Sync now"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <Button
            onClick={() => {
              setEditItem(undefined);
              setDefaultModalValues(tab !== 'paused' ? { type: tab } : {});
              setModalOpen(true);
            }}
            className="h-9 px-3 text-sm bg-accent hover:bg-accent/90 text-accent-foreground font-medium rounded-xl gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      {/* Intro hint */}
      <HintCard
        hintId="recurring_intro"
        title="Automate your money rhythm"
        body="Recurring transactions auto-log on a schedule — set up subscriptions, salary, and bills once and Sika handles the rest. Use nudges for variable amounts (utilities, side hustles)."
        icon={RefreshCw}
        variant="banner"
        className="mb-4"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-surface border border-border rounded-xl p-1 overflow-x-auto scrollbar-none">
        {TABS.map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className="flex-1 h-9 rounded-lg text-xs font-medium transition-colors min-w-[80px] whitespace-nowrap"
            style={{
              backgroundColor: tab === value ? 'var(--bg-elevated)' : 'transparent',
              color: tab === value ? 'var(--text-fg)' : 'var(--text-fg-muted)',
            }}
          >
            {label}
            {count > 0 && (
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: tab === value ? accentColor + '22' : 'var(--border)',
                  color: tab === value ? accentColor : 'var(--text-fg-disabled)',
                }}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-2xl bg-surface" />)}
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyState tab={tab} onAdd={() => {
          setEditItem(undefined);
          setDefaultModalValues(tab !== 'paused' ? { type: tab } : {});
          setModalOpen(true);
        }} />
      ) : (
        <div className="space-y-3">
          {visibleItems.map(item => (
            <RecurringCard
              key={item.id}
              item={item}
              accentColor={item.type === 'income' ? 'var(--accent)' : 'var(--destructive)'}
              today={today}
              onTogglePause={handleTogglePause}
              onEdit={(i) => { setEditItem(i); setModalOpen(true); }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Quick templates strip */}
      {!loading && (
        <div className="mt-8">
          <p className="text-fg-muted text-xs font-medium uppercase tracking-wider mb-3">Quick templates</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {TEMPLATES.map(tmpl => (
              <button
                key={tmpl.label}
                onClick={() => openTemplate(tmpl)}
                className="flex items-center gap-2 bg-surface border border-border rounded-2xl px-3 py-2 shrink-0 hover:border-border/60 transition-colors"
              >
                <span className="text-base">{tmpl.emoji}</span>
                <span className="text-fg-secondary text-xs whitespace-nowrap">{tmpl.label}</span>
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

function EmptyState({ tab, onAdd }: { tab: TabValue; onAdd: () => void }) {
  if (tab === 'paused') {
    return (
      <div className="text-center py-16 text-fg-muted text-sm">
        Nothing paused right now.
      </div>
    );
  }

  const isExpense = tab === 'expense';
  return (
    <div className="text-center py-16 px-4">
      <p className="text-fg-muted text-sm mb-4">
        {isExpense
          ? 'No recurring expenses yet. Add things like rent, subscriptions, or bills.'
          : 'No recurring income yet. Add your salary or regular allowances.'}
      </p>
      <Button
        onClick={onAdd}
        className="h-9 px-4 text-sm bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-xl"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Add {isExpense ? 'expense' : 'income'}
      </Button>
    </div>
  );
}

export default function RecurringPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-3">
          <div className="h-8 w-36 rounded-xl bg-surface animate-pulse" />
          <div className="h-11 rounded-xl bg-surface animate-pulse" />
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-surface animate-pulse" />)}
        </div>
      }
    >
      <RecurringContent />
    </Suspense>
  );
}
