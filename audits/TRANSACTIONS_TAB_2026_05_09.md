# Transactions Tab Audit — 2026-05-09

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Transactions tab rebuild — the largest other-tab rebuild after Home MVP.

Source of truth: web repo (`feat/bearer-auth-decisions` branch, working tree clean for src).

## TL;DR for the iOS prompt author

- **There is NO transaction detail view on web.** Tapping a row does nothing. The 3-dot menu has Edit / Delete only. "Edit" re-opens the same `TransactionSheet` (pre-filled) — there is no separate edit screen. iOS should NOT design a detail view it has to fill with placeholder fields; mirror web's "list + sheet for both add/edit" pattern.
- **`TransactionSheet` (`src/components/transactions/transaction-sheet.tsx`, 933 lines) is the load-bearing component** for add, edit, AND reconcile. iOS already uses it conceptually (Phase 7). Treat it as the spec — every step, validation, and side effect (streak/momentum/badge mutations) is here.
- **Filter persistence is via URL search params**, not local state or localStorage. Period / type / account / category / sort / amtMin / amtMax all live in the URL. Bucket filter is **client-side only** (after fetch). iOS should mirror "URL ↔ filter state" by pushing filter to a `@Published` source-of-truth that drives both the query params and the UI.
- **Hard delete**, no `deleted_at` column. Confirmation dialog before delete. No undo. Row exits with an animated height collapse.
- **Pagination is page-50 + manual "Load more"**, NOT infinite scroll. Page size = 50. No pull-to-refresh on this page. Refetch on filter change AND on `mutationCount` change (transaction-store mutation tally).
- **Reconcile is woven into the same sheet**, not a separate screen. Three entry points: (a) "Reconcile shortcut" link in the amount step, (b) `InsufficientBalanceSheet` action (when expense > account balance), (c) editing an existing adjustment transaction. iOS Phase T-? must implement this with all 3 entry points wired.
- **Transaction types**: `expense` / `income` / `transfer` / `adjustment` — all four with distinct rendering rules in the row chrome (Section 11).

---

## 1. Page Route + Layout

File: `src/app/(app)/transactions/page.tsx` (533 lines).
Route: `/transactions`.
Layout: single page, no sub-routes (no `/transactions/[id]`, no `/transactions/new`). Add/edit/delete all happen inline against the same list.

Page header structure (lines 224-456):

```tsx
<div className="max-w-2xl mx-auto pb-24">
  <div className="px-4 pt-6 pb-4 md:px-8">
    <h1 className="text-2xl font-bold text-foreground mb-4">Transactions</h1>

    {/* Period tabs */}
    <div className="flex gap-1 mb-3 bg-muted border border-border rounded-xl p-1 overflow-x-auto scrollbar-none">
      {PERIOD_TABS.map(({ value, label }) => (
        <button key={value} onClick={() => updateParam('period', value)} ... >
          {label}
        </button>
      ))}
    </div>

    {/* Search + filter toggle */}
    <div className="flex gap-2 mb-2">
      <div className="relative flex-1"><Search ... /><Input placeholder="Search by note or amount…" ... /></div>
      <button onClick={() => setShowFilters(v => !v)} ...>
        <SlidersHorizontal /> Filters
        {activeFilterCount > 0 && (<span className="...badge dot">{activeFilterCount}</span>)}
      </button>
    </div>

    {/* Collapsible filter panel — when showFilters */}
    {showFilters && (<div className="bg-muted border border-border rounded-2xl p-4 space-y-4 mb-2">{...}</div>)}

    {/* Quick clear when filters panel closed */}
    {!showFilters && (activeFilterCount > 0 || search) && (<button>Clear filters</button>)}
  </div>

  {/* Body: skeleton / empty / grouped list + load-more */}
  {loading ? (...skeleton rows...) : grouped.length === 0 ? (...empty state...) : (...grouped day cards + Load more...)}
</div>
```

The `TransactionSheet` itself is NOT mounted on this page — it's mounted globally in `AppShell` (`src/components/layout/app-shell.tsx:48`). Same with the `AddTransactionFab` (`app-shell.tsx:47`) and `BadgeCelebrationHost`.

Top-level wrapper also wraps everything in `<Suspense>` (line 518) for `useSearchParams` SSR-safety, with a skeleton fallback.

---

## 2. List View

### Layout

Plain mapped list (NOT virtualized). Each day group rendered as a `bg-card` rounded card with a day-header strip + divider-separated rows.

```tsx
<div className="space-y-4">
  {grouped.map(([date, txns]) => (
    <div key={date} className="bg-card border border-border rounded-2xl mx-4 md:mx-8 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {formatTransactionDate(date)} · {format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}
        </p>
      </div>
      <div className="divide-y divide-border">
        {txns.map((txn) => <TransactionItem key={txn.id} transaction={txn} />)}
      </div>
    </div>
  ))}
</div>
```

`formatTransactionDate(dateStr)` from `lib/utils.ts:27`:
```ts
export function formatTransactionDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  if (isToday(date))     return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  // (continues with relative date formatting; see file)
```

So a day header reads like `TODAY · MAY 9, 2026` or `MONDAY · MAY 5, 2026`.

### Per-row chrome

`TransactionItem` (`src/components/transactions/transaction-item.tsx`, 202 lines, full source):

```tsx
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
    if (error) { toast.error('Failed to delete'); setIsDeleting(false); return; }
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium shrink-0">adj</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  {txn.type !== 'transfer' && txn.account && (
                    <span className="text-muted-foreground/70 text-xs truncate">{txn.account.name}</span>
                  )}
                  {txn.generated_from_recurring && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#60A5FA18] text-[#60A5FA] font-medium shrink-0">Auto</span>
                  )}
                  {txn.paid_from_goal_id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#00D9A318] text-[#D4A017] font-medium shrink-0">🎯 From fund</span>
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
                <DropdownMenuTrigger render={<button type="button" aria-label="Transaction actions" onClick={(e) => e.stopPropagation()} className="shrink-0 p-2 -mr-2 rounded-full text-muted-foreground hover:bg-muted/40 active:bg-muted/60 transition-colors" />}>
                  <MoreVertical className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => openLogSheet(txn)}>
                    <Pencil className="w-4 h-4 mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-[#F43F5E] focus:text-[#F43F5E]">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
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
            <Button type="button" variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>Cancel</Button>
            <Button type="button" onClick={handleDelete} disabled={isDeleting} className="bg-[#F43F5E] text-white hover:bg-[#E11D48] disabled:bg-muted ...">
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

### Grouping

```ts
const grouped = useMemo(() => {
  const map = new Map<string, Transaction[]>();
  for (const txn of filtered) {
    const key = txn.transaction_date;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(txn);
  }
  const entries = Array.from(map.entries());
  if (urlSort === 'date-asc') entries.sort((a, b) => a[0].localeCompare(b[0]));
  else                         entries.sort((a, b) => b[0].localeCompare(a[0]));
  return entries;
}, [filtered, urlSort]);
```

By **transaction_date** (YYYY-MM-DD), preserving in-day order from the query. Sort direction follows the chosen sort (date-desc / date-asc); for amount sorts, day groups still sort by date desc by default — though within a group the order matches the SQL ordering (amount asc/desc).

### Sort order

Default: `date-desc` (newest first), with `created_at desc` as tiebreaker (`page.tsx:124`). Other options: `date-asc`, `amount-desc`, `amount-asc`. Sort applied at the SQL level via `.order(orderCol, { ascending })`.

### Empty state

```tsx
<div className="text-center py-20 px-4">
  <p className="text-muted-foreground text-sm">No transactions match your filters.</p>
  {(activeFilterCount > 0 || search) && (
    <button onClick={() => { clearAllFilters(); setSearch(''); }} className="mt-3 text-xs text-[#D4A017] hover:text-[#E8B520] transition-colors">
      Clear filters
    </button>
  )}
