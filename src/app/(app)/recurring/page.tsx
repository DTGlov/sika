'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pencil, Pause, Play, Trash2, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  format, differenceInCalendarDays, startOfDay, isBefore, addDays, parse,
} from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { useTransactionStore } from '@/stores/transaction-store';
import { useCurrency } from '@/hooks/use-currency';
import { revalidateForEntity } from '@/lib/revalidation';
import {
  formatScheduleSummary, getNextDueDate, generateDueTransactions, FREQUENCY_LABELS,
  isHandledThisInstance,
} from '@/lib/recurring';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RecurringModal } from '@/components/recurring/recurring-modal';
import { HintCard } from '@/components/hint-card';
import type { RecurringTransaction, RecurringFrequency } from '@/types';

type TabValue = 'expense' | 'paused';

// Recurring templates are expense-only by design. Income lives in
// income_sources (managed via Settings → Income) so it doesn't get
// double-modeled and double-prompt the user on the dashboard.
const TEMPLATES: Array<{
  label: string;
  emoji: string;
  defaults: { type: 'expense'; frequency: RecurringFrequency; schedule_day?: number; auto_log: boolean; note: string };
}> = [
  { label: 'Monthly rent', emoji: '🏠', defaults: { type: 'expense', frequency: 'monthly', auto_log: true, note: 'Monthly rent' } },
  { label: 'Subscription', emoji: '📱', defaults: { type: 'expense', frequency: 'monthly', auto_log: true, note: 'Subscription' } },
  { label: 'Utility bill', emoji: '⚡', defaults: { type: 'expense', frequency: 'monthly', auto_log: false, note: 'Utility bill' } },
  { label: 'Gym membership', emoji: '🏋️', defaults: { type: 'expense', frequency: 'monthly', auto_log: true, note: 'Gym membership' } },
  { label: 'Internet', emoji: '📶', defaults: { type: 'expense', frequency: 'monthly', auto_log: true, note: 'Internet' } },
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
        color: '#F43F5E',
        bold: true,
      };
    }
  }

  const nextDue = getNextDueDate(item, today);
  if (!nextDue) return { label: 'No future occurrences', color: 'var(--muted-foreground)', bold: false };

  const diffDays = differenceInCalendarDays(startOfDay(nextDue), todayStart);

  if (diffDays === 0) return { label: 'TODAY', color: '#00D9A3', bold: true };
  if (diffDays === 1) return { label: 'Tomorrow', color: 'var(--foreground)', bold: false };
  if (diffDays <= 7) return { label: `in ${diffDays} days (${format(nextDue, 'EEE MMM d')})`, color: 'var(--foreground)', bold: false };
  if (diffDays <= 30) return { label: format(nextDue, 'EEE MMM d'), color: 'var(--muted-foreground)', bold: false };
  return { label: format(nextDue, 'MMM d, yyyy'), color: 'var(--muted-foreground)', bold: false };
}

function getNextDueTimestamp(item: RecurringTransaction, today: Date): number {
  const next = getNextDueDate(item, today);
  return next ? next.getTime() : Infinity;
}

interface RecurringCardProps {
  item: RecurringTransaction;
  accentColor: string;
  today: Date;
  onOpen: (id: string) => void;
  onTogglePause: (item: RecurringTransaction) => void;
  onEdit: (item: RecurringTransaction) => void;
  onDelete: (id: string) => void;
}

