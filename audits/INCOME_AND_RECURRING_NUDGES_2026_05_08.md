# Income Nudge + Pending Recurring Audit — 2026-05-08

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Phase 7 implementation —
`IncomeNudgeCard` + `PendingRecurringCard`.

Source of truth: web repo at branch `feat/welcome-push-and-pwa-install-guide`.

---

## TL;DR

- **`IncomeNudgeCard`** is **derived client-side** from `income_sources` +
  today's calendar position. Dismissals are persisted in a dedicated
  `income_nudge_dismissals` table (per-source, per-due-date).
- **`PendingRecurringCard`** is **derived client-side** from
  `recurring_transactions.last_generated_date` vs. computed due dates.
  No separate dismissal table — "I handled it" is encoded by bumping
  `last_generated_date`.
- Both cards are **separate components** in one file
  (`src/components/dashboard/income-nudge-card.tsx`) but **share no base
  component** with each other or with `HintCard`. They share visual
  conventions (`rounded-2xl`, `bg-card`, accent border) and identical
  framer-motion entrance animations.
- The same file/source-of-truth functions also power the `income-reminders`
  cron (push notifications), so iOS reading this file should treat
  `getDueIncomeNudges` as the canonical "what's due today" definition.

---

## PART A — Income Nudge Card

### A.1 Component
File: `src/components/dashboard/income-nudge-card.tsx` (lines 1–64)

```tsx
'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Clock, X } from 'lucide-react';
import { useCurrency } from '@/hooks/use-currency';
import type { IncomeNudge } from '@/types';

interface IncomeNudgeCardProps {
  nudge: IncomeNudge;
  onLog: (nudge: IncomeNudge) => void;
  onSnooze: (nudge: IncomeNudge) => void;
  onDismiss: (nudge: IncomeNudge) => void;
}

export function IncomeNudgeCard({ nudge, onLog, onSnooze, onDismiss }: IncomeNudgeCardProps) {
  const { format } = useCurrency();
  const { incomeSource } = nudge;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="bg-card border border-[#D4A017]/30 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">💰</span>
        <div className="flex-1 min-w-0">
          <p className="text-foreground text-sm font-semibold">
            {incomeSource.name} expected today
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Did you receive {format(incomeSource.amount)}?
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onLog(nudge)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#D4A017] text-[#0E1A2E] text-xs font-semibold hover:bg-[#B8891A] transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Yes, log it
            </button>
            <button
              onClick={() => onSnooze(nudge)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              Not yet
            </button>
          </div>
        </div>
        <button
          onClick={() => onDismiss(nudge)}
          className="text-muted-foreground/70 hover:text-muted-foreground transition-colors shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
```

### A.2 Data Shape

#### TypeScript
File: `src/types/index.ts`

```ts
// (line 4)
export type IncomeFrequency = 'monthly' | 'weekly' | 'biweekly' | 'irregular';

// (lines 12–23)
export interface IncomeSource {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  expected_day: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// (lines 107–110) — note: this is the entire shape, just an in-memory wrapper
export interface IncomeNudge {
  incomeSource: IncomeSource;
  dueDate: string; // YYYY-MM-DD
}
```

> **Important:** there is **no `IncomeNudge` table.** `IncomeNudge` is an
> ephemeral in-memory object built on the client (or by the push cron)
> from an `IncomeSource` row plus today's date.

#### Backing tables
File: `supabase/migrations/0002_income_sources.sql` (lines 1–12)

```sql
create table income_sources (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  frequency text not null check (frequency in ('monthly','weekly','biweekly','irregular')),
  expected_day int, -- day of month for monthly (1-31), day of week for weekly (0-6), null for irregular
  is_active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_income_sources_user on income_sources(user_id) where is_active = true;
alter table income_sources enable row level security;
create policy "own income sources" on income_sources for all using (auth.uid() = user_id);
```

`expected_day` semantics differ by `frequency`:
- `monthly` → day-of-month (1–31)
- `weekly` / `biweekly` → day-of-week (0=Sun, 6=Sat)
- `irregular` → null (never produces a nudge)

Dismissal storage (added in migration 0006 alongside recurring tables):
File: `supabase/migrations/0006_recurring_transactions.sql` (lines 49–61)

```sql
-- Income nudge dismissals: track user responses to "did your income arrive?" cards
create table income_nudge_dismissals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  income_source_id uuid references income_sources on delete cascade not null,
  due_date date not null,
  action text not null check (action in ('logged','snoozed','dismissed')),
  created_at timestamptz default now(),
  unique(user_id, income_source_id, due_date)
);

alter table income_nudge_dismissals enable row level security;
create policy "own dismissals" on income_nudge_dismissals for all using (auth.uid() = user_id);
```

> Composite uniqueness is `(user_id, income_source_id, due_date)`. The
> `action` column stores how the dismissal happened (logged / snoozed /
> dismissed) — but **all three actions equally suppress the card** for
> that (source, day). Snooze is *not* a tomorrow-recheck mechanism on
> web; see A.5.

### A.3 Trigger Logic
File: `src/lib/income-nudges.ts` (lines 1–68)

