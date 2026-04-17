'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { useProfile } from '@/hooks/use-profile';
import { TransactionItem } from '@/components/transactions/transaction-item';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatTransactionDate } from '@/lib/utils';
import { getCycleForDate } from '@/lib/cycle';
import type { Transaction } from '@/types';

type PeriodFilter = 'cycle' | 'prev_cycle' | 'all';

export default function TransactionsPage() {
  const { user, profile, accounts } = useAuthStore();
  const { transactions, setTransactions, categories, mutationCount } = useTransactionStore();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('cycle');
  useProfile();

  const supabase = createClient();

  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const currentCycle = getCycleForDate(new Date(), cycleStartDay);
  const prevCycleEnd = new Date(currentCycle.start);
  prevCycleEnd.setDate(prevCycleEnd.getDate() - 1);
  const prevCycleStart = new Date(prevCycleEnd);
  prevCycleStart.setMonth(prevCycleStart.getMonth() - 1);
  prevCycleStart.setDate(cycleStartDay);

  useEffect(() => {
    if (!user) return;
    async function load() {
      let query = supabase
        .from('transactions')
        .select('*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)')
        .eq('user_id', user!.id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (periodFilter === 'cycle') {
        query = query
          .gte('transaction_date', format(currentCycle.start, 'yyyy-MM-dd'))
          .lte('transaction_date', format(currentCycle.end, 'yyyy-MM-dd'));
      } else if (periodFilter === 'prev_cycle') {
        query = query
          .gte('transaction_date', format(prevCycleStart, 'yyyy-MM-dd'))
          .lte('transaction_date', format(prevCycleEnd, 'yyyy-MM-dd'));
      }

      const { data } = await query;
      if (data) setTransactions(data as Transaction[]);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, periodFilter, mutationCount]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      if (accountFilter !== 'all') {
        if (t.account_id !== accountFilter && t.to_account_id !== accountFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchCat = t.category?.name.toLowerCase().includes(q);
        const matchNote = (t.note ?? '').toLowerCase().includes(q);
        const matchAcc = t.account?.name.toLowerCase().includes(q);
        const matchToAcc = t.to_account?.name.toLowerCase().includes(q);
        if (!matchCat && !matchNote && !matchAcc && !matchToAcc) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, accountFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const txn of filtered) {
      const key = txn.transaction_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(txn);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const hasFilters = typeFilter !== 'all' || categoryFilter !== 'all' || accountFilter !== 'all' || search;

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="px-4 pt-6 pb-4 md:px-8">
        <h1 className="text-2xl font-bold text-[#FAFAFA] mb-4">Transactions</h1>

        {/* Period tabs */}
        <div className="flex gap-1 mb-3 bg-[#141416] border border-[#27272A] rounded-xl p-1">
          {([
            { value: 'cycle', label: 'This Cycle' },
            { value: 'prev_cycle', label: 'Last Cycle' },
            { value: 'all', label: 'All Time' },
          ] as { value: PeriodFilter; label: string }[]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriodFilter(value)}
              className="flex-1 h-8 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: periodFilter === value ? '#1C1C1F' : 'transparent',
                color: periodFilter === value ? '#FAFAFA' : '#71717A',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717A]" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-[#141416] border-[#27272A] text-[#FAFAFA] placeholder:text-[#71717A] focus-visible:ring-[#00D9A3]"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { if (v) setTypeFilter(v); }}>
            <SelectTrigger className="w-28 h-10 bg-[#141416] border-[#27272A] text-[#FAFAFA]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#141416] border-[#27272A]">
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category filter */}
        <div className="mt-2">
          <Select value={categoryFilter} onValueChange={(v) => { if (v !== null) setCategoryFilter(v); }}>
            <SelectTrigger className="w-full h-10 bg-[#141416] border-[#27272A] text-[#FAFAFA]">
              <SlidersHorizontal className="w-4 h-4 mr-2 text-[#71717A]" />
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="bg-[#141416] border-[#27272A]">
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Account filter */}
        {accounts.length > 1 && (
          <div className="mt-2">
            <Select value={accountFilter} onValueChange={(v) => { if (v) setAccountFilter(v); }}>
              <SelectTrigger className="w-full h-10 bg-[#141416] border-[#27272A] text-[#FAFAFA]">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent className="bg-[#141416] border-[#27272A]">
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setTypeFilter('all'); setCategoryFilter('all'); setAccountFilter('all'); }}
            className="flex items-center gap-1.5 mt-2 text-xs text-[#00D9A3] hover:text-[#00F5B8] transition-colors"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="px-4 md:px-8 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl bg-[#141416]" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-20 text-[#71717A] text-sm">
          {hasFilters ? 'No transactions match your filters.' : 'No transactions yet. Tap + to log one.'}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, txns]) => (
            <div key={date} className="bg-[#141416] border border-[#27272A] rounded-2xl mx-4 md:mx-8 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#27272A]">
                <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                  {formatTransactionDate(date)} · {format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="divide-y divide-[#27272A]">
                {txns.map((txn) => (
                  <TransactionItem key={txn.id} transaction={txn} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