function RecurringCard({ item, accentColor, today, onOpen, onTogglePause, onEdit, onDelete }: RecurringCardProps) {
  const { format } = useCurrency();
  const dueInfo = getDueDateInfo(item, today);
  const name = item.note ?? item.category?.name ?? FREQUENCY_LABELS[item.frequency];
  const handled = !item.auto_log && isHandledThisInstance(item, today);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Due date header */}
      <div className="px-4 pt-3 pb-2.5 flex items-center justify-between">
        <p
          className="text-xs font-semibold"
          style={{ color: dueInfo.color, fontWeight: dueInfo.bold ? 700 : 500 }}
        >
          {item.is_paused ? 'Paused' : `Next due: ${dueInfo.label}`}
        </p>
        <div className="flex items-center gap-1">
          {handled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#00D9A318] text-[#00D9A3] font-medium flex items-center gap-1">
              <Check className="w-2.5 h-2.5" /> Handled
            </span>
          )}
          {!item.auto_log && !handled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
              Nudge
            </span>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Name + amount + actions */}
      <div className="px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        >
          <div
            className="w-2 h-2 rounded-full shrink-0 self-center"
            style={{ backgroundColor: accentColor }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-foreground font-bold text-base truncate">{name}</p>
            <p className="text-muted-foreground/70 text-xs mt-0.5 truncate">
              {item.account?.name}
              {item.category ? ` · ${item.category.name}` : ''}
              {' · '}{formatScheduleSummary(item)}
            </p>
          </div>
        </button>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <p className="text-lg font-bold tabular-nums" style={{ color: accentColor }}>
            {format(item.amount)}
          </p>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onTogglePause(item)}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              title={item.is_paused ? 'Resume' : 'Pause'}
            >
              {item.is_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onEdit(item)}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-[#F43F5E] flex items-center justify-center transition-colors"
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

  const rawTab = searchParams.get('tab');
  const tab: TabValue = rawTab === 'paused' ? 'paused' : 'expense';

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

  // Income recurrings are legacy — they still get sorted into Paused if
  // is_paused, otherwise Active expense — never surfaced as a tab.
  const expenseItems = useMemo(
    () => items
      .filter(i => i.type === 'expense' && !i.is_paused)
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
    { value: 'expense', label: 'Recurring', count: expenseItems.length },
    { value: 'paused', label: 'Paused', count: pausedItems.length },
  ];

  const visibleItems = tab === 'expense' ? expenseItems : pausedItems;

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

  const accentColor = tab === 'expense' ? '#F43F5E' : '#FBBF24';

  return (
    <div className="max-w-2xl mx-auto pb-8 px-4 pt-6 md:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Recurring</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
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
            className="h-9 px-3 text-sm bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-medium rounded-xl gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      {/* Intro hint — shown until dismissed */}
      <HintCard
        hintId="recurring_intro"
        title="Automate your money rhythm"
        body="Recurring transactions auto-log on a schedule — set up subscriptions, salary, and bills once and Sika handles the rest. Use nudges for variable amounts (utilities, side hustles)."
        icon={RefreshCw}
        variant="banner"
        className="mb-4"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-muted border border-border rounded-xl p-1 overflow-x-auto scrollbar-none">
        {TABS.map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className="flex-1 h-9 rounded-lg text-xs font-medium transition-colors min-w-[80px] whitespace-nowrap"
            style={{
              backgroundColor: tab === value ? 'var(--card)' : 'transparent',
              color: tab === value ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {label}
            {count > 0 && (
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: tab === value ? accentColor + '22' : 'var(--border)',
                  color: tab === value ? accentColor : 'var(--muted-foreground)',
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
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-2xl bg-muted" />)}
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
              accentColor={item.type === 'income' ? '#00D9A3' : '#F43F5E'}
              today={today}
              onOpen={(id) => router.push(`/recurring/${id}`)}
              onTogglePause={handleTogglePause}
              onEdit={(i) => { setEditItem(i); setModalOpen(true); }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Quick templates strip — expense only */}
      {!loading && (
        <div className="mt-8">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-3">Quick expense templates</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {TEMPLATES.map(tmpl => (
              <button
                key={tmpl.label}
                onClick={() => openTemplate(tmpl)}
                className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2 shrink-0 hover:border-border transition-colors"
              >
                <span className="text-base">{tmpl.emoji}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap">{tmpl.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/70 mt-3">
            For income, manage your sources in{' '}
            <Link href="/settings" className="text-accent underline-offset-2 hover:underline">
              Settings → Income
            </Link>
            .
          </p>
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
      <div className="text-center py-16 text-muted-foreground text-sm">
        Nothing paused right now.
      </div>
    );
  }

  return (
    <div className="text-center py-16 px-4">
      <p className="text-muted-foreground text-sm mb-4">
        No recurring expenses yet. Add things like rent, subscriptions, or bills.
      </p>
      <Button
        onClick={onAdd}
        className="h-9 px-4 text-sm bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Add expense
      </Button>
    </div>
  );
}

export default function RecurringPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-3">
          <div className="h-8 w-36 rounded-xl bg-muted animate-pulse" />
          <div className="h-11 rounded-xl bg-muted animate-pulse" />
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      }
    >
      <RecurringContent />
    </Suspense>
  );
}