```ts
import { format, getDate, getDay } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IncomeSource, IncomeNudge } from '@/types';

/**
 * Determine if an income source is "due" today based on its frequency and expected_day.
 * Returns the due date string if due, null if not.
 */
function getIncomeDueDate(source: IncomeSource, today: Date): string | null {
  if (!source.is_active || source.expected_day === null) return null;

  const todayStr = format(today, 'yyyy-MM-dd');

  switch (source.frequency) {
    case 'monthly':
      // Due on the expected day of each month
      if (getDate(today) === source.expected_day) return todayStr;
      break;
    case 'weekly':
      // expected_day is day of week (0=Sun, 6=Sat)
      if (getDay(today) === source.expected_day) return todayStr;
      break;
    case 'biweekly':
      // Approximate: same day of week (exact phase tracking would require reference date)
      if (getDay(today) === source.expected_day) return todayStr;
      break;
    case 'irregular':
      return null;
  }

  return null;
}

/**
 * Fetch all income nudges that are due today and haven't been dismissed.
 */
export async function getDueIncomeNudges(
  supabase: SupabaseClient,
  userId: string,
  incomeSources: IncomeSource[],
  today: Date = new Date()
): Promise<IncomeNudge[]> {
  // Find which sources are due today
  const dueSourcesWithDates = incomeSources
    .map(s => ({ source: s, dueDate: getIncomeDueDate(s, today) }))
    .filter(({ dueDate }) => dueDate !== null) as { source: IncomeSource; dueDate: string }[];

  if (dueSourcesWithDates.length === 0) return [];

  // Fetch dismissals for today's due sources
  const sourceIds = dueSourcesWithDates.map(({ source }) => source.id);
  const todayStr = format(today, 'yyyy-MM-dd');

  const { data: dismissals } = await supabase
    .from('income_nudge_dismissals')
    .select('income_source_id, action')
    .eq('user_id', userId)
    .eq('due_date', todayStr)
    .in('income_source_id', sourceIds);

  const dismissedIds = new Set(
    (dismissals ?? []).map((d: { income_source_id: string; action: string }) => d.income_source_id)
  );

  return dueSourcesWithDates
    .filter(({ source }) => !dismissedIds.has(source.id))
    .map(({ source, dueDate }) => ({ incomeSource: source, dueDate }));
}
```

> **Important quirks:**
> - Trigger is **today-only**. A source whose `expected_day` was 3 days
>   ago does *not* surface a nudge today — there is no "missed income"
>   backlog.
> - `biweekly` is treated identically to `weekly` (just day-of-week
>   match). The comment explicitly notes phase tracking is not done.
> - "Did you actually receive an income transaction today?" is **not**
>   checked. The card shows even if a matching `transactions` row already
>   exists; the user is expected to dismiss/log accordingly.
> - There is **no per-cycle suppression** on the income side. The same
>   source can nudge again next month/week.

Dashboard call site — File: `src/app/(app)/dashboard/page.tsx` (lines 171–175):

```ts
// Fetch income nudges once profile + income sources are available
useEffect(() => {
  if (!user || incomeSources.length === 0) return;
  getDueIncomeNudges(supabase, user.id, incomeSources).then(setNudges);
}, [user, incomeSources]);
```

This effect runs **only** when `user` or `incomeSources` changes — so
nudges are recomputed on app load and on income-source CRUD, but **not
when the calendar day rolls over** during a long-lived session.

### A.4 Action Flow
Three actions, all defined in `src/app/(app)/dashboard/page.tsx`:

```ts
// (lines 194–213)
async function handleLogNudge(nudge: IncomeNudge) {
  if (!user) return;
  const defaultAccount = accounts.find(a => a.is_default) ?? accounts[0];
  if (!defaultAccount) { toast.error('No account found'); return; }

  const today = format(new Date(), 'yyyy-MM-dd');
  await supabase.from('transactions').insert({
    user_id: user.id,
    account_id: defaultAccount.id,
    category_id: null,
    amount: nudge.incomeSource.amount,
    type: 'income',
    note: nudge.incomeSource.name,
    transaction_date: today,
  });
  await recordNudgeDismissal(supabase, user.id, nudge.incomeSource.id, nudge.dueDate, 'logged');
  setNudges(prev => prev.filter(n => n.incomeSource.id !== nudge.incomeSource.id));
  revalidateForEntity('transaction');
  toast.success(`Logged ${formatMoney(nudge.incomeSource.amount)} income`);
}

// (lines 215–220)
async function handleSnoozeNudge(nudge: IncomeNudge) {
  if (!user) return;
  await recordNudgeDismissal(supabase, user.id, nudge.incomeSource.id, nudge.dueDate, 'snoozed');
  setNudges(prev => prev.filter(n => n.incomeSource.id !== nudge.incomeSource.id));
  toast('Reminder snoozed — we\'ll check again tomorrow');
}

// (lines 222–226)
async function handleDismissNudge(nudge: IncomeNudge) {
  if (!user) return;
  await recordNudgeDismissal(supabase, user.id, nudge.incomeSource.id, nudge.dueDate, 'dismissed');
  setNudges(prev => prev.filter(n => n.incomeSource.id !== nudge.incomeSource.id));
}
```

#### Action semantics
| Button | Server effect | Client effect |
| --- | --- | --- |
| **"Yes, log it"** (primary) | Insert a `transactions` row with `type='income'`, `account_id = default account`, `category_id = null`, `amount = source.amount`, `note = source.name`, `transaction_date = today`. Then upsert dismissal with `action='logged'`. | Remove from local nudge list; toast success. |
| **"Not yet"** (secondary) | Upsert dismissal with `action='snoozed'`. | Remove from local nudge list; toast "we'll check again tomorrow". |
| **X** (corner) | Upsert dismissal with `action='dismissed'`. | Remove from local nudge list; no toast. |

> ⚠️ **Snooze does NOT come back tomorrow as different content.** All
> three actions write to the same `(user_id, source_id, due_date)`
> uniqueness key. The toast text "we'll check again tomorrow" is just
> reassurance — tomorrow is a *new* `due_date`, so naturally that
> source's next due day produces a fresh nudge regardless of action.
> The `action` field is metadata for analytics/cron, not behavioral.

The "log it" path **does not open the Add Transaction wizard**. It
inserts directly with the income source's saved amount and the user's
default account. The `category_id` is `null` (income has no bucket).

### A.5 Dismiss/Snooze Tracking
Persistence helper — File: `src/lib/income-nudges.ts` (lines 70–85):