</div>
```

No illustration, no big call-to-action — just the muted message and an optional clear-filters link. There's no separate "you have no transactions yet" state distinct from "filters returned nothing"; both surface the same copy.

### Loading state

```tsx
<div className="px-4 md:px-8 space-y-3">
  {Array.from({ length: 6 }).map((_, i) => (
    <Skeleton key={i} className="h-16 rounded-xl bg-muted" />
  ))}
</div>
```

6 pulsing rectangle skeletons matching row height.

### Pagination

```ts
const PAGE_SIZE = 50;
```

Range slice on the SQL query:
```ts
.range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
```

`hasMore` is computed from `count` returned by Supabase's `{ count: 'exact' }` query.

```tsx
{hasMore && (
  <div className="flex justify-center mt-6 px-4">
    <Button onClick={loadMore} disabled={loadingMore} variant="outline" className="...">
      {loadingMore ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
      Load more
    </Button>
  </div>
)}
```

This is **manual "Load more"**, NOT infinite scroll. iOS should implement the same pattern unless explicitly upgrading.

---

## 3. Filter UI

Filter persistence: **URL search params**, read with `useSearchParams()` and written via `router.replace(`${pathname}?${params}`, { scroll: false })`. The `updateParam(key, value)` helper deletes the param when value is the default (`'all'` / `''` / `'date-desc'`) so the URL stays minimal.

```ts
function updateParam(key: string, value: string) {
  const params = new URLSearchParams(searchParamsHook.toString());
  if (value === 'all' || value === '' || value === 'date-desc') params.delete(key);
  else params.set(key, value);
  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  setPage(0);
}
```

URL params:

| Key | Type | Default | Notes |
|---|---|---|---|
| `period`  | `cycle` \| `prev_cycle` \| `last30` \| `last90` \| `all` | `cycle` | Period tabs (always visible above search) |
| `type`    | `all` \| `expense` \| `income` \| `transfer` \| `adjustment` | `all` | Type chips |
| `account` | `all` \| `<account_id>` | `all` | Account chips (only rendered when `accounts.length > 1`) |
| `category` | `all` \| `<category_id>` | `all` | Category chips |
| `bucket`  | `all` \| `needs` \| `wants` \| `savings` | `all` | Bucket chips. **Client-side filter, not in DB query.** |
| `sort`    | `date-desc` \| `date-asc` \| `amount-desc` \| `amount-asc` | `date-desc` | |
| `amtMin`  | string (number) | `''` | |
| `amtMax`  | string (number) | `''` | |

The local `search` input is **NOT** in the URL — it's component state only. (Reload loses the search query.)

### Period tabs (always visible)

```ts
const PERIOD_TABS = [
  { value: 'cycle',      label: 'This Month' },
  { value: 'prev_cycle', label: 'Last Month' },
  { value: 'last30',     label: '30 Days' },
  { value: 'last90',     label: '90 Days' },
  { value: 'all',        label: 'All' },
] as const;
```

`getDateRange(period)` translates these to `{from, to}` ISO date strings. `cycle` and `prev_cycle` are based on the user's `cycle_start_day` — NOT calendar months. `last30` and `last90` are sliding-window relative to today. `all` returns null (no date filter applied).

Each tab is a button that calls `updateParam('period', value)`. Active tab gets `bg-card` against the `bg-muted` strip.

### Search bar

Free-text input above the filter button. Client-side only (applied after fetch via `filtered` memo):

```ts
if (search) {
  const q = search.toLowerCase();
  const matchNote = (t.note ?? '').toLowerCase().includes(q);
  const matchCat  = (t.category?.name ?? '').toLowerCase().includes(q);
  const matchAcc  = (t.account?.name ?? '').toLowerCase().includes(q);
  const matchAmt  = !isNaN(Number(search)) && Math.abs(t.amount) === Number(search);
  if (!matchNote && !matchCat && !matchAcc && !matchAmt) return false;
}
```

Matches: note, category name, account name, OR exact-amount numeric match. Logic is OR within a single search query.

### Filter button + collapsible panel

The filter button shows an active-filter count badge (`activeFilterCount`):
```ts
const activeFilterCount = [
  urlType !== 'all', urlAccount !== 'all', urlCategory !== 'all', urlBucket !== 'all',
  urlAmountMin !== '', urlAmountMax !== '', urlSort !== 'date-desc',
].filter(Boolean).length;
```

Tapping the button toggles `showFilters`. The panel contains, in order:
1. **Type** chips: `all` / `expense` / `income` / `transfer` / `adjustment` (always rendered)
2. **Account** chips: `All accounts` + one chip per `accounts` (only rendered when `accounts.length > 1`)
3. **Bucket** chips: `All buckets` + chip per bucket (only rendered when at least one expense category has a bucket; uses `Array.from(new Set(expenseCategories.filter(c => c.bucket).map(c => c.bucket!.name)))`)
4. **Category** chips: `All categories` + chip per non-archived category (in a `max-h-24 overflow-y-auto` strip)
5. **Amount range**: two number inputs side-by-side with currency-symbol prefix
6. **Sort** chips: 4 options
7. "Clear all filters" button (only when `activeFilterCount > 0`)

Active chip styling is `borderColor: '#D4A017'`, `backgroundColor: '#D4A01718'`, `color: '#D4A017'` — gold halo.

### Clear filters

```ts
function clearAllFilters() {
  const params = new URLSearchParams();
  if (urlPeriod !== 'cycle') params.set('period', urlPeriod);  // preserves current period
  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  setSearch('');
  setPage(0);
}
```

Period is preserved across "clear all"; everything else (including search text) resets.

A second affordance — quick clear when the panel is collapsed:

```tsx
{!showFilters && (activeFilterCount > 0 || search) && (
  <button onClick={() => { clearAllFilters(); setSearch(''); }} className="flex items-center gap-1.5 mt-1 text-xs text-[#D4A017] hover:text-[#E8B520] transition-colors">
    <X className="w-3 h-3" /> Clear filters
  </button>
)}
```

### Combined logic

All filter conditions are **AND** (server-side: `.eq('type', ...)`, `.eq('category_id', ...)`, etc.; client-side: bucket + search). Account filter uses `.or('account_id.eq.X,to_account_id.eq.X')` so transfers involving the selected account on either side match.

---

## 4. Row Tap Behavior

**The whole row is NOT tappable.** It's a `<motion.div>`, not a `<button>`. There is no detail navigation. Only two interactive surfaces exist on each row:

1. **The 3-dot DropdownMenuTrigger** (on the right) — opens a 2-item menu: `Edit` (Pencil icon) → `openLogSheet(txn)`; `Delete` (Trash2 icon, red) → `setShowDeleteDialog(true)`.
2. **The hover state** — `hover:bg-muted` (visual only, no action).

`openLogSheet(txn)` enters **edit mode** in the sheet via the transaction-store action:
```ts
openLogSheet: (txn) => set({ isLogSheetOpen: true, editingTransaction: txn ?? null, reconcileContext: null }),
```

**Implication for iOS**: iOS does NOT need to implement a transaction-detail view. The action menu (Edit / Delete) is the only way to act on a row. Match this — don't introduce a detail screen iOS has to invent fields for.

---

## 5. Edit Flow

Tap "Edit" in the row's dropdown → `openLogSheet(txn)` → `TransactionSheet` opens with `editingTransaction` set. The sheet's pre-fill effect (`transaction-sheet.tsx:119-145`) populates fields:

```ts
useEffect(() => {
  if (!isLogSheetOpen) return;

  if (reconcileContext) {
    setTxType('adjustment');
    setAccountId(reconcileContext.accountId);
    setStep('reconcile');
    setReconcileActual('');
    setNote('');
  } else if (editingTransaction) {
    setAmount(Math.abs(editingTransaction.amount).toString());
    setTxType(editingTransaction.type);
    setCategoryId(editingTransaction.category_id);
    setAccountId(editingTransaction.account_id ?? defaultAccountId);
    setToAccountId(editingTransaction.to_account_id);
    setNote(editingTransaction.note ?? '');
    setTxDate(editingTransaction.transaction_date);
    setStep(editingTransaction.type === 'adjustment' ? 'reconcile' : 'amount');
    if (editingTransaction.type === 'adjustment') setReconcileActual('');
  } else {
    setAccountId(defaultAccountId);
    setStep('amount');
  }
}, [isLogSheetOpen, editingTransaction, reconcileContext]);
```

User then walks through the same steps as adding (amount → category → details for expense/income; amount → accounts → details for transfer; reconcile-only for adjustment). All fields are editable.

Save behavior — `handleSave` (`transaction-sheet.tsx:250-363`) branches on `editingTransaction`:

```ts
if (editingTransaction) {
  const { data, error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', editingTransaction.id)
    .select(selectClause)
    .single();
  setSaving(false);
  if (error) { hapticToast.error('Failed to update transaction'); return; }
  updateTransaction(data);
  revalidateForEntity('transaction');
  hapticMedium();
  toast.success('Transaction updated');
}
```

Edit does **NOT** trigger streak/momentum/badge mutations — those only fire on the insert branch. So editing a transaction's amount won't double-tick the streak. This is intentional.

No optimistic update — the spinner runs until the round-trip completes. No undo affordance.

---

## 6. Delete Flow

### UI

Tap "Delete" in the 3-dot menu → confirmation dialog (the `Dialog` rendered alongside the row in `transaction-item.tsx:172-199`):

```tsx
<DialogTitle>Delete this transaction?</DialogTitle>
<DialogDescription>
  This will permanently remove "{txnLabel}" ({format(Math.abs(txn.amount))}) from your records. This can't be undone.
</DialogDescription>
<DialogFooter>
  <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
  <Button onClick={handleDelete} className="bg-[#F43F5E] text-white">{isDeleting ? 'Deleting…' : 'Delete'}</Button>
</DialogFooter>
```

`txnLabel` falls back through: `note → "From → To" (transfer) → "Balance adjustment" (adjustment) → category.name → "this transaction"`.

### Hard vs soft

**Hard delete.** No `deleted_at` column referenced anywhere in the audit pass.

```ts
const { error } = await supabase.from('transactions').delete().eq('id', txn.id);
```

After successful delete: `removeTransaction(txn.id)` from store, exit animation collapses height (`AnimatePresence` + `exit={{ opacity: 0, height: 0 }}`), success toast `'Transaction deleted'`, and `revalidateForEntity('transaction')` triggers downstream refetches (dashboard stats, etc.).

### No undo

No undo affordance. If the user wants to recover, they re-add manually.

### Swipe / long-press

Neither. The web pattern is dropdown-menu only. iOS, however, can additionally adopt swipe-to-delete (idiomatic on iOS) without diverging from web's data model — both end up at the same hard delete + remove-from-store + revalidate sequence.

---

## 7. Add Transaction Wizard

This is the load-bearing flow. The full source of `transaction-sheet.tsx` is 933 lines; the critical structure:

### Entry trigger

`AddTransactionFab` (`src/components/transactions/add-transaction-fab.tsx`, full source):

```tsx
'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useTransactionStore } from '@/stores/transaction-store';
import { useHaptics } from '@/hooks/use-haptics';

export function AddTransactionFab() {
  const { openLogSheet } = useTransactionStore();
  const { light } = useHaptics();

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.6 }}
      whileTap={{ scale: 0.92 }}
      onClick={() => { light(); openLogSheet(); }}
      aria-label="Log a transaction"
      className="fixed z-40 w-14 h-14 rounded-full bg-[#D4A017] text-[#0E1A2E] shadow-lg flex items-center justify-center
        bottom-[calc(5.4375rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2
        md:bottom-6 md:left-auto md:right-6 md:translate-x-0"
    >
      <motion.div
        animate={{ boxShadow: ['0 0 0 0 rgba(0,217,163,0.4)', '0 0 0 12px rgba(0,217,163,0)'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        className="absolute inset-0 rounded-full"
      />
      <Plus className="w-6 h-6 relative z-10" strokeWidth={2.5} />
    </motion.button>
  );
}
```

Mounted in `AppShell`, NOT on the transactions page. Mobile: centered, lifted ~5.44rem (87px) + safe-area above the bottom nav. Desktop: bottom-right corner. Repeating box-shadow ripple animation.

### Sheet shell

Bottom sheet via shadcn `Sheet`, max-h 92svh, scroll inside:

```tsx
<Sheet open={isLogSheetOpen} onOpenChange={(open) => !open && handleClose()}>
  <SheetContent side="bottom" className="bg-card border-t border-border rounded-t-3xl px-4 pb-8 pt-4 max-h-[92svh] overflow-y-auto">
    <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" /> {/* drag handle */}
    <SheetHeader className="mb-4"><SheetTitle>{stepTitles[step]}</SheetTitle></SheetHeader>
    {/* Step progress dots */}
    {/* Step body — conditional on `step` and `txType` */}
  </SheetContent>
</Sheet>
```

### Step machine

```ts
type Step = 'amount' | 'category' | 'accounts' | 'details' | 'reconcile';

const stepList: Step[] = txType === 'transfer'
  ? ['amount', 'accounts', 'details']
  : txType === 'adjustment'
  ? ['reconcile']
  : ['amount', 'category', 'details'];

const stepTitles: Record<Step, string> = {
  amount:    editingTransaction ? 'Edit amount' : 'How much?',
  category:  'What for?',
  accounts:  'Transfer between',
  details:   'Any details?',
  reconcile: 'Reconcile balance',
};
```

Step progress is rendered as 1-or-3 horizontal pill segments (gold = visited, muted = pending):

```tsx
<div className="flex gap-1.5 mb-6">
  {stepList.map((s, i) => (
    <div key={s} className={cn('h-1 flex-1 rounded-full transition-colors', stepList.indexOf(step) >= i ? 'bg-[#D4A017]' : 'bg-muted')} />
  ))}
</div>
```

### Step 1: Amount (expense / income / transfer-amount)

`AmountKeypad` component — custom numeric pad, NOT system keyboard. Source (`src/components/transactions/amount-keypad.tsx`):

```tsx
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export function AmountKeypad({ value, onChange, type, onTypeChange }: AmountKeypadProps) {
  function press(key: string) {
    if (key === '⌫') { onChange(value.slice(0, -1) || '0'); return; }
    if (key === '.' && value.includes('.')) return;
    const parts = value.split('.');
    if (parts[1]?.length >= 2) return;       // max 2 decimal places
    const next = value === '0' && key !== '.' ? key : value + key;
    onChange(next);
  }
  // ...renders amount display + 3 type pills (expense/income/transfer) + 4×3 keypad grid
}
```

Type pills above the keypad let the user switch between `expense` / `income` / `transfer`. The amount step also renders **account chips** below the keypad (for non-transfer):

```tsx
{txType !== 'transfer' && accounts.length > 0 && (
  <div>
    <p className="text-muted-foreground text-xs mb-2">Account</p>
    <div className="flex flex-wrap gap-2">
      {accounts.map(acc => {
        const cfg = ACCOUNT_TYPE_CONFIG[acc.type];
        const active = accountId === acc.id;
        return (
          <button onClick={() => setAccountId(acc.id)} ...>
            <span>{cfg.emoji}</span><span>{acc.name}</span>
          </button>
        );
      })}
    </div>
  </div>
)}
```

Default account: `accounts.find(a => a.is_default)?.id ?? accounts[0]?.id ?? null`.

Plus a small "Reconcile shortcut" link at the bottom of the amount step:

```tsx
{!editingTransaction && (
  <button onClick={() => handleTypeChange('adjustment')} className="...">
    <Scale className="w-3.5 h-3.5" /> Reconcile an account balance instead
  </button>
)}
```

`handleNext` validates and routes:

```ts
function handleNext() {
  if (txType === 'transfer') {
    setStep('accounts');
  } else if (txType === 'expense') {
    const balance = getFromAccountBalance();
    if (balance <= 0 || parseFloat(amount) > balance) {
      setInsufficientOpen(true);  // open InsufficientBalanceSheet
      return;
    }
    setStep('category');
  } else {
    setStep('category');  // income
  }
}
```

### Step 2a: Category (expense)

`CategoryGrid` — 3-column grid of categories filtered by transaction type:

```tsx
const filtered = categories.filter((c) => {
  const ctype = c.category_type ?? (c.bucket_id ? 'expense' : 'income');
  if (transactionType === 'income') return ctype === 'income' || ctype === 'adjustment';
  return ctype === 'expense' || ctype === 'adjustment';
});
```

Each tile is `[emoji icon] / category name`. Selected state: gold border + 10% gold tint. The user just taps to select; no multi-select.

### Step 2b: Income category picker (income)

`IncomeCategoryPicker` — 7 hardcoded presets + an "Other" row with custom emoji + label inline editor:

```ts
export const INCOME_PRESETS = [
  { key: 'salary',         label: 'Salary',         emoji: '💼' },
  { key: 'side_hustle',    label: 'Side Hustle',    emoji: '⚡' },
  { key: 'gift',           label: 'Gift',           emoji: '🎁' },
  { key: 'refund',         label: 'Refund',         emoji: '💸' },
  { key: 'loan_repayment', label: 'Loan Repayment', emoji: '🤝' },
  { key: 'sale',           label: 'Sale',           emoji: '🏷️' },
  { key: 'bonus',          label: 'Bonus',          emoji: '🎉' },
] as const;
```

When the user picks a preset, `resolveIncomeCategory()` matches its label against existing income/adjustment categories by case-insensitive name comparison. If no match, `effectiveCategoryId = null` (the transaction is saved without a category). For "Other", the custom emoji + label are prepended to the note as `"{emoji} {label} — {note}"`.

### Step 3a: Accounts (transfer)

Two account chip groups labeled "From" and "To", separated by an arrow divider. Auto-selects a default `to_account` (`other = accounts.find(a => a.id !== accountId)`) when transfer is chosen. Validation: `accountId !== toAccountId` AND both non-null. Same insufficient-balance guard fires on Next from this step.

### Step 3b: Details (expense / income / transfer)

Note input + Date input. For expense + active target-type goals, an additional collapsible "Paid from a target?" affordance with rich preview:

```tsx
{txType === 'expense' && sinkingFundGoals.length > 0 && (
  <div>
    <button onClick={() => setSfExpanded(v => !v)}>
      {sfExpanded ? '▾' : '▸'} Paid from a target?
    </button>
    <Popover>
      <PopoverTrigger render={<button><Info /></button>} />
      <PopoverContent>
        Perpetual goals (like Life Savings) are designed to be untouchable...
      </PopoverContent>
    </Popover>
    <AnimatePresence>
      {sfExpanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
          {/* HintCard("target_intro") + select dropdown of target goals + live balance preview */}
          {/* Overpayment guard: red error card if numAmount > sfBalance */}
          {/* Empty-balance guard: red error card if sfBalance == 0 */}
          {/* Healthy preview: balance + "after this payment" + "won't count against your buckets" */}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
)}
```

Save is disabled when `sfOverpayment` is true.

### Step (alt): Reconcile

Standalone single-step UI (when `txType === 'adjustment'`). Layout:

```tsx
<HintCard hintId="transaction_sheet_reconcile" title="What is Reconcile?" body="..." variant="inline" />

{/* Account selector — only when not arriving from reconcileContext */}
{!reconcileContext && (<account chips>)}

{/* Sika's current balance display */}
<div>Sika shows: {formatMoney(sikaBalance)}</div>

{/* Actual balance input */}
<Input type="number" placeholder="0.00" value={reconcileActual} onChange={...} />

{/* Diff preview — color-coded */}
{reconcileActual !== '' && (
  <div style={{ backgroundColor: reconcileIsPositive ? '#00D9A318' : '#F43F5E18' }}>
    Adjustment: {reconcileIsPositive ? '+' : ''}{formatMoney(reconcileDiff)}
  </div>
)}

{/* Note (defaults to "Reconciled to {amount}" if blank) */}

{/* Cancel / Reconcile buttons */}
```

Where `sikaBalance` comes from `dashboardStats.accountBalances[accountId]` (or `reconcileContext.sikaBalance` if entered from `InsufficientBalanceSheet`), and `reconcileDiff = (parseFloat(reconcileActual) || 0) - sikaBalance`.

`handleReconcileSave` inserts an `adjustment` transaction with `amount = reconcileDiff` (signed), `category_id = null`, `transaction_date = today`, then awards `account_reconciled` momentum and runs `checkAndUnlockBadges('account_reconciled')`.

### Insufficient balance flow

When expense > available balance, `InsufficientBalanceSheet` opens (NOT the main sheet). Source: `src/components/transactions/insufficient-balance-sheet.tsx`. Bottom sheet on mobile / centered on desktop, with 3 action rows:

| Action | Effect |
|---|---|
| Top up {accountName} | `handleTypeChange('income')` — switches sheet to income mode |
| Use a different account | Closes insufficient sheet (user picks another chip) |
| Reconcile balance | `openReconcileSheet({ accountId, sikaBalance })` — switches sheet to reconcile flow with context preserved |

Plus a Cancel link.

### Validation rules

| Rule | Implementation |
|---|---|
| Amount > 0 | `canProceedAmount = parseFloat(amount) > 0` |
| Amount has at most 2 decimals | enforced inside `AmountKeypad.press` |
| Transfer needs distinct accounts | `accountId !== toAccountId && !!accountId && !!toAccountId` |
| Income preset selected (or "Other" with non-empty label) | `incomeCategoryValid = key !== null && (key !== 'other' || customLabel.trim().length > 0)` |
| Expense doesn't exceed account balance | `getFromAccountBalance()` check at Next; opens InsufficientBalanceSheet |
| Target-goal overpayment blocked | `!!sfOverpayment` disables Save |
| Reconcile diff non-zero | `reconcileDiff !== 0` |

### Insert payload

```ts
const payload = {
  amount: parseFloat(amount),
  type: txType,
  category_id: (txType === 'transfer' || txType === 'adjustment') ? null : effectiveCategoryId,
  account_id: accountId,
  to_account_id: txType === 'transfer' ? toAccountId : null,
  note: effectiveNote || null,
  transaction_date: txDate,
  paid_from_goal_id: txType === 'expense' ? paidFromGoalId : null,
};
```

The select clause used after insert/update — for hydrating the row with category/account/bucket joins:

```ts
const selectClause = '*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)';
```

### After-save side effects (insert branch only)

In order (`transaction-sheet.tsx:300-360`):

1. `hapticMedium()` haptic
2. `addTransaction(data)` to store
3. `analytics.transactionLogged({ type, bucket })`
4. `updateLoggingStreak(supabase, user.id)` → if milestone hit, fire toast (and `awardMomentum('logging_streak_7_days')` for the 7-day milestone); if freeze earned, fire info toast
5. `checkAndUnlockBadges(supabase, user.id, 'streak_updated')` → enqueue celebrations
6. `awardMomentum('transaction_logged')` (always +2 pts)
7. `checkAndUnlockBadges('transaction_logged')`
8. If `paid_from_goal_id` and goal has now reached its target_amount → mark goal `completed_at`, fire goal-completion toast, `awardMomentum('goal_completed')` (+100 pts), `checkAndUnlockBadges('goal_completed')`, open `NextCycleModal`
9. `revalidateForEntity('transaction')` (or `'sinking_fund_payment'`)
10. Type-specific success toast: `'Income logged!' / 'Transfer recorded!' / 'Expense logged!'`
11. `handleClose()` — closes sheet, resets state after 300ms

This same chain is documented in the HealthRow audit (lines 525-551, 1187-1196).

---

## 8. Detail View

**Does not exist.**

There is no `/transactions/[id]` route, no detail sheet, no "view full details" affordance. The 3-dot menu offers Edit (which opens the same TransactionSheet pre-filled) and Delete only. All metadata visible to the user is what's in the row chrome (category icon + name + account + note + date + amount, plus the Auto / 🎯 From fund pill chips).

iOS should mirror this. **Do not build a detail screen.** If a future product decision adds one, it can be added as a separate phase.

---

## 9. Bulk Operations

**None.**

No multi-select mode, no checkboxes, no bulk delete / categorize / export. The page has no `Select` button or long-press gesture for selection.

iOS should NOT add bulk operations in this rebuild — they don't exist on web. If iOS needs swipe-to-delete on individual rows, that's idiomatic and acceptable, but multi-select is out of scope.

---

## 10. Refresh Strategy

| Mechanism | Status |
|---|---|
| Pull-to-refresh on the list | **NOT IMPLEMENTED** on `/transactions` (it IS on dashboard via `PullToRefresh`, but not here) |
| Auto-refresh on focus | **NOT IMPLEMENTED** |
| Real-time Supabase channels | **NOT IMPLEMENTED** anywhere in the audited code |
| Refetch on filter change | **YES** — `loadTransactions(0, false)` runs in a `useEffect` with all URL filter params + `mutationCount` as deps |
| Refetch on `mutationCount` | **YES** — `useTransactionStore.bumpMutation()` increments a counter that triggers a refetch; called by `revalidateForEntity` (in `lib/revalidation.ts`) |

So the consistency model is: any insert/update/delete anywhere in the app calls `revalidateForEntity(...)`, which (among other things) bumps `mutationCount`, which causes the transactions list (and dashboard) to refetch.

iOS recommendation: implement pull-to-refresh on the iOS list (idiomatic), but ALSO mirror the mutation-count refetch pattern via `@Published` so e.g. logging from another tab refreshes this list when navigated to.

---

## 11. Transaction Types

```ts
export type TransactionType = 'expense' | 'income' | 'transfer' | 'adjustment';
```

Per-type rendering rules from `transaction-item.tsx`:

| Type | Title | Icon | Sign | Amount color | Notes |
|---|---|---|---|---|---|
| `expense`    | category name (or "Uncategorized") | category emoji on bucket-color tinted square | `-` | `text-foreground` | Account name shown below |
| `income`     | category name (or "Uncategorized") | category emoji on bucket-color tinted square | `+` | `text-[#D4A017]` (gold) | Account name shown below |
| `transfer`   | `From → To` | category emoji or default 💸 (no bucket color) | (none) | `text-muted-foreground` | No account-name subline (it's already in the title) |
| `adjustment` | `Balance Adjustment` + `adj` pill chip | `Scale` Lucide icon on muted background | `+` if positive, `-` if negative | gold if positive, red `#F43F5E` if negative | `txn.amount` is signed for adjustments |

`amount` field semantics:
- `expense` / `income` — always positive in DB; sign is implied by `type`. Display logic always wraps with `Math.abs()` and prefixes the sign character.
- `transfer` — positive in DB; the `from → to` story carries the directionality.
- `adjustment` — **signed** in DB. A positive adjustment increases the account balance; negative decreases it. The display preserves the sign.

There's no "draft" or "pending" type on web. All four are committed transactions.

---

## 12. Category Display

### Container

10×10 rounded square (`w-10 h-10 rounded-xl`), centered icon, background tinted by bucket color at 22% (`${bucket.color}22`):

```tsx
<div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
  style={{
    background: txn.type === 'adjustment'
      ? 'color-mix(in srgb, var(--muted-foreground) 10%, transparent)'
      : txn.category?.bucket
      ? `${txn.category.bucket.color}22`
      : 'var(--card)',
  }}>
  {txn.type === 'adjustment' ? <Scale className="..." /> : getIconEmoji(txn.category?.icon ?? null)}
</div>
```

### Fallback chain

1. `category.bucket.color` exists → bucket-color tinted background
2. Otherwise (e.g. transfer, or category without bucket) → `var(--card)` flat background
3. For adjustments → muted-foreground 10% mix instead of bucket color
4. Icon: `category.icon` mapped via `getIconEmoji` → emoji; fallback `💸`; for adjustments, Lucide `Scale` icon instead

### When there's no category

- **Transfer**: title is `From → To`, no category emoji semantically; uses default 💸 fallback
- **Adjustment**: title is `Balance Adjustment`, Scale icon, no category
- **Expense/Income with `category_id = null`**: title falls back to `'Uncategorized'`, icon falls back to default 💸

### Pill chips on the row

| Pill | When | Color |
|---|---|---|
| `adj`            | `type === 'adjustment'`         | muted bg + muted fg |
| `Auto`           | `generated_from_recurring` set  | `bg-[#60A5FA18] text-[#60A5FA]` (blue) |
| `🎯 From fund`    | `paid_from_goal_id` set         | `bg-[#00D9A318] text-[#D4A017]` (green-tinted bg, gold text) |

---

## 13. Icons

### Sources

| Surface | Source | Mapping |
|---|---|---|
| Category icon (in row + category grid) | `category.icon` (string, Lucide-style name) | `getIconEmoji(name)` mapping function (defined twice — once in `transaction-item.tsx:21-31`, once in `category-grid.tsx:6-16`) → emoji |
| Account icon (account chips in sheet, account label) | `ACCOUNT_TYPE_CONFIG[acc.type].emoji` | `lib/accounts.ts` (not read in this audit) |
| Type icon | Inline Lucide imports — `Scale` for adjustment, no specific icon for expense/income/transfer |
| FAB icon | Lucide `Plus` |
| Filter icon | Lucide `SlidersHorizontal`, `Search`, `X` |
| Tab bar | Lucide `Receipt` for Transactions tab |
| Row action menu | Lucide `MoreVertical`, `Pencil`, `Trash2` |
| Insufficient balance sheet | Lucide `Plus`, `ArrowLeftRight`, `Scale`, `AlertTriangle`, `ArrowRight`, `X` |

### Category icon emoji map (verbatim)

```ts
{
  home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
  car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
  'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
  'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
  gift: '🎁',
}
```

Default fallback: `💸`.

iOS should use either (a) the same emoji map (simplest, ships immediately), or (b) port to SF Symbols. If using SF Symbols, the rough mapping:

| Lucide name | Emoji | SF Symbol candidate |
|---|---|---|
| home | 🏠 | `house.fill` |
| shopping-cart | 🛒 | `cart.fill` |
| zap | ⚡ | `bolt.fill` |
| droplet | 💧 | `drop.fill` |
| wifi | 📶 | `wifi` |
| car | 🚗 | `car.fill` |
| utensils | 🍽️ | `fork.knife` |
| heart-pulse | 💊 | `pills.fill` (or `cross.fill`) |
| pizza | 🍕 | `fork.knife` (no native pizza) |
| film | 🎬 | `film.fill` |
| shopping-bag | 🛍️ | `bag.fill` |
| repeat | 🔄 | `repeat` |
| dumbbell | 🏋️ | `dumbbell.fill` |
| sparkles | ✨ | `sparkles` |
| piggy-bank | 🐷 | `dollarsign.circle.fill` |
| trending-up | 📈 | `chart.line.uptrend.xyaxis` |
| shield | 🛡️ | `shield.fill` |
| briefcase | 💼 | `briefcase.fill` |
| gift | 🎁 | `gift.fill` |

Recommendation: **stick with emojis on iOS for the row chrome** — it matches web 1:1, no mapping risk, and emojis render natively. Use SF Symbols only for type-level icons (Scale, MoreVertical, etc.) where SF Symbol is more idiomatic than an emoji.

---

## 14. Tab Bar Entry

File: `src/components/layout/bottom-nav.tsx` (full source, 75 lines):

```tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTransition, useState } from 'react';
import { motion } from 'framer-motion';
import { Home, Receipt, Wallet, Target, RefreshCw } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Home',         icon: Home },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/accounts',     label: 'Accounts',     icon: Wallet },
  { href: '/goals',        label: 'Goals',        icon: Target },
  { href: '/recurring',    label: 'Recurring',    icon: RefreshCw },
] as const;

export function BottomNav() {
  // ... renders tab bar with 5 tabs, mobile only (md:hidden)
  // active tab: gold (#D4A017) icon + label, gold underline animated via layoutId
  // inactive: muted icon + label
}
```

5 tabs, mobile only. Transactions is the **second tab** (index 1), iconography `Receipt`.

**No badge counts** on any tab. There's no "3 pending recurring" or "5 unread" indicator on the Transactions tab.

Desktop uses `SideRail` (`src/components/layout/side-rail.tsx`, not read in this audit) — likely the same 5 routes vertically. iOS Phase ships a tab bar regardless.

The active state animates with `layoutId="bottom-nav-indicator"` — the gold underline slides between tabs via spring (`stiffness: 500, damping: 35`). iOS' `TabView` with default styling already provides analogous behavior; no need to replicate the animation manually.

---

## 15. Hint Cards

Two HintIds related to transactions:

### `transaction_sheet_reconcile`

Placed inline at the top of the **reconcile step** in `TransactionSheet` (line 628):

```tsx
<HintCard
  hintId="transaction_sheet_reconcile"
  title="What is Reconcile?"
  body="Use Reconcile when Sika's account balance doesn't match your real account. Enter the actual balance and Sika logs an adjustment to match reality. Doesn't affect your buckets."
  variant="inline"
/>
```

NOT on the transactions tab itself — only inside the reconcile flow.

### `target_intro`

Placed inside the "Paid from a target?" expander in the details step (line 794), only shown until dismissed:

```tsx
{!sfHintDismissed && (
  <HintCard hintId="target_intro" title="What's a target?" body="..." cta="Got it" />
)}
```

### No hints on the transactions list page

There is no `transactions_intro`, `filter_intro`, or `swipe_intro` hint. The list page itself is hint-free. iOS should NOT introduce one for parity.

---

## 16. Data Dependencies

### Tables read

`transactions` joined with:
- `categories` (via `category_id`) → joined with `budget_buckets` (via `bucket_id`)
- `accounts` (twice — `account_id` and `to_account_id`)

Verbatim query shape:

```ts
let query = supabase
  .from('transactions')
  .select('*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)', { count: 'exact' })
  .eq('user_id', user.id)
  .order(orderCol, { ascending })
  .order('created_at', { ascending: false })
  .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

if (dateRange) query = query.gte('transaction_date', dateRange.from).lte('transaction_date', dateRange.to);
if (urlType !== 'all') query = query.eq('type', urlType);
if (urlAccount !== 'all') query = query.or(`account_id.eq.${urlAccount},to_account_id.eq.${urlAccount}`);
if (urlCategory !== 'all') query = query.eq('category_id', urlCategory);
if (urlAmountMin) query = query.gte('amount', parseFloat(urlAmountMin));
if (urlAmountMax) query = query.lte('amount', parseFloat(urlAmountMax));
```

### Categories list

Hydrated separately into the transaction store (not by this page's `loadTransactions`). Source: presumably `useDashboardData` or a dedicated hook (not fully traced in this audit) — categories are already in `useTransactionStore.categories` by the time the page renders.

### Accounts list

Already in `useAuthStore.accounts` (loaded by `useProfile`).

### Aggregations

**None on this page.** No running balance, no daily totals, no per-category sums. Just the row stream.

The dashboard does aggregations (cycle stats, bucket spend) — those are in `useDashboardData` and not relevant to this rebuild.

### Pagination

- Page size: 50
- `count: 'exact'` returned with each page
- `hasMore` = `(pageNum + 1) * PAGE_SIZE < count`
- Manual "Load more" button (no infinite-scroll IntersectionObserver)

### Caching

**None.** Every filter/sort change re-runs the query. There is no client-side cache layer (no React Query, no SWR). The transaction-store holds the most recent fetched page set; `mutationCount` triggers refetch.

---

## 17. Animations

| Animation | Trigger | Library |
|---|---|---|
| Row entry | mount | `framer-motion` `motion.div` with `initial={{ opacity: 0, height: 0 }}` `animate={{ opacity: 1, height: 'auto' }}` (`AnimatePresence`-wrapped) |
| Row exit (delete) | `setDeleting(true)` after successful delete | same `motion.div` exit `{ opacity: 0, height: 0 }` |
| Row layout (reflow on adjacent rows) | sibling delete | `layout` prop on the same `motion.div` |
| Tab indicator | active tab change in BottomNav | `layoutId="bottom-nav-indicator"` spring (`stiffness: 500, damping: 35`) |
| FAB entrance | mount | spring `stiffness: 300, damping: 20, delay: 0.6` from `scale: 0, opacity: 0` |
| FAB ripple | always | repeating `boxShadow` keyframe, 2s ease-out infinite |
| FAB tap | press | `whileTap={{ scale: 0.92 }}` |
| Sheet open/close | `isLogSheetOpen` | shadcn `Sheet` (slide from bottom, `data-state` driven CSS) |
| Step progress dots | step change | CSS `transition-colors` |
| "Paid from a target?" expand | `sfExpanded` toggle | `AnimatePresence` height + opacity, 0.2s |
| Amount keypad keys | press | `active:scale-95` (CSS) |
| Skeleton rows | loading | Tailwind `animate-pulse` |
| Filter chip active state | filter change | CSS `transition-all` (border + bg + color) |

**No** dedicated insertion animation for newly-added transactions — the new row appears at the top of the list because the store prepends, and `motion.div` with `layout` handles the visual settle. There's no confetti/fanfare on save (those are reserved for tier-up and badge unlock).

Filter change: instant (no transition between filter result sets — the skeleton or empty state appears, then the new list).

---

## iOS Implementation Notes (Transactions Tab)

### Models

iOS already has `Transaction` from Phase 7. Required fields (verify against current model):

```swift
enum TransactionType: String, Codable {
    case expense, income, transfer, adjustment
}

struct Transaction: Identifiable, Codable, Equatable {
    let id: UUID
    let userId: UUID
    let categoryId: UUID?
    let accountId: UUID?
    let toAccountId: UUID?       // transfer destination
    let amount: Double           // signed for adjustment, unsigned otherwise
    let type: TransactionType
    let note: String?
    let transactionDate: String  // YYYY-MM-DD
    let createdAt: Date
    let generatedFromRecurring: UUID?
    let goalId: UUID?
    let paidFromGoalId: UUID?

    // Joined rows (populate via decoded join)
    let category: Category?
    let account: AccountRef?
    let toAccount: AccountRef?
}

struct AccountRef: Codable, Equatable, Identifiable {
    let id: UUID
    let name: String
    let type: AccountType
    let color: String?
    let icon: String?
}

struct Category: Codable, Equatable, Identifiable {
    let id: UUID
    let userId: UUID?
    let bucketId: UUID?
    let name: String
    let icon: String?
    let isDefault: Bool
    let isArchived: Bool
    let categoryType: CategoryType
    let bucket: BudgetBucket?
}
```

Filter model (the URL-param shape on web, ported to a Swift struct):

```swift
struct TransactionFilters: Equatable {
    enum Period: String { case cycle, prevCycle = "prev_cycle", last30, last90, all }
    enum SortKey: String { case dateDesc = "date-desc", dateAsc = "date-asc", amountDesc = "amount-desc", amountAsc = "amount-asc" }

    var period: Period = .cycle
    var type: TransactionType? = nil          // nil = all
    var accountId: UUID? = nil
    var categoryId: UUID? = nil
    var bucket: BucketName? = nil             // client-side
    var sort: SortKey = .dateDesc
    var amountMin: Double? = nil
    var amountMax: Double? = nil
    var search: String = ""                   // client-side
}
```

### Service

iOS already has `TransactionService` for inserts (Phase 7). Required additions for this tab:

```swift
extension TransactionService {
    /// Returns (rows, totalCount) so the caller can drive "Load more"
    func fetchPage(
        userId: UUID,
        filters: TransactionFilters,
        page: Int,
        pageSize: Int = 50
    ) async throws -> (rows: [Transaction], totalCount: Int)

    /// Update an existing transaction (mirrors web's edit branch — does NOT trigger streak/badge mutations)
    func updateTransaction(
        id: UUID,
        payload: TransactionPayload
    ) async throws -> Transaction

    /// Hard delete (no soft-delete column on web)
    func deleteTransaction(id: UUID) async throws

    /// Reconcile-specific helper (insert adjustment with signed amount = actual - sika)
    func insertAdjustment(
        userId: UUID,
        accountId: UUID,
        signedAmount: Double,
        note: String?
    ) async throws -> Transaction
}
```

The `fetchPage` query mirrors the verbatim Supabase select clause from Section 16. `categoryId == nil` for transfer/adjustment regardless of input.

### AppState integration

```swift
final class AppState: ObservableObject {
    // existing...

    // Transactions tab state
    @Published var transactionsList: [Transaction] = []
    @Published var transactionFilters = TransactionFilters()
    @Published var transactionsPage: Int = 0
    @Published var transactionsHasMore: Bool = false
    @Published var transactionsLoading: Bool = false
    @Published var transactionsLoadingMore: Bool = false

    // Trigger refetch when filters change OR when mutationCount bumps
    @Published var mutationCount: Int = 0   // already exists from Phase 7?
}
```

The "refetch when filters change" can be either:
- Driven by `TransactionsView.onChange(of: filters)` (idiomatic SwiftUI),
- OR driven by an `AppState.refetchTransactions()` method called from the view.

### Components

| Component | Responsibility |
|---|---|
| `TransactionsView` | Top-level screen. Header + period tabs + search + filter button + list + Load more. |
| `PeriodTabsView` | 5-tab segmented control bound to `filters.period`. |
| `SearchField` | Plain `TextField` bound to `filters.search` (client-side filter). |
| `FilterButton` | Icon + active-count badge. Tap presents `FilterSheet`. |
| `FilterSheet` | Sheet (`presentationDetents`) containing Type chips, Account chips, Bucket chips, Category chips, Amount range, Sort chips, Clear all. Bound 1:1 to `filters`. |
| `TransactionDayCard` | Day header + divider-separated rows for that day. |
| `TransactionRowView` | Mirrors `TransactionItem` 1:1 — icon, title, account, pills, amount with type-aware sign+color, 3-dot menu (`Menu` SwiftUI button) with Edit/Delete. |
| `DeleteConfirmAlert` | `Alert` with destructive Delete button. |
| `TransactionSheet` | Multi-step bottom sheet — the load-bearing component. Sub-views:|
| → `AmountKeypadView` | Custom 12-key keypad (NOT system keyboard) bound to amount string. |
| → `AccountChipsView` | Chip group for from-account / to-account. |
| → `CategoryGridView` | 3-column grid filtered by tx type. |
| → `IncomeCategoryPickerView` | 7 presets + Other-with-custom-emoji+label inline editor. |
| → `ReconcileStepView` | Account selector + Sika balance display + Actual input + diff preview + Note + Save. |
| → `DetailsStepView` | Note + Date + (for expense) "Paid from a target?" expander with HintCard + select + balance preview. |
| `InsufficientBalanceSheet` | Bottom sheet with 3 actions (Top up / Different account / Reconcile). |
| `AddTransactionFab` | Floating button on `TransactionsView`, `HomeView` (shared). Spring entry, ripple. |

### Tab bar integration

If iOS has not yet introduced a `TabView` with 5 tabs (Home / Transactions / Accounts / Goals / Recurring), this rebuild is the right time to add it. Use SF Symbols matching:

| Tab | Web icon (Lucide) | iOS SF Symbol |
|---|---|---|
| Home         | Home      | `house.fill` (or `house`) |
| Transactions | Receipt   | `list.bullet.rectangle` (or `list.bullet`) |
| Accounts     | Wallet    | `wallet.pass.fill` |
| Goals        | Target    | `target` |
| Recurring    | RefreshCw | `arrow.clockwise` |

No tab-badge counts.

### Schema considerations

- The `transactions` table already exists; no migration needed.
- The query touches `transactions`, `categories`, `budget_buckets`, `accounts` — all already RLS-gated by `auth.uid() = user_id`.
- The Bearer-auth helper from `feat/bearer-auth-decisions` is **NOT needed** for this tab — Swift SDK reads directly via the user's session.

### Reconcile integration with `transaction-sheet.tsx` parity

iOS must wire all 3 entry points to reconcile:

1. "Reconcile shortcut" link in the amount step → switch type to adjustment
2. `InsufficientBalanceSheet` "Reconcile balance" button → open sheet in reconcile mode pre-bound to the account
3. Editing an existing adjustment row → open sheet pre-filled with the adjustment data (web sets `step='reconcile'` for `editingTransaction.type === 'adjustment'`)

The `reconcileContext` shape (`{ accountId, sikaBalance }`) becomes a `ReconcileContext` Swift struct passed to `TransactionSheetView` as an init param.

### Architecture decision: one big view or many sub-views

Recommend: **many sub-views, one orchestrator screen**.

`TransactionsView` is the orchestrator. It owns the filter state and the fetch coordination. Everything below the header is a separate `View` struct (`TransactionDayCard`, `TransactionRowView`, etc.). The sheet is a separate `View` mounted via `.sheet(isPresented:)`.

The `TransactionSheet` itself decomposes into per-step subviews so each step is independently previewable and testable. Web's 933-line component is hard to navigate; the iOS port should split aggressively.

### Phase splitting recommendation

**Split into 3 phases.** The web file count + cross-cutting concerns make a single-PR rebuild high-risk.

| Phase | Scope | Files touched | Why |
|---|---|---|---|
| **T1: List + Filter** | `TransactionsView`, `TransactionRowView`, `TransactionDayCard`, `FilterSheet`, `PeriodTabsView`, `SearchField`, `TransactionService.fetchPage`, `AppState` filter+pagination state | ~8-10 files | Lowest risk, no mutations, gives the user a working read-only list immediately. Validates the fetch shape, RLS posture, filter UX, pagination. |
| **T2: Add + Edit + Delete** | `TransactionSheet` (multi-step), `AmountKeypadView`, `CategoryGridView`, `IncomeCategoryPickerView`, `DetailsStepView`, `AddTransactionFab`, `InsufficientBalanceSheet`, `TransactionService.updateTransaction`/`deleteTransaction` mutations, **streak + momentum + badge side-effect chain** | ~12-15 files | Highest risk — mutation chain is the part most likely to drift from web (Section 7's 11-step after-save sequence). Need to port `updateLoggingStreak`, `awardMomentum`, `checkAndUnlockBadges` if not already shared between Phases 8/9. **Block on Phase 9 (HealthRow) being fully shipped** so the streak/momentum/badge mutations have somewhere to surface visually. |
| **T3: Reconcile + Insufficient balance** | `ReconcileStepView`, `InsufficientBalanceSheet` wiring, `TransactionService.insertAdjustment`, "Reconcile shortcut" link in amount step, edit-adjustment branch | ~4-5 files | Smaller surface, but exercises 3 entry points (Section 7 reconcile section). Low risk once T2 is done. |

Justification for splitting:
- **T1 is independently shippable** — the user can browse history without risk of write bugs.
- **T2 introduces all mutation paths** — separating it from T1 means a rollback only loses write capability, not browse capability.
- **T3 is low priority** — most users don't reconcile often, but it's needed for the InsufficientBalanceSheet flow which IS user-visible during expense entry. T3 can ship right after T2 in a follow-up PR.

If the team prefers one PR: at minimum, write thorough Snapshot/UI tests for T2's mutation chain and gate the FAB behind a flag for the first deploy.

### Out of scope

- **Transaction detail view** — does not exist on web. Don't add.
- **Bulk operations** (multi-select, bulk delete/categorize/export) — does not exist on web.
- **Real-time subscriptions** (Supabase channels) — not on web. Refetch-on-mutation is the model.
- **Pull-to-refresh on the transactions list** — not on web. iOS may add it as an idiomatic enhancement (low risk), but it's not required for parity.
- **Soft-delete / restore / archive** — web hard-deletes. Don't introduce a `deleted_at` column.
- **Swipe-to-delete row gesture** — web uses dropdown menu. iOS may add swipe as an idiomatic enhancement; the underlying delete call is identical.
- **Scheduled/recurring transactions UI** — that's a separate tab (`/recurring`), out of scope for this rebuild.
- **CSV/PDF export** — not on web.
- **Keyboard shortcuts** — desktop-only on web; not relevant on iOS.
- **`transactions_intro` HintCard on the tab** — does not exist on web. The only relevant hints (`transaction_sheet_reconcile`, `target_intro`) are inside the sheet flow, not on the tab page.
