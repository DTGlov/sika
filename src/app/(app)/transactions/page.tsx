'use client';

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { Search, SlidersHorizontal, X, ChevronDown, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { useProfile } from '@/hooks/use-profile';
import { TransactionItem } from '@/components/transactions/transaction-item';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatTransactionDate } from '@/lib/utils';
import { getCycleForDate } from '@/lib/cycle';
import type { Transaction } from '@/types';

type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';
const PAGE_SIZE = 50;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Amount (high→low)' },
  { value: 'amount-asc', label: 'Amount (low→high)' },
];

const PERIOD_TABS = [
  { value: 'cycle', label: 'This Month' },
  { value: 'prev_cycle', label: 'Last Month' },
  { value: 'last30', label: '30 Days' },
  { value: 'last90', label: '90 Days' },
  { value: 'all', label: 'All' },
] as const;

type PeriodValue = typeof PERIOD_TABS[number]['value'];

function TransactionsContent() {
  const searchParamsHook = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, accounts } = useAuthStore();
  const { transactions, setTransactions, categories, mutationCount } = useTransactionStore();
  useProfile();
  const supabase = createClient();

  // Read URL params
  const urlPeriod = (searchParamsHook.get('period') ?? 'cycle') as PeriodValue;
  const urlType = searchParamsHook.get('type') ?? 'all';
  const urlAccount = searchParamsHook.get('account') ?? 'all';
  const urlCategory = searchParamsHook.get('category') ?? 'all';
  const urlBucket = searchParamsHook.get('bucket') ?? 'all';
  const urlSort = (searchParamsHook.get('sort') ?? 'date-desc') as SortKey;
  const urlAmountMin = searchParamsHook.get('amtMin') ?? '';
  const urlAmountMax = searchParamsHook.get('amtMax') ?? '';

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const cycleStartDay = profile?.cycle_start_day ?? 1;
  const today = new Date();

  function getDateRange(period: PeriodValue): { from: string; to: string } | null {
    const cycle = getCycleForDate(today, cycleStartDay);
    switch (period) {
      case 'cycle':
        return { from: format(cycle.start, 'yyyy-MM-dd'), to: format(cycle.end, 'yyyy-MM-dd') };
      case 'prev_cycle': {
        const prevEnd = new Date(cycle.start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setMonth(prevStart.getMonth() - 1);
        prevStart.setDate(cycleStartDay);
        return { from: format(prevStart, 'yyyy-MM-dd'), to: format(prevEnd, 'yyyy-MM-dd') };
      }
      case 'last30': {
        const from = new Date(today);
        from.setDate(from.getDate() - 29);
        return { from: format(from, 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
      }
      case 'last90': {
        const from = new Date(today);
        from.setDate(from.getDate() - 89);
        return { from: format(from, 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
      }
      case 'all':
        return null;
    }
  }

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParamsHook.toString());
    if (value === 'all' || value === '' || value === 'date-desc') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setPage(0);
  }

  const loadTransactions = useCallback(async (pageNum: number, append: boolean) => {
    if (!user) return;
    if (pageNum === 0) setLoading(true);
    else setLoadingMore(true);

    const dateRange = getDateRange(urlPeriod);
    const [asc] = urlSort.split('-') as [string, string];
    const ascending = asc === 'date' ? urlSort === 'date-asc' : urlSort === 'amount-asc';
    const orderCol = asc === 'date' ? 'transaction_date' : 'amount';

    let query = supabase
      .from('transactions')
      .select('*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)', { count: 'exact' })
      .eq('user_id', user.id)
      .order(orderCol, { ascending })
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    if (dateRange) {
      query = query.gte('transaction_date', dateRange.from).lte('transaction_date', dateRange.to);
    }
    if (urlType !== 'all') query = query.eq('type', urlType);
    if (urlAccount !== 'all') {
      query = query.or(`account_id.eq.${urlAccount},to_account_id.eq.${urlAccount}`);
    }
    if (urlCategory !== 'all') query = query.eq('category_id', urlCategory);
    if (urlAmountMin) query = query.gte('amount', parseFloat(urlAmountMin));
    if (urlAmountMax) query = query.lte('amount', parseFloat(urlAmountMax));

    const { data, count } = await query;

    if (data) {
      if (append) {
        setTransactions([...transactions, ...(data as Transaction[])]);
      } else {
        setTransactions(data as Transaction[]);
      }
      setHasMore((pageNum + 1) * PAGE_SIZE < (count ?? 0));
    }

    setLoading(false);
    setLoadingMore(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, urlPeriod, urlType, urlAccount, urlCategory, urlSort, urlAmountMin, urlAmountMax, mutationCount]);

  useEffect(() => {
    setPage(0);
    loadTransactions(0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, urlPeriod, urlType, urlAccount, urlCategory, urlSort, urlAmountMin, urlAmountMax, mutationCount]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    loadTransactions(next, true);
  }

  // Client-side search + bucket filter (applied after fetch)
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (urlBucket !== 'all' && t.category?.bucket?.name !== urlBucket) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchNote = (t.note ?? '').toLowerCase().includes(q);
        const matchCat = (t.category?.name ?? '').toLowerCase().includes(q);
        const matchAcc = (t.account?.name ?? '').toLowerCase().includes(q);
        const matchAmt = !isNaN(Number(search)) && Math.abs(t.amount) === Number(search);
        if (!matchNote && !matchCat && !matchAcc && !matchAmt) return false;
      }
      return true;
    });
  }, [transactions, search, urlBucket]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const txn of filtered) {
      const key = txn.transaction_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(txn);
    }
    const entries = Array.from(map.entries());
    if (urlSort === 'date-asc') {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
    } else {
      entries.sort((a, b) => b[0].localeCompare(a[0]));
    }
    return entries;
  }, [filtered, urlSort]);

  const expenseCategories = categories.filter(c => {
    const ct = c.category_type ?? (c.bucket_id ? 'expense' : 'income');
    return ct === 'expense';
  });
  const allBuckets = Array.from(new Set(
    expenseCategories.filter(c => c.bucket).map(c => c.bucket!.name)
  ));

  const activeFilterCount = [
    urlType !== 'all',
    urlAccount !== 'all',
    urlCategory !== 'all',
    urlBucket !== 'all',
    urlAmountMin !== '',
    urlAmountMax !== '',
    urlSort !== 'date-desc',
  ].filter(Boolean).length;

  function clearAllFilters() {
    const params = new URLSearchParams();
    if (urlPeriod !== 'cycle') params.set('period', urlPeriod);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setSearch('');
    setPage(0);
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="px-4 pt-6 pb-4 md:px-8">
        <h1 className="text-2xl font-bold text-foreground mb-4">Transactions</h1>

        {/* Period tabs */}
        <div className="flex gap-1 mb-3 bg-muted border border-border rounded-xl p-1 overflow-x-auto scrollbar-none">
          {PERIOD_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateParam('period', value)}
              className="flex-shrink-0 flex-1 h-8 rounded-lg text-xs font-medium transition-colors min-w-[60px]"
              style={{
                backgroundColor: urlPeriod === value ? 'var(--card)' : 'transparent',
                color: urlPeriod === value ? 'var(--foreground)' : 'var(--muted-foreground)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search + filter toggle */}
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by note or amount…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-accent"
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className="relative h-10 px-3 rounded-xl border transition-colors flex items-center gap-1.5 text-sm font-medium shrink-0"
            style={{
              borderColor: showFilters || activeFilterCount > 0 ? '#D4A017' : 'var(--border)',
              backgroundColor: showFilters || activeFilterCount > 0 ? '#D4A01718' : 'var(--muted)',
              color: showFilters || activeFilterCount > 0 ? '#D4A017' : 'var(--muted-foreground)',
            }}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#D4A017] text-[#0E1A2E] text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible filter panel */}
        {showFilters && (
          <div className="bg-muted border border-border rounded-2xl p-4 space-y-4 mb-2">
            {/* Type filter */}
            <div>
              <p className="text-muted-foreground text-xs font-medium mb-2">Type</p>
              <div className="flex flex-wrap gap-1.5">
                {['all', 'expense', 'income', 'transfer', 'adjustment'].map(t => (
                  <button
                    key={t}
                    onClick={() => updateParam('type', t)}
                    className="h-7 px-3 rounded-lg text-xs font-medium capitalize border transition-all"
                    style={{
                      borderColor: urlType === t ? '#D4A017' : 'var(--border)',
                      backgroundColor: urlType === t ? '#D4A01718' : 'var(--card)',
                      color: urlType === t ? '#D4A017' : 'var(--muted-foreground)',
                    }}
                  >
                    {t === 'all' ? 'All types' : t}
                  </button>
                ))}
              </div>
            </div>

            {/* Account filter */}
            {accounts.length > 1 && (
              <div>
                <p className="text-muted-foreground text-xs font-medium mb-2">Account</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => updateParam('account', 'all')}
                    className="h-7 px-3 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      borderColor: urlAccount === 'all' ? '#D4A017' : 'var(--border)',
                      backgroundColor: urlAccount === 'all' ? '#D4A01718' : 'var(--card)',
                      color: urlAccount === 'all' ? '#D4A017' : 'var(--muted-foreground)',
                    }}
                  >
                    All accounts
                  </button>
                  {accounts.map(a => (
                    <button
                      key={a.id}
                      onClick={() => updateParam('account', a.id)}
                      className="h-7 px-3 rounded-lg text-xs font-medium border transition-all"
                      style={{
                        borderColor: urlAccount === a.id ? '#D4A017' : 'var(--border)',
                        backgroundColor: urlAccount === a.id ? '#D4A01718' : 'var(--card)',
                        color: urlAccount === a.id ? '#D4A017' : 'var(--muted-foreground)',
                      }}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bucket filter */}
            {allBuckets.length > 0 && (
              <div>
                <p className="text-muted-foreground text-xs font-medium mb-2">Bucket</p>
                <div className="flex flex-wrap gap-1.5">
                  {['all', ...allBuckets].map(b => (
                    <button
                      key={b}
                      onClick={() => updateParam('bucket', b)}
                      className="h-7 px-3 rounded-lg text-xs font-medium capitalize border transition-all"
                      style={{
                        borderColor: urlBucket === b ? '#D4A017' : 'var(--border)',
                        backgroundColor: urlBucket === b ? '#D4A01718' : 'var(--card)',
                        color: urlBucket === b ? '#D4A017' : 'var(--muted-foreground)',
                      }}
                    >
                      {b === 'all' ? 'All buckets' : b}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category filter */}
            <div>
              <p className="text-muted-foreground text-xs font-medium mb-2">Category</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                <button
                  onClick={() => updateParam('category', 'all')}
                  className="h-7 px-3 rounded-lg text-xs font-medium border transition-all"
                  style={{
                    borderColor: urlCategory === 'all' ? '#D4A017' : 'var(--border)',
                    backgroundColor: urlCategory === 'all' ? '#D4A01718' : 'var(--card)',
                    color: urlCategory === 'all' ? '#D4A017' : 'var(--muted-foreground)',
                  }}
                >
                  All categories
                </button>
                {categories.filter(c => !c.is_archived).map(c => (
                  <button
                    key={c.id}
                    onClick={() => updateParam('category', c.id)}
                    className="h-7 px-3 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      borderColor: urlCategory === c.id ? '#D4A017' : 'var(--border)',
                      backgroundColor: urlCategory === c.id ? '#D4A01718' : 'var(--card)',
                      color: urlCategory === c.id ? '#D4A017' : 'var(--muted-foreground)',
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount range */}
            <div>
              <p className="text-muted-foreground text-xs font-medium mb-2">Amount range</p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-xs">₵</span>
                  <Input
                    type="number" min="0" step="0.01" placeholder="Min"
                    value={urlAmountMin}
                    onChange={e => updateParam('amtMin', e.target.value)}
                    className="pl-6 h-9 bg-input border-border text-foreground text-base focus-visible:ring-accent"
                  />
                </div>
                <span className="text-muted-foreground/60 text-xs">–</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-xs">₵</span>
                  <Input
                    type="number" min="0" step="0.01" placeholder="Max"
                    value={urlAmountMax}
                    onChange={e => updateParam('amtMax', e.target.value)}
                    className="pl-6 h-9 bg-input border-border text-foreground text-base focus-visible:ring-accent"
                  />
                </div>
              </div>
            </div>

            {/* Sort */}
            <div>
              <p className="text-muted-foreground text-xs font-medium mb-2">Sort</p>
              <div className="flex flex-wrap gap-1.5">
                {SORT_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => updateParam('sort', value)}
                    className="h-7 px-3 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      borderColor: urlSort === value ? '#D4A017' : 'var(--border)',
                      backgroundColor: urlSort === value ? '#D4A01718' : 'var(--card)',
                      color: urlSort === value ? '#D4A017' : 'var(--muted-foreground)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 text-xs text-[#F43F5E] hover:text-[#FF6080] transition-colors"
              >
                <X className="w-3 h-3" /> Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Quick clear when filters panel is closed */}
        {!showFilters && (activeFilterCount > 0 || search) && (
          <button
            onClick={() => { clearAllFilters(); setSearch(''); }}
            className="flex items-center gap-1.5 mt-1 text-xs text-[#D4A017] hover:text-[#E8B520] transition-colors"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="px-4 md:px-8 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl bg-muted" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-20 px-4">
          <p className="text-muted-foreground text-sm">No transactions match your filters.</p>
          {(activeFilterCount > 0 || search) && (
            <button
              onClick={() => { clearAllFilters(); setSearch(''); }}
              className="mt-3 text-xs text-[#D4A017] hover:text-[#E8B520] transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {grouped.map(([date, txns]) => (
              <div key={date} className="bg-card border border-border rounded-2xl mx-4 md:mx-8 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {formatTransactionDate(date)} · {format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {txns.map((txn) => (
                    <TransactionItem key={txn.id} transaction={txn} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-6 px-4">
              <Button
                onClick={loadMore}
                disabled={loadingMore}
                variant="outline"
                className="border-border text-muted-foreground hover:bg-muted rounded-xl"
              >
                {loadingMore ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-2" />
                )}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-3">
          <Skeleton className="h-8 w-40 rounded-xl bg-muted" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl bg-muted" />
          ))}
        </div>
      }
    >
      <TransactionsContent />
    </Suspense>
  );
}