```ts
/**
 * Record a user response to an income nudge.
 * Uses upsert to handle re-actions (e.g., snooze → logged).
 */
export async function recordNudgeDismissal(
  supabase: SupabaseClient,
  userId: string,
  incomeSourceId: string,
  dueDate: string,
  action: 'logged' | 'snoozed' | 'dismissed'
): Promise<void> {
  await supabase.from('income_nudge_dismissals').upsert(
    { user_id: userId, income_source_id: incomeSourceId, due_date: dueDate, action },
    { onConflict: 'user_id,income_source_id,due_date' }
  );
}
```

State location: `income_nudge_dismissals` table (one row per
`(user_id, source_id, due_date)`).

Effective behavior: **dismiss is permanent for that day**, regardless of
the action label. A "snoozed" nudge is functionally identical to a
"dismissed" nudge until the next `expected_day` rolls around.

### A.6 Visual Structure
- Chrome: `bg-card`, **`rounded-2xl`** (note: NOT `rounded-xl` like
  Phase 5 banners), border `#D4A017/30` (Sika gold @ 30%), `p-4`
- Layout: emoji 💰 (text-2xl) | text block (semibold sm + muted xs) +
  inline action button row | corner X
- Buttons: primary "Yes, log it" (gold fill, dark text, CheckCircle2
  icon, h-8 px-3 rounded-xl), secondary "Not yet" (muted bg, Clock icon)
- Animations: framer-motion `initial={opacity:0, y:-8}`, `animate={opacity:1, y:0}`,
  `exit={opacity:0, y:-8}`, `duration:0.2, ease:'easeOut'`. Wrapped in
  `<AnimatePresence mode="popLayout">` at the dashboard level for
  smooth removal.
- Compared to Phase 4 `HintCard`: visually similar (rounded card,
  accent border), but `HintCard` uses `dismissed_hints` table with
  string IDs and has a different chrome. Not shared.

---

## PART B — Pending Recurring Card

### B.1 Component
Same file as A.1 — `src/components/dashboard/income-nudge-card.tsx` (lines 66–110)

