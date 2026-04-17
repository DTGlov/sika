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
import type { Transaction } from '@/types';

export default function TransactionsPage() {
  const { user } = useAuthStore();
  const { transactions, setTransactions, categories } = useTransactionStore();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  useProfile();

  const supabase = createClient();

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data } = await supabase
        .from('transactions')
        .select('*, category:categories(*, bucket:budget_buckets(*))')
        .eq('user_id', user!.id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (data) setTransactions(data as Transaction[]);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.category?.name.toLowerCase().includes(q) && !(t.note ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const txn of filtered) {
      const key = txn.transaction_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(txn);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const hasFilters = typeFilter !== 'all' || categoryFilter !== 'all' || search;

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="px-4 pt-6 pb-4 md:px-8">
        <h1 className="text-2xl font-bold text-[#FAFAFA] mb-4">Transactions</h1>

        <div className="flex gap-2">
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

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setTypeFilter('all'); setCategoryFilter('all'); }}
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
