# Cycle Detail Page Audit — 2026-05-08

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Phase 6.5 implementation —
the destination of `CycleCard` tap on Home.

Source of truth: web repo at branch `feat/welcome-push-and-pwa-install-guide`.
Builds on: `/audits/HERITAGE_THEMES_2026_05_08.md` (where this page's
role was first noted — the `CycleCard` tap navigates here).

---

## TL;DR for the iOS prompt author

- **One file, 242 lines, no sub-components**: `src/app/(app)/dashboard/cycle-detail/page.tsx`. Trivial to port.
- **The page has no "previous/next cycle" navigation of its own**. The cycle is resolved from a `?cycle=YYYY-MM-DD` URL param (set by the dashboard's chevron nav), or defaults to the current cycle. There's no in-page chevron pair, no "back to current" CTA, no future-cycle protection logic.
- **Single Supabase query**: one fetch against `transactions` filtered by `transaction_date BETWEEN cycleStart AND cycleEnd`, joined with `categories` + `accounts`. Everything else is in-memory aggregation.
- **Top-spending bar color is hard-coded rose** (`#F43F5E/60`). It is **not** derived from category icon color or bucket color — it's a uniform "spent" color across all rows. iOS should match.
- **Top-spending is capped at 5**. Income breakdown is uncapped.
- **No animations** beyond a CSS `transition-all` on the bar `width`. No stagger, no count-up, no entrance.
- **Income-only fallback chain for grouping** is *category name → note → "Other"* (see §5). Spending uses *category name → "Uncategorized"* (see §6).
- **Spending excludes `paid_from_goal_id` transactions** — sinking-fund-paid expenses don't double-count.

---

## 1. Route + Top-Level Component

### Route
`/dashboard/cycle-detail` (Next.js App-Router page).

File: `src/app/(app)/dashboard/cycle-detail/page.tsx` (whole file — lines 1–241)

```tsx
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Info } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { useCurrency } from '@/hooks/use-currency';
import { getCycleForDate, getCycleFromStartDate, parseCycleParam } from '@/lib/cycle';
import { Skeleton } from '@/components/ui/skeleton';
import type { Transaction } from '@/types';

type Breakdown = Array<{ name: string; amount: number }>;

function buildBreakdown(
  txns: Transaction[],
  predicate: (t: Transaction) => boolean,
  keyOf: (t: Transaction) => string,
  limit?: number,
): Breakdown {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (!predicate(t)) continue;
    const key = keyOf(t);
    map.set(key, (map.get(key) ?? 0) + Number(t.amount));
  }
  const list = Array.from(map.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  return limit ? list.slice(0, limit) : list;
}

function CycleDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { user, profile } = useAuthStore();
  useProfile();
  const { format: formatMoney } = useCurrency();

  const [txns, setTxns] = useState<Transaction[] | null>(null);

  const cycle = useMemo(() => {
    if (!profile) return null;
    const cycleStartDay = profile.cycle_start_day ?? 1;
    const param = searchParams.get('cycle') ?? '';
    const parsed = parseCycleParam(param);
    return parsed
      ? getCycleFromStartDate(parsed, cycleStartDay)
      : getCycleForDate(new Date(), cycleStartDay);
  }, [profile, searchParams]);

  useEffect(() => {
    if (!user || !cycle) return;
    let cancelled = false;
    async function load() {
      if (!user || !cycle) return;
      const cycleStart = format(cycle.start, 'yyyy-MM-dd');
      const cycleEnd = format(cycle.end, 'yyyy-MM-dd');
      const { data } = await supabase
        .from('transactions')
        .select('*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)')
        .eq('user_id', user.id)
        .gte('transaction_date', cycleStart)
        .lte('transaction_date', cycleEnd)
        .order('transaction_date', { ascending: false });
      if (!cancelled) setTxns((data ?? []) as Transaction[]);
    }
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cycle?.startDateStr]);

  if (!cycle || !txns) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-4">
        <div className="h-8 w-32 rounded-xl bg-muted animate-pulse" />
        <Skeleton className="h-24 rounded-2xl bg-muted" />
        <Skeleton className="h-40 rounded-2xl bg-muted" />
        <Skeleton className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  const incomeBreakdown = buildBreakdown(
    txns,
    (t) => t.type === 'income',
    (t) => t.category?.name ?? t.note ?? 'Other',
  );
  const totalReceived = incomeBreakdown.reduce((s, x) => s + x.amount, 0);

  const spendingBreakdown = buildBreakdown(
    txns,
    (t) => t.type === 'expense' && !t.paid_from_goal_id,
    (t) => t.category?.name ?? 'Uncategorized',
    5,
  );
  const totalSpent = txns
    .filter((t) => t.type === 'expense' && !t.paid_from_goal_id)
    .reduce((s, t) => s + Number(t.amount), 0);

  const cycleNet = totalReceived - totalSpent;
  const isNegative = cycleNet < 0;

  const periodLabel = `${format(cycle.start, 'MMM d')} — ${format(cycle.end, 'MMM d, yyyy')}`;
  const isEmpty = incomeBreakdown.length === 0 && spendingBreakdown.length === 0;

  return (
    <div className="max-w-2xl mx-auto pb-24 px-4 pt-6 md:px-8 space-y-6">
      <header className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full text-muted-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">Cycle Details</h1>
      </header>

      {/* Cycle period + net */}
      <section>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {periodLabel}
        </p>
        <p className={`text-3xl font-display font-bold tabular-nums ${
          isNegative ? 'text-[#F43F5E]' : cycleNet === 0 ? 'text-muted-foreground' : 'text-[#D4A017]'
        }`}>
          {isNegative ? '−' : ''}{formatMoney(Math.abs(cycleNet))}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Net cash flow this cycle
        </p>
      </section>

      {/* The math */}
      <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          How this is calculated
        </h2>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Received</span>
            <span className="font-medium tabular-nums text-[#D4A017]">+{formatMoney(totalReceived)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Spent</span>
            <span className="font-medium tabular-nums text-[#F43F5E]">−{formatMoney(totalSpent)}</span>
          </div>
          <div className="border-t border-border pt-2 mt-2 flex justify-between items-center font-semibold">
            <span>Net</span>
            <span className={`tabular-nums ${isNegative ? 'text-[#F43F5E]' : 'text-[#D4A017]'}`}>
              {isNegative ? '−' : '+'}{formatMoney(Math.abs(cycleNet))}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>
            Account balance corrections (reconciliations) and transfers between your own accounts aren&apos;t included.
          </p>
        </div>
      </section>

      {/* Income breakdown */}
      {incomeBreakdown.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Where Received came from
          </h2>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {incomeBreakdown.map(({ name, amount }) => (
              <div key={name} className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-foreground truncate">{name}</span>
                <span className="text-sm font-medium tabular-nums text-foreground shrink-0 ml-3">
                  {formatMoney(amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Spending breakdown */}
      {spendingBreakdown.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Top spending categories
          </h2>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {spendingBreakdown.map(({ name, amount }) => {
              const pct = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
              return (
                <div key={name} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-foreground truncate">{name}</span>
                    <span className="text-sm font-medium tabular-nums text-foreground shrink-0 ml-3">
                      {formatMoney(amount)}
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F43F5E]/60 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isEmpty && (
        <p className="text-sm text-muted-foreground text-center py-12">
          No transactions logged this cycle yet.
        </p>
      )}
    </div>
  );
}

export default function CycleDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-4">
          <div className="h-8 w-32 rounded-xl bg-muted animate-pulse" />
          <Skeleton className="h-24 rounded-2xl bg-muted" />
          <Skeleton className="h-40 rounded-2xl bg-muted" />
        </div>
      }
    >
      <CycleDetailContent />
    </Suspense>
  );
}
```

### Page chrome
- `max-w-2xl mx-auto` (≈ 672 px max width on desktop, full-bleed on mobile)
- Vertical padding: `pt-6 pb-24`
- Horizontal padding: `px-4 md:px-8`
- Section rhythm: `space-y-6` between sections
- Single header row at the top: chevron-left back button + h1 "Cycle Details"

### Page sections (top → bottom)
1. **Header** — back chevron + "Cycle Details" title
2. **Cycle period + net hero** — small period label + big net number
3. **"How this is calculated"** — three-line math card
4. **"Where Received came from"** — income list (rendered only if non-empty)
5. **"Top spending categories"** — spending list with progress bars (rendered only if non-empty)
6. **Empty state** — single muted line if both lists are empty

---

## 2. Cycle Parameter Handling

### URL pattern
`?cycle=YYYY-MM-DD` — the cycle's *start date* in ISO format.

The page parses it with `parseCycleParam(param)` (from
`src/lib/cycle.ts`), which returns either a parsed `Date` or `null`.
If null (or the param is absent), the page falls back to
`getCycleForDate(new Date(), profile.cycle_start_day)` — i.e. **the
current cycle**.

```tsx
const cycle = useMemo(() => {
  if (!profile) return null;
  const cycleStartDay = profile.cycle_start_day ?? 1;
  const param = searchParams.get('cycle') ?? '';
  const parsed = parseCycleParam(param);
  return parsed
    ? getCycleFromStartDate(parsed, cycleStartDay)
    : getCycleForDate(new Date(), cycleStartDay);
}, [profile, searchParams]);
```

### Where the param comes from
The `CycleCard` tap on Home preserves the dashboard's current `cycle`
URL param (see `src/components/dashboard/cycle-card.tsx:147–153`):

```ts
function handleOpenDetail() {
  const cycleParam = searchParams.get('cycle');
  const target = cycleParam
    ? `/dashboard/cycle-detail?cycle=${cycleParam}`
    : '/dashboard/cycle-detail';
  router.push(target);
}
```

So if the user is browsing a past cycle on the dashboard (via the
chevron pair at the top of `/dashboard`), tapping the card opens the
*detail page for that same past cycle*.

### Current vs past cycle
There is **no explicit "is this a past cycle?" branch on this page**.
The page renders identical chrome regardless. The only thing that
changes is the date range used for the Supabase query and the
`periodLabel` text.

### In-page navigation
**None.**
- No chevron pair to step to previous/next cycle.
- No "back to current" CTA.
- No "edit cycle" affordance.
- The only navigation control is the back arrow → `router.back()`.

### Future-cycle URL handling
The page does **not** guard against future-cycle params. If a user
manually crafts `?cycle=2099-01-01`, the page will render the chrome,
the math card will show zeroes, and the empty-state copy will appear.
No error, no redirect.

> iOS implication: Phase 6.5 does NOT need to ship past-cycle
> navigation on the detail view itself. Past-cycle browsing happens
> on Home (Phase 3 work), then the user taps the card and the detail
> page renders for whatever cycle they were on. iOS should accept a
> `cycle: BudgetCycle` parameter at navigation-destination time and
> render once.

### Cycle helpers (referenced, not redefined here)
- `parseCycleParam(str: string): Date | null` — accepts `YYYY-MM-DD`
- `getCycleForDate(today: Date, startDay: number): BudgetCycle` —
  returns `{ start, end, startDateStr, label, isCurrent, ... }`
- `getCycleFromStartDate(start: Date, startDay: number): BudgetCycle`

These already exist in iOS (Phase 3 shipped `CycleService` /
equivalent) — just feed them the right inputs.

---

## 3. Net Cash Flow Hero

### Source
File: `src/app/(app)/dashboard/cycle-detail/page.tsx` (lines 124–136)

```tsx
{/* Cycle period + net */}
<section>
  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
    {periodLabel}
  </p>
  <p className={`text-3xl font-display font-bold tabular-nums ${
    isNegative ? 'text-[#F43F5E]' : cycleNet === 0 ? 'text-muted-foreground' : 'text-[#D4A017]'
  }`}>
    {isNegative ? '−' : ''}{formatMoney(Math.abs(cycleNet))}
  </p>
  <p className="text-xs text-muted-foreground mt-1">
    Net cash flow this cycle
  </p>
</section>
```

### Structure (top → bottom)
1. **Period label** — e.g. "MAY 1 — MAY 31, 2026"; xs, uppercase,
   letter-spaced, muted. Format: `${MMM d} — ${MMM d, yyyy}`.
2. **Net amount** — text-3xl (≈30 px), `font-display` (the
   project's display font; Geist Sans heading weight),
   `font-bold`, `tabular-nums`. Color rules below.
3. **Caption** — xs muted, literal text "Net cash flow this cycle".

### Color rules
| Net value | Color |
| --- | --- |
| < 0 (negative) | `#F43F5E` (rose) |
| `=== 0` | `text-muted-foreground` (theme-dependent muted) |
| > 0 (positive) | `#D4A017` (Sika gold) |

### Sign formatting
- Negative: prefix `−` (U+2212 minus sign), wrap absolute value in `formatMoney`.
- Zero: no prefix.
- Positive: no prefix (gold styling carries the meaning).

> Note: the math card (section 4) uses `+` for positive net, but the
> hero does not. Intentional — the hero is the headline number; sign
> is conveyed by color.

### No comparison / delta
There is **no** "vs last cycle" indicator, percentage delta, arrow,
or sparkline. iOS should match — keep the hero clean.

### No progress bar / visualization in the hero itself
Just text. The progress bars only appear in the spending breakdown
(§6).

---

## 4. "How This Is Calculated" Card

### Source
File: `src/app/(app)/dashboard/cycle-detail/page.tsx` (lines 138–167)

```tsx
{/* The math */}
<section className="bg-card border border-border rounded-2xl p-4 space-y-3">
  <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
    How this is calculated
  </h2>

  <div className="space-y-2 text-sm">
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">Received</span>
      <span className="font-medium tabular-nums text-[#D4A017]">+{formatMoney(totalReceived)}</span>
    </div>
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">Spent</span>
      <span className="font-medium tabular-nums text-[#F43F5E]">−{formatMoney(totalSpent)}</span>
    </div>
    <div className="border-t border-border pt-2 mt-2 flex justify-between items-center font-semibold">
      <span>Net</span>
      <span className={`tabular-nums ${isNegative ? 'text-[#F43F5E]' : 'text-[#D4A017]'}`}>
        {isNegative ? '−' : '+'}{formatMoney(Math.abs(cycleNet))}
      </span>
    </div>
  </div>

  <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
    <p>
      Account balance corrections (reconciliations) and transfers between your own accounts aren&apos;t included.
    </p>
  </div>
</section>
```

### Structure
- Card chrome: `bg-card`, 1 px `border-border`, `rounded-2xl`,
  `p-4`, vertical rhythm `space-y-3`.
- Header: xs uppercase muted "How this is calculated".
- Three rows (sm text):
  1. **Received** (label muted) | `+{amount}` (gold, medium weight, tabular)
  2. **Spent** (label muted) | `−{amount}` (rose, medium weight, tabular)
  3. **Net** (label foreground, semibold) | `+/−{amount}` (gold or rose, semibold). Separated from rows 1–2 by a top border + 8 px padding.
- Footnote: 14 px `Info` icon + xs muted copy:
  > "Account balance corrections (reconciliations) and transfers between your own accounts aren't included."

### Sign formatting in this card
- Received: always prefixed `+` (it's always positive).
- Spent: always prefixed `−` (U+2212; always non-negative as displayed).
- Net: prefix `+` if non-negative, `−` if negative. (Differs from hero — hero omits `+`.)

### Reconciliation / transfer exclusion
The footnote mirrors the actual filter logic (§5/§6): `type === 'income'`
or `(type === 'expense' && !paid_from_goal_id)`. `transfer` and
`adjustment` types are silently excluded by the predicates — the
footnote explains why.

> iOS note: keep this footnote verbatim. It's a transparency
> commitment to the user, not a UX nicety.

---

## 5. Where Received Came From

### Query
The page makes one Supabase query (lines 62–68):

```ts
const { data } = await supabase
  .from('transactions')
  .select('*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)')
  .eq('user_id', user.id)
  .gte('transaction_date', cycleStart)
  .lte('transaction_date', cycleEnd)
  .order('transaction_date', { ascending: false });
```

It fetches **all** transactions in the cycle (income, expense,
transfer, adjustment) with full relational joins. The filtering /
grouping happens client-side via `buildBreakdown(...)`.

### Income breakdown derivation (lines 87–92)

```ts
const incomeBreakdown = buildBreakdown(
  txns,
  (t) => t.type === 'income',
  (t) => t.category?.name ?? t.note ?? 'Other',
);
const totalReceived = incomeBreakdown.reduce((s, x) => s + x.amount, 0);
```

### Grouping key (load-bearing)
**`category.name ?? note ?? 'Other'`** — three-level fallback:

1. If the income transaction has a category, group by the category name.
2. Else if it has a `note`, group by the note (e.g. user typed "March salary").
3. Else group as "Other".

> ⚠️ This is **not** "group by income source". The page does not join
> `income_sources` at all. Two manually-logged income transactions
> with category=null and note="Side hustle" both group into "Side
> hustle" — but two transactions tied to the same `IncomeSource` with
> *different* notes will appear as separate rows.

### Sort + cap
- Sorted descending by `amount`.
- **No cap** — all rows render. (`buildBreakdown` is called without a
  `limit` argument.)

### Visual structure (lines 169–186)

```tsx
{incomeBreakdown.length > 0 && (
  <section>
    <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
      Where Received came from
    </h2>
    <div className="bg-card border border-border rounded-2xl divide-y divide-border">
      {incomeBreakdown.map(({ name, amount }) => (
        <div key={name} className="flex justify-between items-center px-4 py-3">
          <span className="text-sm text-foreground truncate">{name}</span>
          <span className="text-sm font-medium tabular-nums text-foreground shrink-0 ml-3">
            {formatMoney(amount)}
          </span>
        </div>
      ))}
    </div>
  </section>
)}
```

- Section header: xs uppercase muted "Where Received came from", 12 px bottom margin.
- Container: `bg-card`, 1 px `border-border`, `rounded-2xl`, with
  per-row dividers via `divide-y divide-border`.
- Each row: 16 px / 12 px padding, name (sm, foreground, ellipsis on
  overflow) + amount (sm, medium weight, tabular).
- **No percentage of total** displayed (unlike the spending list).
- **No icon, no bar, no chevron**. Just name + amount.

### Empty state
The whole `<section>` is conditional on `incomeBreakdown.length > 0`.
If empty, the section is omitted entirely — no "no income this cycle"
copy. (Falls through to the page-level empty state if both lists are
empty; see §8.)

### Tap behavior
**Rows are not tappable.** No `onClick`, no anchor. iOS should match.

---

## 6. Top Spending Categories

### Query
Same as §5 — one fetch, client-side grouping.

### Spending breakdown derivation (lines 94–102)

```ts
const spendingBreakdown = buildBreakdown(
  txns,
  (t) => t.type === 'expense' && !t.paid_from_goal_id,
  (t) => t.category?.name ?? 'Uncategorized',
  5,
);
const totalSpent = txns
  .filter((t) => t.type === 'expense' && !t.paid_from_goal_id)
  .reduce((s, t) => s + Number(t.amount), 0);
```

### Grouping key (load-bearing)
**`category.name ?? 'Uncategorized'`** — two-level fallback:

1. If the transaction has a category, group by category name.
2. Else group as "Uncategorized".

> Differs from income (§5) which falls through to `note` first. Note
> is **never** used as a spending grouping key.

### Filter rules
- `type === 'expense'` only
- **`paid_from_goal_id` is null** — sinking-fund-paid expenses are
  excluded. (Their cost was already accounted for via the monthly
  goal contribution, so counting again would double-count.)

### Sort + cap
- Sorted descending by amount.
- **Capped at 5** (`buildBreakdown(..., 5)`). The 6th and beyond
  spending categories are silently excluded from this page.

### Visual structure (lines 188–216)

```tsx
{spendingBreakdown.length > 0 && (
  <section>
    <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
      Top spending categories
    </h2>
    <div className="bg-card border border-border rounded-2xl divide-y divide-border">
      {spendingBreakdown.map(({ name, amount }) => {
        const pct = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
        return (
          <div key={name} className="px-4 py-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-sm text-foreground truncate">{name}</span>
              <span className="text-sm font-medium tabular-nums text-foreground shrink-0 ml-3">
                {formatMoney(amount)}
              </span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F43F5E]/60 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  </section>
)}
```

- Same container chrome as the income list (`bg-card`, `rounded-2xl`,
  `divide-y`).
- Each row: 16/12 px padding.
- Name + amount header row (matches income list).
- **Then a 1 fb px progress bar** filled to `(amount / totalSpent) *
  100 %`.

### Bar color (load-bearing)

**Hard-coded `#F43F5E/60`** — i.e. rose-600 at 60% opacity.

```tsx
className="h-full bg-[#F43F5E]/60 rounded-full transition-all"
```

This is **not**:
- the category icon color
- the bucket color (Needs green / Wants amber / Savings blue)
- the user's selected card theme accent

It's a uniform "expense" treatment across all rows. iOS should match
exactly. Use the same `#F43F5E` at 60% opacity.

### Bar geometry
- Track: `h-1` (4 px tall), `bg-muted`, `rounded-full`, `overflow-hidden`.
- Fill: `h-full` of the track, `bg-[#F43F5E]/60`, `rounded-full`,
  width is the % of `totalSpent`.
- `transition-all` — CSS transition on width (300 ms default), so
  when the breakdown re-computes (e.g. after a parent re-render), the
  bar animates. There's no explicit duration override.

### Percentage of total
**Not displayed numerically** — the bar is the only visual
representation. Unlike the income list, no `(45%)` or similar
appears. iOS can match (no percentage label) — that's the spec.

### Empty state
The whole `<section>` is conditional on
`spendingBreakdown.length > 0`. If empty, omitted entirely. Falls
through to page-level empty state.

### Tap behavior
**Rows are not tappable.** No category drill-down from this page. (A
future "category detail" page is plausible but not part of this
audit.)

---

## 7. Animations

The page is **almost entirely static**:

- **Section entrance** — none. No framer-motion, no CSS keyframes,
  no Tailwind animate utilities on the sections.
- **Hero number swap** — none. No `motion.div` keyed on the amount.
  (Contrast with `CardSurface` on Home, which DOES animate
  balance changes — see HERITAGE_THEMES_2026_05_08.md §8.)
- **Progress bar** — `transition-all` Tailwind utility on the fill
  element. CSS transitions the `width` change; default duration ≈
  150 ms ease. **No initial 0% → final % animation on mount** — it
  just renders at the final width. The transition only matters if
  the data changes while mounted.
- **Skeletons** — `animate-pulse` Tailwind utility (the standard
  1.5 s opacity pulse).
- **Header back button** — `transition-colors` on hover/active.

> iOS port: skip all animation. Match web's static feel.

---

## 8. Empty State (whole page)

### Conditional copy (lines 218–222)

```tsx
{isEmpty && (
  <p className="text-sm text-muted-foreground text-center py-12">
    No transactions logged this cycle yet.
  </p>
)}
```

`isEmpty` is computed at line 108:

```ts
const isEmpty = incomeBreakdown.length === 0 && spendingBreakdown.length === 0;
```

So the empty-state line **only shows when both lists are empty** —
not when only one is empty. (If the user has only income and no
spending, the income list renders and there's no empty-state copy.)

### Important: hero + math card always render
Even with zero transactions:
- The period label still shows.
- The hero number shows `0` (zero), styled with `text-muted-foreground`.
- The "How this is calculated" card shows `+0` / `−0` / `+0`.
- The footnote still appears.

So the page has **no full-page empty illustration** — it gracefully
degrades to a sparsely-populated layout with one helpful line at the
bottom. iOS should mirror.

### Loading state
While `cycle === null` or `txns === null`, an alternative skeleton
layout renders (lines 76–85):

```tsx
if (!cycle || !txns) {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 md:px-8 space-y-4">
      <div className="h-8 w-32 rounded-xl bg-muted animate-pulse" />
      <Skeleton className="h-24 rounded-2xl bg-muted" />
      <Skeleton className="h-40 rounded-2xl bg-muted" />
      <Skeleton className="h-40 rounded-2xl bg-muted" />
    </div>
  );
}
```

Header bar (32 px tall), one short hero skeleton (96 px), two list
skeletons (160 px each). No section labels.

The `<Suspense>` fallback (lines 229–236) is an even simpler
3-skeleton variant used while the route segment is hydrating.

---

## 9. Typography + Tokens

### Section headers
- Class: `text-xs uppercase tracking-wider text-muted-foreground`
- Resolves to ≈ 12 px, uppercase, letter-spaced, theme-muted color
- Used by: period label, "How this is calculated", "Where Received
  came from", "Top spending categories"

### Hero amount
- Class: `text-3xl font-display font-bold tabular-nums`
- Resolves to ≈ 30 px, the project's display font, weight 700, fixed-width digits
- Color: dynamic per net sign (see §3)

### Math card rows
- Body: `text-sm` (≈ 14 px)
- Labels (Received / Spent): `text-muted-foreground` (muted gray)
- Amounts: `font-medium tabular-nums`, accent color (gold/rose)
- Net row: `font-semibold` for both label and amount
- Footnote: `text-xs text-muted-foreground` with leading `Info` icon at `w-3.5 h-3.5`

### List rows
- Name + amount: `text-sm`
- Amount: `font-medium tabular-nums`
- Names truncate with `truncate` (CSS `text-overflow: ellipsis`)

### Container chrome (consistent across math card + lists)
- `bg-card` (theme card surface)
- `border border-border` (1 px theme border)
- `rounded-2xl` (16 px)
- `p-4` (math card) or `divide-y divide-border` (lists, no outer padding — rows handle it)

### Number formatting
- All amounts pass through `useCurrency().format` — uses the user's
  selected currency code (default GHS) with locale-aware thousands
  separator.
- `tabular-nums` ensures fixed-width digits so right-aligned amounts
  line up vertically.
- **No compact format** (no "1.2K"). Full numerals always.
- Sign: explicit `+` or `−` prefixes (U+2212 minus). Net hero omits
  `+`; net row in math card includes it.

### Color tokens used (per Tailwind config + inline)
| Purpose | Hex |
| --- | --- |
| Sika gold (positive) | `#D4A017` |
| Rose (negative / spent / progress fill) | `#F43F5E` |
| Progress fill at opacity | `#F43F5E/60` (≈ 60%) |
| Muted text | `text-muted-foreground` (theme-dependent) |

---

## iOS Implementation Notes (Phase 6.5)

### Models

No new persistent models. Add a few in-memory aggregation structs:

```swift
struct CycleBreakdownRow: Identifiable, Hashable {
  let name: String
  let amount: Decimal
  var id: String { name }
}

struct CycleDetailSummary {
  let period: BudgetCycle           // existing iOS model from Phase 3
  let totalReceived: Decimal
  let totalSpent: Decimal
  var net: Decimal { totalReceived - totalSpent }
  let receivedBySource: [CycleBreakdownRow]      // uncapped, sorted desc
  let topSpending: [CycleBreakdownRow]           // capped at 5, sorted desc
  var isEmpty: Bool { receivedBySource.isEmpty && topSpending.isEmpty }
}
```

The `Transaction`, `Category`, `BudgetCycle` types already exist on
iOS — no changes needed.

### Service

Add a method to whichever service owns transaction queries (e.g.
`TransactionService` or a new `CycleDetailService`):

```swift
@MainActor
final class CycleDetailService {
  let supabase: SupabaseClient

  /// One Supabase fetch + client-side aggregation. Mirrors web's
  /// /dashboard/cycle-detail page exactly.
  func fetchSummary(userID: UUID, cycle: BudgetCycle) async throws -> CycleDetailSummary {
    let cycleStart = cycle.start.asYYYYMMDD()
    let cycleEnd = cycle.end.asYYYYMMDD()

    let txns: [Transaction] = try await supabase
      .from("transactions")
      .select("""
        *,
        category:categories(*, bucket:budget_buckets(*)),
        account:accounts!account_id(id,name,type,color,icon),
        to_account:accounts!to_account_id(id,name,type,color,icon)
      """)
      .eq("user_id", value: userID)
      .gte("transaction_date", value: cycleStart)
      .lte("transaction_date", value: cycleEnd)
      .order("transaction_date", ascending: false)
      .execute()
      .value

    return Self.aggregate(transactions: txns, cycle: cycle)
  }

  /// Pure function — keep it unit-testable.
  static func aggregate(transactions txns: [Transaction], cycle: BudgetCycle) -> CycleDetailSummary {
    // Income breakdown: type=income, group by category?.name ?? note ?? "Other"
    let receivedRaw = txns
      .filter { $0.type == .income }
      .reduce(into: [String: Decimal]()) { acc, t in
        let key = t.category?.name ?? t.note ?? "Other"
        acc[key, default: 0] += t.amount
      }
    let receivedBySource = receivedRaw
      .map { CycleBreakdownRow(name: $0.key, amount: $0.value) }
      .sorted { $0.amount > $1.amount }
    let totalReceived = receivedBySource.reduce(0) { $0 + $1.amount }

    // Spending breakdown: type=expense AND paid_from_goal_id == nil,
    // group by category?.name ?? "Uncategorized", capped at 5.
    let spendingRaw = txns
      .filter { $0.type == .expense && $0.paidFromGoalID == nil }
      .reduce(into: [String: Decimal]()) { acc, t in
        let key = t.category?.name ?? "Uncategorized"
        acc[key, default: 0] += t.amount
      }
    let topSpending = spendingRaw
      .map { CycleBreakdownRow(name: $0.key, amount: $0.value) }
      .sorted { $0.amount > $1.amount }
      .prefix(5)
      .map { $0 }
    let totalSpent = txns
      .filter { $0.type == .expense && $0.paidFromGoalID == nil }
      .reduce(0) { $0 + $1.amount }

    return .init(
      period: cycle,
      totalReceived: totalReceived,
      totalSpent: totalSpent,
      receivedBySource: receivedBySource,
      topSpending: topSpending
    )
  }
}
```

> Note the **two grouping keys** are different (income falls through
> to `note`, spending does not). Match exactly.

### AppState integration

**Don't cache in AppState.** Web fetches on mount and lets React
unmount handle teardown. iOS should match — fetch in `.task` on view
appear, with a cancellation-aware async function.

```swift
struct CycleDetailView: View {
  let cycle: BudgetCycle              // passed in via navigationDestination
  @EnvironmentObject var auth: AuthState
  @State private var summary: CycleDetailSummary?
  @State private var isLoading = true

  var body: some View {
    // ...
      .task(id: cycle.startDateString) {
        do {
          guard let uid = auth.userID else { return }
          summary = try await cycleDetailService.fetchSummary(userID: uid, cycle: cycle)
        } catch {
          summary = nil  // falls through to skeleton -> retry on next appear
        }
        isLoading = false
      }
  }
}
```

`task(id:)` re-runs if the cycle changes. (It won't in this view —
the cycle is fixed at navigation time — but harmless.)

### Components

```swift
struct CycleDetailView: View { /* see above */ }

struct NetCashFlowHero: View {
  let summary: CycleDetailSummary
  // shows period label + big net number + caption
}

struct HowCalculatedCard: View {
  let summary: CycleDetailSummary
  // 3 rows + Info-icon footnote, exact copy from §4
}

struct ReceivedSourcesList: View {
  let rows: [CycleBreakdownRow]
  // section header + list of (name, amount) rows
  // omitted entirely if rows.isEmpty
}

struct TopCategoriesList: View {
  let rows: [CycleBreakdownRow]
  let totalSpent: Decimal
  // section header + list of (name, amount, progress bar) rows
  // bar fill: Color(hex: 0xF43F5E).opacity(0.6)
  // omitted entirely if rows.isEmpty
}
```

#### Progress bar implementation

```swift
struct SpendingBar: View {
  let pct: Double  // 0...100
  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(Color(.tertiarySystemFill))   // bg-muted equivalent
        Capsule().fill(Color(hex: 0xF43F5E).opacity(0.6))
          .frame(width: geo.size.width * pct / 100)
      }
    }
    .frame(height: 4)                                 // h-1 in tailwind
  }
}
```

No spring animation; web uses CSS `transition-all` which only fires
on width *change*. SwiftUI's `.animation(nil)` is fine here.

### Slot

Wired to the `CycleCard` tap on Home (currently a no-op from Phase 6).
Use `navigationDestination` keyed on a value type:

```swift
struct DashboardView: View {
  @State private var detailCycle: BudgetCycle?

  var body: some View {
    NavigationStack {
      // ... existing dashboard content ...
      CycleCard(theme: theme, cycle: cycle, /* ... */)
        .onTapGesture { detailCycle = cycle }   // pass currently-browsed cycle

      // ...
      .navigationDestination(item: $detailCycle) { cycle in
        CycleDetailView(cycle: cycle)
      }
    }
  }
}
```

Past-cycle handling: if Phase 3 ships dashboard cycle-chevron
navigation, the dashboard's `cycle` state is what gets passed in. The
detail view doesn't care whether it's current or past.

> **Phase 6.5 does NOT need to ship past-cycle chevrons on the
> detail view.** Web doesn't have them; the detail view always
> renders for the cycle it was opened with.

### Data dependencies on existing iOS work

- **`BudgetCycle`** with `start: Date`, `end: Date`, `startDateString`
  — already in iOS Phase 3.
- **`Transaction`** model with `type: .income/.expense/.transfer/...`,
  `amount: Decimal`, `note: String?`, `paidFromGoalID: UUID?`,
  `category: Category?` — already in iOS.
- **Currency formatter** — already in iOS (used by other surfaces).
- Auth user ID accessor — already in iOS.

### Schema considerations

**No new tables, no new columns.** The page is a read-only aggregation
over the existing `transactions` + `categories` joins. RLS already
covers per-user scoping.

The page makes **one** Supabase fetch. iOS should not make multiple
separate queries for received/spent — match web's single-fetch
pattern, both for parity and to avoid race conditions.

### Out of scope for Phase 6.5

- **Past-cycle chevron navigation on the detail view itself.** Web
  doesn't have this. Past-cycle browsing is a Home concern.
- **Per-category drill-down.** Tapping a spending row is a no-op on
  web. Add it in a future "Category Detail" feature.
- **Editing transactions from this page.** Read-only.
- **"Last cycle" comparison / delta.** Web doesn't show this.
- **Charts beyond the simple progress bar.** No pie chart, no time
  series.
- **Cycle deletion.** N/A — cycles are computed, not stored as rows.
- **Animations on entrance / number count-up.** Web has none.
- **Empty-state illustration.** Web shows a single muted line; iOS
  should match (don't ship an SF Symbol-decorated empty view).

### Source-of-truth file for iOS Phase 6.5 prompt

Just one file to embed verbatim — **`src/app/(app)/dashboard/cycle-detail/page.tsx`** (242 lines).

Plus the cycle helpers from `src/lib/cycle.ts` (`parseCycleParam`,
`getCycleForDate`, `getCycleFromStartDate`) — but those should
already have iOS equivalents from Phase 3. If not, audit `src/lib/cycle.ts`
separately before Phase 6.5.