```tsx
interface PendingRecurringCardProps {
  name: string;
  amount: number;
  dueDate: string;
  onConfirm: () => void;
  onSkip: () => void;
}

export function PendingRecurringCard({ name, amount, dueDate, onConfirm, onSkip }: PendingRecurringCardProps) {
  const { format } = useCurrency();
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="bg-card border border-[#FBBF24]/30 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="text-foreground text-sm font-semibold">{name} due</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {format(amount)} · {dueDate}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#FBBF24] text-[#0E1A2E] text-xs font-semibold hover:bg-[#F59E0B] transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Log it
            </button>
            <button
              onClick={onSkip}
              className="h-8 px-3 rounded-xl bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

> Note: this card has **no X button**. Only "Log it" and "Skip" — both
> resolve the prompt in different ways. There's no "snooze" or
> "dismiss-without-deciding" path.

### B.2 Data Shape
#### TypeScript
File: `src/types/index.ts` (lines 5, 85–105)

```ts
export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  type: 'expense' | 'income';
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  schedule_day: number | null;
  auto_log: boolean;
  last_generated_date: string | null;
  is_active: boolean;
  is_paused: boolean;
  created_at: string;
  updated_at: string;
  account?: AccountRef | null;
  category?: Category | null;
}
```

The "pending" wrapper used by the dashboard is:

```ts
{ recurring: RecurringTransaction; dueDates: string[] }
```

— one entry per recurring rule, with an array of all missed due dates
(may be more than one if the user opens the app after several skipped
days).

#### Backing table
File: `supabase/migrations/0006_recurring_transactions.sql` (lines 1–47)

```sql
-- Recurring transactions: scheduled expense/income entries
create table recurring_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  account_id uuid references accounts on delete restrict not null,
  category_id uuid references categories on delete set null,

  type text not null check (type in ('expense','income')),
  amount numeric(12,2) not null check (amount > 0),
  note text,

  -- Schedule
  frequency text not null check (frequency in ('daily','weekly','biweekly','monthly','yearly')),
  start_date date not null,
  end_date date, -- null = no end

  -- day of week (0-6, sunday=0) for weekly/biweekly
  -- day of month (1-28, or -1 for "last day") for monthly
  -- ignored for daily/yearly (yearly uses start_date's month/day)
  schedule_day int,

  auto_log boolean default true,
  last_generated_date date, -- prevents duplicate generation

  is_active boolean default true,
  is_paused boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_recurring_user_active on recurring_transactions(user_id)
  where is_active = true and is_paused = false;

alter table recurring_transactions enable row level security;
create policy "own recurring" on recurring_transactions for all using (auth.uid() = user_id);

create trigger recurring_updated_at
  before update on recurring_transactions
  for each row execute procedure update_updated_at();

-- Link auto-generated transactions back to their recurring rule
alter table transactions
  add column generated_from_recurring uuid references recurring_transactions on delete set null;

create index idx_transactions_recurring on transactions(generated_from_recurring)
  where generated_from_recurring is not null;
```

#### "Pending" derivation — there is no `is_pending` column
A recurring is "pending" iff:
- `is_active = true AND is_paused = false`
- `auto_log = false` (because `auto_log = true` rules are silently
  generated, not surfaced)
- A computed next-due-date (using `frequency` + `schedule_day` +
  `last_generated_date`) is `<= today`

The "I handled this" signal is **`last_generated_date >= dueDate`**.
Confirm and Skip both bump `last_generated_date` to the same value;
Confirm additionally inserts a transaction row.

### B.3 Trigger Logic
The dashboard runs `generateDueTransactions(supabase, userId)` exactly
**once per session** (gated by `useRef`). For `auto_log=true` rules, it
inserts transactions and bumps `last_generated_date`. For
`auto_log=false` rules, it returns the rules as `pending` (no DB write).

File: `src/hooks/use-dashboard-data.ts` (lines 16–32)

```ts
export function useDashboardData(cycleStartDateStr?: string) {
  const { user, profile, incomeSources, accounts } = useAuthStore();
  const { setDashboardStats, setCategories, mutationCount } = useTransactionStore();
  const [loading, setLoading] = useState(true);
  const [pendingRecurring, setPendingRecurring] = useState<{ recurring: RecurringTransaction; dueDates: string[] }[]>([]);
  const generatedRef = useRef(false);
  const supabase = createClient();

  // Run recurring generation once per session on first load
  useEffect(() => {
    if (!user || generatedRef.current) return;
    generatedRef.current = true;
    generateDueTransactions(supabase, user.id).then(({ pending }) => {
      setPendingRecurring(pending);
    });
  }, [user]);
  // ...
}
```

The fetch + due-date calculation — File: `src/lib/recurring.ts` (lines 108–153):

```ts
/**
 * Get all recurring transactions that have occurrences due today or earlier
 * that haven't been generated yet.
 */
export async function getDueRecurring(
  supabase: SupabaseClient,
  userId: string,
  today: Date = new Date()
): Promise<{ recurring: RecurringTransaction; dueDates: string[] }[]> {
  const { data } = await supabase
    .from('recurring_transactions')
    .select('*, account:accounts!account_id(id,name,type,color,icon), category:categories(*, bucket:budget_buckets(*))')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_paused', false);

  if (!data || data.length === 0) return [];

  const todayStart = startOfDay(today);
  const result: { recurring: RecurringTransaction; dueDates: string[] }[] = [];

  for (const rec of data as RecurringTransaction[]) {
    const fromDate = rec.last_generated_date
      ? addDays(parseDate(rec.last_generated_date), 1)
      : parseDate(rec.start_date);

    const dueDates: string[] = [];
    let cursor = fromDate;

    // Collect all missed occurrences up to today
    while (true) {
      const next = getNextDueDate(rec, cursor);
      if (!next || isAfter(next, todayStart)) break;
      dueDates.push(format(next, 'yyyy-MM-dd'));
      cursor = addDays(next, 1);
      // Safety: max 365 occurrences per sync
      if (dueDates.length >= 365) break;
    }

    if (dueDates.length > 0) {
      result.push({ recurring: rec, dueDates });
    }
  }

  return result;
}
```

The auto-log split — File: `src/lib/recurring.ts` (lines 161–198):

```ts
/**
 * Auto-generate transactions for all due recurring entries.
 * For auto_log=true: inserts transactions + updates last_generated_date.
 * For auto_log=false: returns as pending (no side effects).
 * Does NOT bump mutationCount to avoid feedback loops.
 */
export async function generateDueTransactions(
  supabase: SupabaseClient,
  userId: string,
  today: Date = new Date()
): Promise<{ pending: { recurring: RecurringTransaction; dueDates: string[] }[] }> {
  const due = await getDueRecurring(supabase, userId, today);
  const pending: { recurring: RecurringTransaction; dueDates: string[] }[] = [];

  for (const { recurring, dueDates } of due) {
    if (!recurring.auto_log) {
      pending.push({ recurring, dueDates });
      continue;
    }

    // Insert one transaction per missed occurrence
    for (const dueDate of dueDates) {
      await supabase.from('transactions').insert({
        user_id: userId,
        account_id: recurring.account_id,
        category_id: recurring.category_id,
        amount: recurring.amount,
        type: recurring.type,
        note: recurring.note,
        transaction_date: dueDate,
        generated_from_recurring: recurring.id,
      });
    }

    // Update last_generated_date to the last generated date
    const lastDate = dueDates[dueDates.length - 1];
    await supabase
      .from('recurring_transactions')
      .update({ last_generated_date: lastDate })
      .eq('id', recurring.id);
  }

  return { pending };
}
```

The frequency engine — File: `src/lib/recurring.ts` (lines 36–106) — is
the canonical "what's the next due date" function. Daily/weekly/
biweekly/monthly/yearly all supported, with `schedule_day` as the lever
(day-of-week for weekly/biweekly, day-of-month or -1 for monthly,
ignored for daily/yearly).

### B.4 Action Flow
Dashboard handlers — File: `src/app/(app)/dashboard/page.tsx` (lines 228–239):

```ts
async function handleConfirmPending(item: RecurringTransaction, dueDate: string) {
  if (!user) return;
  await confirmPendingRecurring(supabase, user.id, item, dueDate);
  setPendingRecurring(prev => prev.filter(p => p.recurring.id !== item.id));
  revalidateForEntity('transaction');
  toast.success('Transaction logged');
}

async function handleSkipPending(item: RecurringTransaction, dueDate: string) {
  await skipPendingRecurring(supabase, item.id, dueDate);
  setPendingRecurring(prev => prev.filter(p => p.recurring.id !== item.id));
}
```

The mutations — File: `src/lib/recurring.ts` (lines 200–239):

```ts
/**
 * Confirm a pending recurring occurrence (auto_log=false).
 * Inserts the transaction and updates last_generated_date.
 */
export async function confirmPendingRecurring(
  supabase: SupabaseClient,
  userId: string,
  recurring: RecurringTransaction,
  dueDate: string
): Promise<void> {
  await supabase.from('transactions').insert({
    user_id: userId,
    account_id: recurring.account_id,
    category_id: recurring.category_id,
    amount: recurring.amount,
    type: recurring.type,
    note: recurring.note,
    transaction_date: dueDate,
    generated_from_recurring: recurring.id,
  });
  await supabase
    .from('recurring_transactions')
    .update({ last_generated_date: dueDate })
    .eq('id', recurring.id);
}

/**
 * Skip a pending recurring occurrence without logging a transaction.
 * Updates last_generated_date so it won't prompt again for this period.
 */
export async function skipPendingRecurring(
  supabase: SupabaseClient,
  recurringId: string,
  dueDate: string
): Promise<void> {
  await supabase
    .from('recurring_transactions')
    .update({ last_generated_date: dueDate })
    .eq('id', recurringId);
}
```

#### Action semantics
| Button | Server effect | Client effect |
| --- | --- | --- |
| **"Log it"** (primary) | Insert `transactions` row with the recurring's `account_id`, `category_id`, `amount`, `type`, `note`, `transaction_date = dueDate`, `generated_from_recurring = recurring.id`. Update `recurring_transactions.last_generated_date = dueDate`. | Remove all `pendingRecurring` rows with this `recurring.id` from local state; toast "Transaction logged"; bump mutationCount via `revalidateForEntity('transaction')`. |
| **"Skip"** (secondary) | Update `recurring_transactions.last_generated_date = dueDate` (no transaction insert). | Remove all `pendingRecurring` rows with this `recurring.id` from local state; no toast. |

> ⚠️ **Subtle bug-or-feature:** the dashboard always passes
> `dueDates[dueDates.length - 1]` (the **most recent** missed due date)
> as the `dueDate` argument — see `page.tsx:444–448`:
>
> ```tsx
> dueDate={dueDates[dueDates.length - 1]}
> onConfirm={() => handleConfirmPending(recurring, dueDates[dueDates.length - 1])}
> onSkip={() => handleSkipPending(recurring, dueDates[dueDates.length - 1])}
> ```
>
> This means: if a user has 3 missed monthly occurrences, the card shows
> only the latest, "Log it" inserts only **one** transaction at the
> latest due date, and bumps `last_generated_date` to that latest date —
> effectively *silently skipping* the earlier two missed dates. iOS
> mirroring this behavior should be intentional about it.

> Note: confirm uses the recurring's saved fields verbatim — **no Add
> Transaction wizard.** If the user wants to edit the amount before
> logging, they have to go to `/recurring/[id]` (a separate detail
> route, not part of Home).

### B.5 Dismiss/Snooze Tracking
**No separate table.** State lives entirely in
`recurring_transactions.last_generated_date`. After Confirm or Skip,
that column moves forward, and the next call to
`getDueRecurring(...)` will find no due dates ≤ today for that rule
until the next period rolls around.

The card-level helper for "is this period handled" lives at
`src/lib/recurring.ts` (lines 287–296):

```ts
/** Has this recurring already been logged or skipped within the current period? */
export function isHandledThisInstance(
  recurring: RecurringTransaction,
  today: Date = new Date(),
): boolean {
  if (!recurring.last_generated_date) return false;
  const period = getCurrentInstancePeriod(recurring, today);
  const lastGen = parseDate(recurring.last_generated_date);
  return !isBefore(lastGen, period.start) && !isAfter(lastGen, period.end);
}
```

### B.6 Visual Structure
- Chrome: `bg-card`, `rounded-2xl`, border `#FBBF24/30` (amber @ 30%), `p-4`
- Layout: emoji 🔄 (text-2xl) | text block ("{name} due" semibold +
  "{amount} · {dueDate}" muted) + button row
- Buttons: primary "Log it" (amber fill, dark text, CheckCircle2 icon),
  secondary "Skip" (muted bg, no icon)
- **No corner X button** (unlike `IncomeNudgeCard`)
- Animations: identical framer-motion config to `IncomeNudgeCard`

---

## PART C — Shared Concerns

### C.1 Render Slot on Home

File: `src/app/(app)/dashboard/page.tsx` — visibility guard (lines 246–250):

```ts
// Income lives in income_sources (rendered via IncomeNudgeCard). Any
// type='income' rows still in recurring_transactions are legacy data —
// hide them from the dashboard so the same money event isn't prompted twice.
const pendingExpenseRecurring = pendingRecurring.filter(p => p.recurring.type !== 'income');
const hasNudges = nudges.length > 0 || pendingExpenseRecurring.length > 0;
```

Render block (lines 426–451):

```tsx
{/* Income nudge + pending recurring cards */}
{hasNudges && (
  <div className="space-y-2">
    <AnimatePresence mode="popLayout">
      {nudges.map(nudge => (
        <IncomeNudgeCard
          key={nudge.incomeSource.id}
          nudge={nudge}
          onLog={handleLogNudge}
          onSnooze={handleSnoozeNudge}
          onDismiss={handleDismissNudge}
        />
      ))}
      {pendingExpenseRecurring.map(({ recurring, dueDates }) => (
        <PendingRecurringCard
          key={recurring.id}
          name={recurring.note ?? recurring.category?.name ?? 'Recurring'}
          amount={recurring.amount}
          dueDate={dueDates[dueDates.length - 1]}
          onConfirm={() => handleConfirmPending(recurring, dueDates[dueDates.length - 1])}
          onSkip={() => handleSkipPending(recurring, dueDates[dueDates.length - 1])}
        />
      ))}
    </AnimatePresence>
  </div>
)}
```

**Order on the dashboard (top → bottom):**
1. Cycle navigation chevrons + label
2. Phase 5 banners (Sika Daily → Insight → Sika Monthly)
3. Cycle/virtual card + dashboard card-intro hint
4. Section divider
5. Spend summary cards (Today / This Month)
6. Should-I-buy button
7. Sunday recap card
8. Health row
9. Desktop-only income summary row
10. **Income nudges + Pending recurring (this section)** ← within `space-y-2`, nudges first then recurring
11. Bucket rings (desktop only)
12. Account strip (desktop only)
13. Goals widget
14. Buckets-intro `HintCard` + bucket strip
15. Weekly chart
16. Recent transactions (desktop only)

**Within the section:** all `IncomeNudgeCard`s render first (in
income-source array order), then all `PendingRecurringCard`s (in
recurring-fetch order). No "only one at a time" rule — every active
nudge stacks. There's also no priority/sort beyond fetch order.

The whole section is wrapped in `AnimatePresence mode="popLayout"`,
which makes individual card removals smooth even when adjacent siblings
exist.

> Income-typed `recurring_transactions` are **filtered out** by line 249
> — see the comment: legacy data, suppressed to avoid double-prompting.
> iOS should match this filter.

### C.2 Shared Chrome / Patterns

#### Shared base component? **No.**
Both cards live in the same file but each has its own JSX. They share
a visual idiom (rounded-2xl, bg-card, accent border @ 30%, p-4, emoji
+ text + button row, identical framer-motion entrance) but neither
imports a shared `BannerCard` / `NudgeCard` parent.

#### Shared with HintCard (Phase 4)? **No.**
- `HintCard` uses `dismissed_hints` table (per-user, per-string-hintId)
- `IncomeNudgeCard` uses `income_nudge_dismissals` (per-user, per-source, per-day)
- `PendingRecurringCard` uses `recurring_transactions.last_generated_date`

Each surface has its own dismiss schema. No shared dismiss API.

#### Shared utilities
- **`useCurrency()`** (from `@/hooks/use-currency`) — both cards use
  `format` for the amount display.
- **`framer-motion`** identical entrance/exit/transition props on both.
- **`AnimatePresence mode="popLayout"`** at the dashboard level
  (parent), not in the card components themselves.

#### Same file, different exports
Both cards are exported from
`src/components/dashboard/income-nudge-card.tsx` (the file is named
after the income card, but it's a 2-component module). This may
surprise iOS engineers expecting separate files — there's no
`pending-recurring-card.tsx`.

### C.3 Potential iOS Confusion Points

1. **`IncomeNudge` is not a table.** It's a synthesized in-memory shape
   `{ incomeSource: IncomeSource; dueDate: string }`. iOS should not
   look for `income_nudges` in Supabase — it doesn't exist. The nudge
   *dismissal* table is `income_nudge_dismissals`, named accordingly.

2. **Income nudges fire only on the exact `expected_day`.** If the
   user opens the app on the day after their pay-day, no nudge appears.
   There is no "missed income" concept on web. iOS Phase 7 should
   match: only show today.

3. **Biweekly is approximate.** `getIncomeDueDate` treats biweekly
   identically to weekly (any week with the matching day-of-week).
   Users with bi-weekly schedules may see nudges every week. iOS
   should match the comment in `income-nudges.ts:24` exactly.

4. **`auto_log=true` recurrings never surface as `PendingRecurringCard`.**
   They are silently inserted by `generateDueTransactions` on
   first-render-per-session. Only `auto_log=false` rules become
   pending cards.

5. **Generation runs once per session.** The dashboard guards
   `generatedRef.current` so even returning from another tab won't
   re-run. iOS engineers might expect "every app open" — match if
   feasible, but the web semantics is per-session.

6. **The card shows the *latest* missed date only.** If a recurring
   rule has 3 missed occurrences, the card teases only the most recent
   one. Confirming inserts only that single transaction; skipping
   silently abandons the older two. (See B.4 quirk note.)

7. **Income type recurrings are hidden.** Line 249 of `dashboard/page.tsx`
   filters them out. This is legacy-data cleanup, not a feature flag —
   iOS should mirror the filter.

8. **Confirm does NOT open the wizard.** It inserts a transaction
   directly with the rule's saved fields (recurring) or the source's
   saved amount and the user's default account (income). To edit the
   amount, the user must tap into `/recurring/[id]` (or for income,
   add a manual transaction).

9. **Income "log it" requires a default account.** If the user has no
   accounts (or no `is_default` and no first account), the toast is
   "No account found" and nothing happens. iOS needs the same
   precondition.

10. **No timezone handling.** All "today" comparisons use `new Date()`
    on the client and `format(today, 'yyyy-MM-dd')` (local timezone).
    A user crossing midnight in a far timezone may see a different day
    than the server cron expects. iOS should also use device-local
    time for parity.

11. **Past-cycle navigation does NOT hide nudges.** The nudge section
    is rendered outside the `cycle.isCurrent` check. Browsing last
    month's cycle still shows today's nudges. (May or may not be
    intentional; matches web for now.)

12. **`dismissed_at` semantics on income nudges have three "actions".**
    All three (`logged`, `snoozed`, `dismissed`) suppress the card
    until tomorrow. The `action` is metadata. Don't treat `snoozed` as
    "show again later today" — it isn't.

13. **`income_nudge_dismissals` rows accumulate forever.** No
    cleanup migration. iOS reads with the today filter, so this is fine
    for queries, but be aware nothing prunes old rows.

14. **Empty incomeSources short-circuits.** The `useEffect` won't even
    call `getDueIncomeNudges` if `incomeSources.length === 0`
    (`page.tsx:172`). iOS should match — no point in querying with an
    empty source list.

---

## iOS Implementation Notes (Phase 7)

### Models

```swift
// Mirror src/types/index.ts — IncomeSource already exists in iOS
enum IncomeFrequency: String, Codable {
  case monthly, weekly, biweekly, irregular
}

struct IncomeSource: Codable, Identifiable {
  let id: UUID
  let userID: UUID
  let name: String
  let amount: Decimal
  let frequency: IncomeFrequency
  let expectedDay: Int?    // 1–31 for monthly, 0–6 for weekly/biweekly, nil for irregular
  let isActive: Bool
  let notes: String?
  let createdAt: Date
  let updatedAt: Date
}

// In-memory only (no table). Built per-render from IncomeSource + today.
struct IncomeNudge: Identifiable {
  let incomeSource: IncomeSource
  let dueDate: String       // YYYY-MM-DD, local time
  var id: UUID { incomeSource.id }
}

// Mirror src/types/index.ts — RecurringTransaction
enum RecurringFrequency: String, Codable {
  case daily, weekly, biweekly, monthly, yearly
}

struct RecurringTransaction: Codable, Identifiable {
  let id: UUID
  let userID: UUID
  let accountID: UUID
  let categoryID: UUID?
  let type: TransactionType    // .expense | .income — but income is filtered out on Home
  let amount: Decimal
  let note: String?
  let frequency: RecurringFrequency
  let startDate: String        // YYYY-MM-DD
  let endDate: String?
  let scheduleDay: Int?        // 0–6 weekly/biweekly, 1–28 or -1 monthly, ignored daily/yearly
  let autoLog: Bool
  let lastGeneratedDate: String?
  let isActive: Bool
  let isPaused: Bool
  let createdAt: Date
  let updatedAt: Date
}

// In-memory wrapper produced by the calculator.
struct PendingRecurring: Identifiable {
  let recurring: RecurringTransaction
  let dueDates: [String]       // YYYY-MM-DD, oldest first; show only `last`
  var id: UUID { recurring.id }
}
```

### Services

#### `IncomeNudgeService`
Mirror `src/lib/income-nudges.ts` (lines 9–32 derivation, 37–68 fetch,
74–85 record). Suggested signatures:

```swift
@MainActor
final class IncomeNudgeService {
  let supabase: SupabaseClient

  /// Pure function — mirror getIncomeDueDate in income-nudges.ts:9.
  /// Returns the due-date string if today matches the source schedule, else nil.
  static func dueDateIfToday(source: IncomeSource, today: Date = .init()) -> String?

  /// Mirror getDueIncomeNudges. Reads income_nudge_dismissals to suppress
  /// already-handled nudges.
  func dueNudges(userID: UUID,
                 sources: [IncomeSource],
                 today: Date = .init()) async throws -> [IncomeNudge]

  /// Mirror recordNudgeDismissal. Upserts on (user_id, source_id, due_date).
  enum DismissalAction: String { case logged, snoozed, dismissed }
  func recordDismissal(userID: UUID,
                       sourceID: UUID,
                       dueDate: String,
                       action: DismissalAction) async throws
}
```

#### `PendingRecurringService` (or `RecurringEngine`)
Mirror `src/lib/recurring.ts`. The frequency engine is non-trivial —
port `getNextDueDate` (lines 36–106) and `getDueRecurring` (108–153)
faithfully. Key signatures:

```swift
@MainActor
final class PendingRecurringService {
  let supabase: SupabaseClient

  /// Pure function — mirror getNextDueDate in recurring.ts:36.
  /// Computes next occurrence on/after `from`, respecting end_date.
  static func nextDueDate(for rec: RecurringTransaction,
                          from: Date = .init()) -> Date?

  /// Mirror getDueRecurring. Returns at most 365 missed dates per rule (safety cap).
  func dueRecurring(userID: UUID,
                    today: Date = .init()) async throws -> [PendingRecurring]

  /// Mirror generateDueTransactions. For autoLog rules, inserts transactions
  /// and bumps last_generated_date. Returns only auto_log=false rules as pending.
  func generateAndCollectPending(userID: UUID,
                                 today: Date = .init()) async throws -> [PendingRecurring]

  /// Mirror confirmPendingRecurring (recurring.ts:204).
  /// Inserts a transaction + bumps last_generated_date.
  func confirmPending(userID: UUID,
                      recurring: RecurringTransaction,
                      dueDate: String) async throws

  /// Mirror skipPendingRecurring (recurring.ts:230).
  /// Bumps last_generated_date only (no transaction).
  func skipPending(recurringID: UUID, dueDate: String) async throws
}
```

#### Logging an income nudge (no separate service needed)
The "log it" path in `IncomeNudgeCard` is a direct
`transactions.insert` from `dashboard/page.tsx` lines 199–209. iOS can
either fold this into `IncomeNudgeService.logNudge(...)` or expose it
on the existing `TransactionService`. Insert payload:

```swift
struct PendingIncomeInsert {
  let userID: UUID
  let accountID: UUID         // user's default account (account.is_default == true) or accounts[0]
  let categoryID: UUID? = nil // explicitly null for income
  let amount: Decimal         // source.amount
  let type: TransactionType = .income
  let note: String            // source.name
  let transactionDate: String // today, YYYY-MM-DD
}
```

After insert, call `recordDismissal(action: .logged)`.

### AppState integration

```swift
@MainActor
final class HomeNudgeState: ObservableObject {
  @Published var incomeNudges: [IncomeNudge] = []
  @Published var pendingRecurring: [PendingRecurring] = []
  private var hasGeneratedThisSession = false   // mirror useDashboardData's generatedRef

  /// On app open / dashboard mount.
  func loadAll(userID: UUID, sources: [IncomeSource]) async {
    async let nudges = sources.isEmpty
      ? .empty
      : incomeNudgeService.dueNudges(userID: userID, sources: sources)

    if !hasGeneratedThisSession {
      hasGeneratedThisSession = true
      pendingRecurring = (try? await pendingRecurringService.generateAndCollectPending(userID: userID)) ?? []
    }
    incomeNudges = (try? await nudges) ?? []
  }

  /// Filter income-typed recurrings out (line 249 dashboard/page.tsx).
  var visiblePendingRecurring: [PendingRecurring] {
    pendingRecurring.filter { $0.recurring.type != .income }
  }

  // Income nudge actions
  func logIncome(_ nudge: IncomeNudge) async { /* insert tx + record .logged + remove locally */ }
  func snoozeIncome(_ nudge: IncomeNudge) async { /* record .snoozed + remove locally */ }
  func dismissIncome(_ nudge: IncomeNudge) async { /* record .dismissed + remove locally */ }

  // Pending recurring actions
  func confirmPending(_ pending: PendingRecurring) async { /* uses dueDates.last */ }
  func skipPending(_ pending: PendingRecurring) async { /* uses dueDates.last */ }
}
```

**When to recompute:**
- On app launch / Home appear → `loadAll`
- On `incomeSources` mutation (add/edit/delete) → recompute nudges only
- Recurring generation runs **once per session** (mirror web's `useRef`)
- Do **not** recompute on every transaction add — web only refetches
  the dashboard stats, not the nudge list

### Components

```swift
struct IncomeNudgeCardView: View {
  let nudge: IncomeNudge
  let onLog: (IncomeNudge) -> Void
  let onSnooze: (IncomeNudge) -> Void
  let onDismiss: (IncomeNudge) -> Void

  // chrome: bg-card, rounded-2xl, border #D4A017 @ 30%, p-4
  // emoji 💰 + "{name} expected today" + "Did you receive {amount}?"
  // primary "Yes, log it" (gold), secondary "Not yet" (muted), corner X
  // Entrance: opacity 0→1, y -8→0, 0.2s ease-out
}

struct PendingRecurringCardView: View {
  let pending: PendingRecurring
  let onConfirm: (PendingRecurring) -> Void   // resolves with dueDates.last
  let onSkip: (PendingRecurring) -> Void

  // chrome: bg-card, rounded-2xl, border #FBBF24 @ 30%, p-4
  // emoji 🔄 + "{name} due" + "{amount} · {dueDate}"
  // name = recurring.note ?? recurring.category?.name ?? "Recurring"
  // primary "Log it" (amber), secondary "Skip" (muted), NO X
  // Same entrance animation
}
```

> If iOS wants to factor a shared chrome view (`NudgeCardChrome`),
> that's *additional* over what web has — fine to do, but not required.
> Web doesn't share.

### Slot on `AuthenticatedHomeView`

Insert a single `VStack(spacing: 8)` block after the should-I-buy /
sunday-recap / health-row sections and before the bucket rings:

```swift
if !state.incomeNudges.isEmpty || !state.visiblePendingRecurring.isEmpty {
  VStack(spacing: 8) {
    ForEach(state.incomeNudges) { nudge in
      IncomeNudgeCardView(
        nudge: nudge,
        onLog: { Task { await state.logIncome($0) } },
        onSnooze: { Task { await state.snoozeIncome($0) } },
        onDismiss: { Task { await state.dismissIncome($0) } }
      )
      .transition(.opacity.combined(with: .offset(y: -8)))
    }
    ForEach(state.visiblePendingRecurring) { pending in
      PendingRecurringCardView(
        pending: pending,
        onConfirm: { Task { await state.confirmPending($0) } },
        onSkip: { Task { await state.skipPending($0) } }
      )
      .transition(.opacity.combined(with: .offset(y: -8)))
    }
  }
  .animation(.easeOut(duration: 0.2), value: state.incomeNudges.map(\.id))
  .animation(.easeOut(duration: 0.2), value: state.visiblePendingRecurring.map(\.id))
}
```

Order: income nudges first, recurring pending second — match web.

### Dependencies on existing iOS work
- **Phase 4 `HintCard` chrome:** distinct from these cards. Don't reuse
  the `HintCard` view; copy the visual chrome conventions but keep
  separate components. Dismiss tracking is *not* shared.
- **Existing `Transaction.swift`, `IncomeSource.swift` models:** check
  field parity with the TypeScript types above. Likely already aligned
  but confirm `expected_day: Int?`, `amount: Decimal`, and the
  `account_id NOT NULL` constraint on recurring (it's `not null` in
  the migration).
- **Add Transaction wizard:** **not used** by either nudge action.
  Confirm/Log paths insert directly. If iOS Phase 7 wants to give the
  user an "Edit before logging" affordance, that's a *new* feature
  beyond what web does.

### Schema considerations

| Table | Read | Write | Notes |
| --- | --- | --- | --- |
| `income_sources` | yes | no (already managed elsewhere) | `is_active = true` filter |
| `income_nudge_dismissals` | yes | yes (upsert) | Composite key (user_id, income_source_id, due_date) |
| `recurring_transactions` | yes | yes (UPDATE `last_generated_date`) | Filter `is_active = true AND is_paused = false`. Only `auto_log = false` shows as pending. |
| `transactions` | (already used) | yes (INSERT for log/confirm) | Recurring confirms set `generated_from_recurring` |

**No new migrations needed for iOS Phase 7** — all four tables exist
as of migration 0006. RLS is straightforward: every table has an "own
{rows}" policy on `auth.uid() = user_id`. iOS using authed Supabase
client gets correct scoping for free.

**RLS surprises:** none. `transactions` insert just needs `user_id =
auth.uid()`. `recurring_transactions` UPDATE works directly. The
`income_nudge_dismissals` upsert pattern (`onConflict: 'user_id,income_source_id,due_date'`)
is supported via Supabase Swift SDK's `.upsert(...)` with
`onConflict: "user_id,income_source_id,due_date"`.

### Source-of-truth files for iOS Phase 7 prompt

If Phase 7 prompt embeds verbatim source, the load-bearing files are:

1. `src/components/dashboard/income-nudge-card.tsx` — both card components (110 lines)
2. `src/lib/income-nudges.ts` — derivation + dismissal helper (86 lines)
3. `src/lib/recurring.ts` — frequency engine + confirm/skip mutations (322 lines; the load-bearing parts are lines 36–239)
4. `src/types/index.ts` lines 12–23, 85–110 — TypeScript shapes
5. `supabase/migrations/0002_income_sources.sql` — income source table
6. `supabase/migrations/0006_recurring_transactions.sql` — recurring + dismissals tables
7. `src/app/(app)/dashboard/page.tsx` lines 171–251, 426–451 — render slot, handlers, filters
8. `src/hooks/use-dashboard-data.ts` lines 16–32 — once-per-session generation
