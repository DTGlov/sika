# Home Web Audit

## 1. HOME PAGE

**File:** `src/app/(app)/dashboard/page.tsx` (576 lines)

`/dashboard` is the authenticated Home route. Root `app/page.tsx` redirects to `/dashboard` if signed in, else `/login`. Full source was printed verbatim in PHASE1B_AUDIT.md (Section 1) and ADD_TRANSACTION_FETCH.md context — I won't repeat it. Top-to-bottom render order:

1. **TopBar** — greeting + month/year + Settings gear
2. **Cycle navigation** — left-arrow / `cycle.label` / right-arrow (right disabled when current). URL `?cycle=YYYY-MM-DD`.
3. **SikaDailyBanner** (skeleton → banner → null) — when there's an unread digest for today
4. **InsightStrip** — when there's an undismissed daily insight
5. **SikaMonthlyBanner** — when there's an unread, undismissed monthly recap (last 30 days)
6. **CycleCard** — virtual-credit-card-shaped balance display with HintCard("dashboard_card_intro") below
7. Section divider
8. **SpendCard × 2** in a 2-col grid: "Today" + "This Month" (with prev-month delta)
9. **ShouldIBuyButton** — large card-button that opens DecisionSheet
10. **SundayRecapCard** — only on Sundays, only if not yet dismissed-this-week
11. **HealthRow** — Sika score + streak + tier + badges line
12. **Income summary** *(desktop only)* — `monthlyIncome` total + expandable per-source breakdown
13. **IncomeNudgeCard** ×N + **PendingRecurringCard** ×N — when due
14. **Buckets — desktop only:** label + BucketsTooltip + 3 BucketRings in a grid
15. **Account strip — desktop only:** horizontal scroll of account chips with balances
16. **GoalsWidget** — top-3 goals (hidden when none)
17. HintCard("dashboard_buckets_intro") + **BucketStrip** (mobile-visible drilldown to /buckets)
18. **WeeklyChart** — recharts BarChart over 7-day spend
19. **RecentTransactions** *(desktop only)* — top-5
20. **OnboardingModal** (mounted; opens automatically when income==0 && incomeSources empty)

The file is wrapped in `<Suspense>` because it consumes `useSearchParams()` for the cycle param. `useDashboardData(cycle.startDateStr)` fires the parallel data fetch. `useProfile()` hydrates auth-store from `profiles/income_sources/accounts/dismissed_hints/streaks/momentum/user_badges`. Several extra fetches fire from the page itself (digest, monthly recap, AI insight, badge unlock check, income nudges, goal progress).

## 2. SUB-COMPONENTS

I'll sequence in the order they render on Home and reference earlier full-source prints rather than duplicate. **All source has been printed verbatim in prior conversation turns** unless flagged "(printed below)".

| # | Component | File | Data consumed | Notes |
|---|---|---|---|---|
| 1 | `TopBar` | `src/components/layout/top-bar.tsx` | `useAuthStore.profile` | (Already printed) Greeting, "MMMM yyyy", gear → /settings |
| 2 | `CycleCard` (+ `CardSurface`) | `src/components/dashboard/cycle-card.tsx` (209 lines) | props from page; `useCurrency` for formatting; `searchParams` for tap-target. | (Already printed) Renders heritage-themed card; tap → /dashboard/cycle-detail |
| 3 | `BucketRing` | `src/components/dashboard/bucket-ring.tsx` (102 lines) | props: `bucket`, `spent`, `limit`, `index`, optional `earmarked` | (Already printed) Circular SVG ring with progress color from `getProgressColor()` |
| 4 | `SpendCard` | `src/components/dashboard/spend-card.tsx` (41 lines) | props: title, amount, optional `compareAmount`/`compareLabel` | (Already printed) Title + currency symbol + big amount + optional delta arrow |
| 5 | `RecentTransactions` | `src/components/dashboard/recent-transactions.tsx` (83 lines) | props: `transactions: Transaction[]` | (Already printed) Top-5 + emoji icons + bucket-tinted bg + +/- amount color |
| 6 | `OnboardingModal` | `src/components/dashboard/onboarding-modal.tsx` (672 lines) | `useAuthStore.user`, `setProfile`, `setIncomeSources`, `analytics` | (Already printed in earlier auth fetch) Six-step modal: intro→currency→primary income→extras→review→PWA install. Writes to `income_sources`+`profiles`. |
| 7 | `IncomeNudgeCard`, `PendingRecurringCard` | `src/components/dashboard/income-nudge-card.tsx` (110 lines) | props: nudge, callbacks | (Already printed) See Section 3 below |
| 8 | `BucketStrip` | `src/components/dashboard/bucket-strip.tsx` (59 lines) | `useTransactionStore.dashboardStats.bucketSpend`, `bucketLimits`; constants from `BUCKET_CONFIG` | (Already printed) 3 horizontal progress bars; whole tile is `<Link href="/buckets">` |
| 9 | `WeeklyChart` | `src/components/dashboard/weekly-chart.tsx` (56 lines) | props: `data: { date, amount }[]` | recharts `BarChart`, `barSize=24`, `fill="#00D9A3"`. Tooltip shows `format(value)` in gold. **Printed below.** |
| 10 | `GoalsWidget` | `src/components/dashboard/goals-widget.tsx` (69 lines) | props: `goals: GoalProgress[]` | (Printed below) Top-3 goal cards with motion progress bars. Returns `null` if 0 goals. |
| 11 | `HealthRow` | `src/components/dashboard/health-row.tsx` (92 lines) | `useAuthStore.{streaks,momentum,userBadges,healthScore,setHealthScore}`; `useTransactionStore.mutationCount`; computes via `lib/health-score.ts` + `lib/momentum.ts` + `lib/streaks.hasLoggedToday()` | (Printed below) Sika score + streak flame + tier icon + N/8 badges. Tap → /health |
| 12 | `SikaDailyBanner` | `src/components/dashboard/sika-daily-banner.tsx` (33 lines) | props: `digest: DailyDigest` | (Already printed) "Today's Sika Daily" → /daily |
| 13 | `SikaMonthlyBanner` | `src/components/dashboard/sika-monthly-banner.tsx` (56 lines) | props: `recapId: string`; calls `/api/monthly/dismiss` | (Printed below) "Your month in money is ready" → /monthly. Has visible X dismiss. |
| 14 | `InsightStrip` | `src/components/dashboard/insight-strip.tsx` (68 lines) | props: `row: DailyInsightRow`, `onDismiss`; calls `/api/insights/dismiss` | (Printed below) Color-accented strip with Lucide icon by name from `insight_data.icon`. |
| 15 | `SundayRecapCard` | `src/components/dashboard/sunday-recap-card.tsx` (131 lines) | `useAuthStore.{user,dismissedHints,addDismissedHint}`; queries transactions for current ISO week | (Printed below) Only renders if `getDay() === 0` AND not yet dismissed. Dismissal uses **`dismissed_hints`** table with a per-week hint id `sunday_recap_{year}_W{ww}`. |
| 16 | `ShouldIBuyButton` | `src/components/decision/should-i-buy-button.tsx` (27 lines) | local state to open DecisionSheet | (Printed above in this turn) Opens decision flow. |
| 17 | `HintCard` + `BucketsTooltip` | `src/components/hint-card.tsx` (143 lines) | `useAuthStore.{user,dismissedHints,hintsLoaded,addDismissedHint}`; `dismissHint(supabase, ...)` | (Printed above) Generic dismissible hint tile. Backed by `dismissed_hints` table. |

### Full source for Phase-1B-deferred Home components

#### `WeeklyChart` — `src/components/dashboard/weekly-chart.tsx`
```tsx
'use client';

import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatShortDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';

interface WeeklyChartProps {
  data: { date: string; amount: number }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  const { format } = useCurrency();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2">
      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
      <p className="amount text-[#D4A017] text-sm font-semibold">{format(payload[0].value)}</p>
    </div>
  );
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatShortDate(d.date) }));
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45, ease: 'easeOut' }}
      className="bg-card border border-border rounded-2xl p-5"
    >
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-4">7-Day Spend</p>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barSize={24} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)' }} />
            <Bar dataKey="amount" fill="#00D9A3" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
```

#### `GoalsWidget`, `HealthRow`, `SikaMonthlyBanner`, `InsightStrip`, `SundayRecapCard`, `HintCard`, `BucketsTooltip`
Already printed verbatim above in this turn (full bodies). Refer to those blocks; not duplicating to keep this manageable.

## 3. DISMISSIBLE CARD CATALOG

| Card type | Component | File | Trigger | Action(s) | Dismissal | Backing table |
|---|---|---|---|---|---|---|
| **Onboarding hint** (10+ stable IDs) | `HintCard` | `components/hint-card.tsx` | When component is rendered AND `hint_id ∉ dismissedHints` | X dismiss + optional CTA button (also dismisses) | **Per-user, forever** — upserts row into `dismissed_hints(user_id, hint_id)` | `dismissed_hints` |
| **Daily AI Insight strip** | `InsightStrip` | `components/dashboard/insight-strip.tsx` | When `/api/insights/today` returns a non-null insight with `dismissed_at IS NULL` | X dismiss only | **Per-user per-day** — POST `/api/insights/dismiss` sets `daily_insights.dismissed_at` for today's row | `daily_insights` |
| **Sika Daily news banner** | `SikaDailyBanner` | `components/dashboard/sika-daily-banner.tsx` | When `sika_daily_digests` has today's row AND `user_daily_reads` has no row for `(user, today)` | Tap → /daily (dismissal happens implicitly when user lands on /daily and that route inserts a `user_daily_reads` row) | **Per-user per-day** — `user_daily_reads(user_id, digest_date)` insert | `sika_daily_digests` (shared) + `user_daily_reads` |
| **Sika Monthly recap banner** | `SikaMonthlyBanner` | `components/dashboard/sika-monthly-banner.tsx` | Latest `monthly_recaps` row in last 30 days where `viewed_at IS NULL AND dismissed_at IS NULL` | Tap → /monthly (sets `viewed_at`) **OR** X (POST `/api/monthly/dismiss` sets `dismissed_at`) | **Per-user per-recap** | `monthly_recaps` |
| **Income nudge** ("Salary expected today") | `IncomeNudgeCard` | `components/dashboard/income-nudge-card.tsx` | `getDueIncomeNudges()` returns rows where source's frequency/expected_day matches today and there's no dismissal row in `income_nudge_dismissals` for `(user, source, due_date)` | "Yes log it" (auto-inserts transaction; action='logged'), "Not yet" (action='snoozed'), X (action='dismissed') | **Per-user per-source per-due-date** — upserts `income_nudge_dismissals` row | `income_nudge_dismissals` (`logged`/`snoozed`/`dismissed` actions) |
| **Pending recurring** ("Netflix due") | `PendingRecurringCard` | `components/dashboard/income-nudge-card.tsx` (same file) | `generateDueTransactions()` returns auto-log=false rules with un-handled due dates this period | "Log it" (calls `confirmPendingRecurring()` → inserts a `transactions` row with `generated_from_recurring`); "Skip" (sets `last_generated_date` past this period) | **Per-recurring per-period** — handled via `recurring_transactions.last_generated_date` advance, not a separate dismissal table | `recurring_transactions` (writes) |
| **Sunday recap card** | `SundayRecapCard` | `components/dashboard/sunday-recap-card.tsx` | Only renders if `new Date().getDay() === 0` AND `dismissed_hints` row absent for hint id `sunday_recap_${ISOyear}_W${ISOweek}` | X dismiss only | **Per-user per-ISO-week** — upserts `dismissed_hints(user_id, hint_id)` with that derived id (per-week makes it self-resetting) | `dismissed_hints` |

There is **no central registry** ("home_cards" / "feed_items"). Each card type lives in its own component, fetches its own data, and writes to its own table. Nothing dispatches a `<HomeCard kind=...>` switch.

## 4. DATABASE TABLES BACKING HOME

### `dismissed_hints` — `supabase/migrations/0008_dismissed_hints.sql`

Purpose: track per-user dismissal of static onboarding hints AND ephemeral cards (Sunday recap uses ISO-week-based hint ids).

```sql
create table dismissed_hints (
  user_id uuid references auth.users on delete cascade not null,
  hint_id text not null,
  dismissed_at timestamptz default now(),
  primary key (user_id, hint_id)
);

alter table dismissed_hints enable row level security;
create policy "own dismissed hints" on dismissed_hints for all
  using (auth.uid() = user_id);
```

TypeScript: ad-hoc inline (`{ hint_id: string }`); the `HintId` literal union lives in `src/lib/hints.ts` (printed above). No `lib/database.types.ts` exists — types are hand-rolled in `src/types/`.

### `daily_insights` — `supabase/migrations/0023_daily_insights.sql`

Purpose: AI-generated per-user one-line insight, one per user per day.

```sql
CREATE TABLE daily_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_date date NOT NULL,
  insight_data jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  UNIQUE(user_id, insight_date)
);

CREATE INDEX idx_daily_insights_user_date ON daily_insights(user_id, insight_date DESC);
ALTER TABLE daily_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own insights"   ON daily_insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own insights" ON daily_insights FOR UPDATE USING (auth.uid() = user_id);
```

TypeScript: `src/types/insight.ts` defines `DailyInsightRow` with `insight_data: { headline, body, accent: 'green'|'amber'|'red'|'blue'|'neutral', icon?: string, stat?: { label, value } }`.

### `sika_daily_digests` + `user_daily_reads` + `sika_daily_sources` — `0018_sika_daily.sql` (full body printed above)

Purpose: shared news-digest table, per-user read tracking, RSS source registry.

`sika_daily_digests` is **shared across all users** (one row per `digest_date`, no `user_id`). RLS is NOT enabled on `sika_daily_digests` or `sika_daily_sources` per the migration; only `user_daily_reads` has RLS.

`stories jsonb` shape: array of story objects (specific schema is in `src/types/daily.ts` — UNKNOWN exact fields without reading that file; based on usage `headline` is one).

There is also a Postgres function `cleanup_old_digests()` defined in this migration — keeps only the latest 2 days of digests. Called from `src/lib/daily/generate-digest.ts` line 108 after each generation: `await supabase.rpc('cleanup_old_digests')`.

### `monthly_recaps` — `0021_weekly_recaps.sql` + `0022_rename_weekly_to_monthly.sql` + `0025_monthly_banner_dismiss.sql`

After all three migrations applied:

```sql
CREATE TABLE monthly_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  month_end date NOT NULL,
  recap_data jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  shared_at timestamptz,
  dismissed_at timestamptz,
  UNIQUE(user_id, month_start)
);

CREATE INDEX idx_monthly_recaps_user_month ON monthly_recaps(user_id, month_start DESC);
ALTER TABLE monthly_recaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own monthly recaps"   ON monthly_recaps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own monthly recaps" ON monthly_recaps FOR UPDATE USING (auth.uid() = user_id);
```

`recap_data jsonb` shape: an array of "card" objects produced by `generateRecapCards(ctx)` in `src/lib/monthly/generate-recap.ts` (UNKNOWN exact schema without reading that file).

### `income_nudge_dismissals` — `0006_recurring_transactions.sql` (final block)

```sql
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

`action` distinguishes the three buttons. Snoozed rows are filtered as dismissed today and re-evaluated tomorrow (no explicit "snoozed-until" — same row blocks today's render, next day's `due_date` won't match).

### `purchase_decisions` — `0024_purchase_decisions.sql` (full body printed above)

Backs Should-I-Buy. `bucket text CHECK (bucket IN ('needs','wants','future'))` — note the legacy `'future'` value. The decision body still uses `'savings'` in the iOS-facing API enum (see `app/api/decisions/ask/route.ts` Zod schema), so there's a **mapping discrepancy**: the API accepts `'savings'` but the DB CHECK requires `'future'`. Either the DB has been altered out-of-band or inserts of `bucket='savings'` are rejected. Flag for iOS: **verify production DB column constraint before mirroring.**

## 5. CRON JOBS

`vercel.json` is literally `{}` — **no Vercel cron schedules are declared.** All four cron routes are protected with `Bearer ${CRON_SECRET}` and must be triggered externally (cron-job.org, GitHub Actions, Supabase Edge function pg_cron, etc.). The schedule is therefore "whatever your external trigger says". **CRON_SECRET is documented in `env.example`** (commit ebfc04f).

### `api/cron/generate-digest` — `src/app/api/cron/generate-digest/route.ts`

Schedule (intended): daily at ~6am UTC (per the file comment, but not actually wired via vercel.json).
Purpose: generate today's shared `sika_daily_digests` row by pulling RSS, then call `cleanup_old_digests` RPC.
Reads: `sika_daily_sources` (RSS URLs), prior digests for diff.
Writes: `sika_daily_digests`.
Card types created: **Sika Daily news banner** (rendered from this row).

```ts
// Called daily by Vercel Cron at 6am UTC
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { generateDigest } = await import('@/lib/daily/generate-digest');
  const result = await generateDigest();
  return Response.json(result);
}
```

### `api/cron/insights-generate` — `src/app/api/cron/insights-generate/route.ts`

Purpose: for every profile, generate today's AI insight (skip if already exists), insert into `daily_insights`, also send a push notification.
Reads: `profiles`, then per-user calls `computeInsightContext(supabase, userId, now)` (transactions, accounts, momentum, streaks, …).
Writes: `daily_insights` (one row per user per day).
Card types created: **Daily AI Insight strip**.

(Full handler printed in section above — 67 lines.)

### `api/cron/monthly-generate` — `src/app/api/cron/monthly-generate/route.ts`

Purpose: for every profile whose cycle ends today, generate a monthly recap.
Filter: `profile.cycle_start_day && isCycleEndDate(today, cycle_start_day)`.
Reads: `profiles`, then per-user `computeMonthContext(supabase, userId, monthStart, monthEnd)` (transactions, goals, accounts, streaks).
Writes: `monthly_recaps`.
Card types created: **Sika Monthly recap banner**.
Skip: if `monthly_recaps` already has a row for the same `(user, month_start)` OR `ctx.month.transaction_count === 0`.

(Full handler printed above — 81 lines.)

### `api/cron/income-reminders` — `src/app/api/cron/income-reminders/route.ts`

Purpose: for every active income source, check if it's "due today" and send a push.
Reads: `income_sources` where `is_active = true`, then per-user `getDueIncomeNudges()` (which itself reads `income_nudge_dismissals` for today).
Writes: nothing — only sends push.
Card types created: **none directly.** Push notification only. The income nudge card on Home is purely client-side (`getDueIncomeNudges` is called from the Home page itself — `dashboard/page.tsx:173`). The cron exists to surface the same nudge as a push for users who haven't opened the app.

(Full handler printed above — 68 lines.)

### Cron → card-type map

| Cron | Schedule (intended) | Writes to | Surfaces on Home as |
|---|---|---|---|
| `generate-digest` | daily ~6am UTC | `sika_daily_digests` | SikaDailyBanner |
| `insights-generate` | daily | `daily_insights` | InsightStrip |
| `monthly-generate` | daily (filters by cycle end) | `monthly_recaps` | SikaMonthlyBanner |
| `income-reminders` | daily | (push only) | (re-rendered client-side as IncomeNudgeCard from same logic) |

## 6. DISMISSAL FLOW

Five different patterns, summarized:

| Card | Endpoint | DB write | Client trigger |
|---|---|---|---|
| HintCard / SundayRecapCard | direct Supabase upsert | `dismissed_hints(user_id, hint_id)` upsert | `dismissHint()` in `src/lib/hints.ts` (also optimistic via `addDismissedHint(hintId)` to auth-store) |
| InsightStrip | `POST /api/insights/dismiss` | `daily_insights.dismissed_at = now()` for today | `fetch('/api/insights/dismiss', { method: 'POST' })` inside `InsightStrip.handleDismiss` |
| SikaMonthlyBanner | `POST /api/monthly/dismiss` body `{ recap_id }` | `monthly_recaps.dismissed_at = now()` for that id | `fetch('/api/monthly/dismiss', body: { recap_id })` in `handleDismiss` |
| SikaDailyBanner | (implicit) `/daily` route insert | `user_daily_reads` row insert when user lands on /daily | tap-to-navigate; no explicit dismiss button |
| IncomeNudgeCard | direct Supabase upsert | `income_nudge_dismissals` upsert with action `'logged'/'snoozed'/'dismissed'` | `recordNudgeDismissal()` in `src/lib/income-nudges.ts` (already printed above) |
| PendingRecurringCard | direct Supabase update | `recurring_transactions.last_generated_date` advances | `confirmPendingRecurring()` / `skipPendingRecurring()` in `src/lib/recurring.ts` |

Code already printed in this turn for the four endpoints (`api/insights/dismiss`, `api/monthly/dismiss`) and for `lib/hints.ts`, `lib/income-nudges.ts`. There is no central `dismissCard(id)` action and no `useDismiss` hook — every card uses its own write path.

## 7. SHOULD I BUY

**Entry point:** `<ShouldIBuyButton />` rendered between SpendCard row and SundayRecapCard on Home (`dashboard/page.tsx:383`). Full source already printed in this turn.

**Decision UI:** `<DecisionSheet />` — bottom sheet with phases `'input' | 'loading' | 'result' | 'error'`. Inputs: itemName, amount, bucket (needs|wants|savings), urgency (now|can_wait|not_sure). On submit:
1. POST `/api/decisions/ask` with the four fields.
2. Render verdict banner + "the math" card (bucket-after %, optional goal impact, optional opportunity cost) + "Sika says" reasoning + "Nah, skip" / "I bought it" outcome buttons.
3. On outcome button: POST `/api/decisions/outcome` with `{ decision_id, outcome }`. If outcome === 'bought', also `router.push('/transactions')` so user can log it.

**Logic type:** **LLM-backed.** `/api/decisions/ask` calls `computeDecisionContext(serviceClient, userId, input)` and `generateDecision(ctx)` from `src/lib/decisions/`. The `generateDecision` function is an LLM call (the `src/lib/ai/` directory contains system prompts; PHASE1_AUDIT.md confirms this). The route inserts the result into `purchase_decisions` and returns `{ id, decision }`.

**Persistence:** `purchase_decisions` table (full DDL printed above). Stored fields: `item_name`, `amount`, `bucket`, `urgency`, `decision_data` (full JSON of LLM output: verdict, verdict_line, reasoning, accent, impact { bucket_after, goal_impact?, opportunity_cost? }), `outcome` (default `'undecided'`, set to `'bought'`/`'skipped'` later), `outcome_transaction_id` (FK to a `transactions` row when user logs the purchase).

**Surfaced as:** **Not a Home card.** Decisions are NOT fed back to Home. They're a one-shot modal flow. There is no "your past decisions" history view in the codebase — `purchase_decisions` is write-only from the user's perspective. The `outcome` column is updated but never read for UI. This is a candidate for a future history view but isn't built.

`POST /api/decisions/ask` (already printed above), `POST /api/decisions/outcome` (already printed above), `decision-sheet.tsx` (335 lines, printed above).

The decision shape:
```ts
type DecisionData = {
  verdict: 'go_for_it' | 'wait_a_bit' | 'skip_it' | ...;  // exact enum in src/types/decision.ts
  verdict_line: string;          // headline
  reasoning: string;             // multi-line explanation
  accent: 'green' | 'amber' | 'red' | 'blue';
  impact: {
    bucket_after: { bucket: 'needs' | 'wants' | 'savings'; pct_after: number; over_budget: boolean };
    goal_impact?: { goal_name: string; pct_of_goal: number; comment: string };
    opportunity_cost?: string;
  };
};
```

## 8. VIRTUAL CARD

**Status:** **NOT FOUND** as a backend feature.

`grep -rn "virtual_card\|virtualCard\|VirtualCard" src/ supabase/` returns zero results. There is no `virtual_cards` table, no `VirtualCardService`, no card-numbers, no PAN, no Stripe Issuing.

What looks like a virtual card on Home is the **`CycleCard`** component (`src/components/dashboard/cycle-card.tsx`) — a heritage-credit-card-shaped surface that visually mimics a payment card but is purely a balance display. It renders `cycleNet` (sum of cycle income − cycle expenses excluding paid-from-goal) with:
- `palette` from `CYCLE_CARD_THEMES[themeId]` keyed by `profile.card_theme` (one of `sankofa | gye_nyame | adinkrahene | copper | emerald | amber | obsidian` — see migrations 0014, 0028).
- A motif SVG component per theme (`src/components/cycle-card/motifs.tsx`).
- An EMV-chip SVG (`src/components/cycle-card/chip.tsx`).
- The user's `full_name.toUpperCase()` along the bottom-left.
- "SIKA" along the bottom-right.

So "virtual card" is a UI metaphor; there is no card-issuance feature. The iOS port should reproduce the same visual treatment from `profile.card_theme` and dynamic `cycleNet`.

## 9. CYCLE + BUCKETS

### Cycle
- **Util:** `src/lib/cycle.ts` (107 lines, full source already printed in PHASE1B_AUDIT.md Section 5). Functions: `getCycleForDate`, `getCycleAtOffset`, `getCycleFromStartDate`, `parseCycleParam`. Returns `CycleWindow { start, end, label, isCurrent, startDateStr }`.
- **Header on Home:** the cycle nav row at `dashboard/page.tsx:259-287` — left-arrow / `cycle.label` / right-arrow + "Past month" sub-label when `!cycle.isCurrent`. Right arrow disabled when `cycle.isCurrent`.
- **Source of `cycle_start_day`:** `profile.cycle_start_day` (DB CHECK 1..28). Default 1 makes cycles equal calendar months.
- **No SQL views or RPCs** — all cycle math is client-side.

### Buckets
- **Source:** **derived live, every render**, in `src/hooks/use-dashboard-data.ts:114-156` (full algorithm printed in PHASE1B_AUDIT.md Section 6). Computed from:
  - `bucketSpend.{needs,wants,savings}`: sum over `bucketExpenses` (expenses excluding `paid_from_goal_id`), grouped by `category.bucket_id → budget_buckets.name`.
  - Plus for `savings` only: any `transfer` with `goal_id != null` (goal contribution) OR `transfer` from non-savings into a `savings`/`investment` account.
  - `bucketLimits.{needs,wants,savings}`: `monthlyIncome × profile.{needs,wants,savings}_percent / 100`. `monthlyIncome` comes from `totalMonthlyIncome(incomeSources)` if any sources exist, else `profile.monthly_income`.
- **Stored vs derived:** **mostly derived.** The `budget_buckets` table exists and stores 3 rows per user (one per bucket: needs/wants/savings) — but those rows only carry display metadata (`display_name`, `color`, `sort_order`). Actual spend/limit numbers are recomputed client-side every dashboard load. Categories link to a bucket via `categories.bucket_id`. This means iOS can either:
  - Mirror the table (reads `budget_buckets` for display metadata + `categories.bucket_id` for grouping) and re-derive numbers, OR
  - Hard-code the three bucket names + `BUCKET_CONFIG` colors (since they're brand-significant constants), and only read `categories.bucket_id` for grouping.

- **Components:**
  - `BucketStrip` (mobile, full-width with progress bars) — already printed.
  - `BucketRing` × 3 (desktop only, circular SVG rings) — already printed.
  - `/buckets` detail page (`src/app/(app)/buckets/page.tsx`, 329 lines) — drilldown showing per-bucket transaction list + Savings tab special-cases transfers + goal contributions. Already printed in PHASE1B_AUDIT.md.
  - `BucketsTooltip` — `<HelpCircle>` icon that opens a Dialog explaining each bucket with `profile.{needs,wants,savings}_percent` displayed. Already printed above.

- **Per-bucket UI metadata:** `src/lib/constants.ts` (already printed): `BUCKET_CONFIG.{needs,wants,savings}.{label, color, description, explanation}`. Colors: `#00D9A3` / `#FBBF24` / `#60A5FA`. Default split `DEFAULT_BUCKET_PERCENTS = { needs: 50, wants: 30, savings: 20 }`.

## 10. OTHER HOME CONTENT

| Element | Component | Data source | Refresh logic |
|---|---|---|---|
| Income summary row (desktop) | inline in `dashboard/page.tsx:393-424` | `monthlyIncome` derived from `incomeSources` else `profile.monthly_income`; expandable per-source breakdown | Re-renders from auth-store on profile/sources change |
| Account strip (desktop) | inline in `dashboard/page.tsx:486-522` | `accounts` from auth-store + `dashboardStats.accountBalances` (computed in use-dashboard-data via `computeAccountBalances`) | Re-runs when `mutationCount` bumps |
| Pull-to-refresh | `<PullToRefresh onRefresh={handleRefresh}>` at `dashboard/page.tsx:253` | wraps the whole page; `handleRefresh = router.refresh() + refetch()` | Manual gesture |
| Section divider | inline `<div className="my-6 border-t border-border/40" />` after CycleCard | none | static |
| FAB to add transaction | `<AddTransactionFab>` — mounted in `AppShell`, not on Home directly | `useTransactionStore.openLogSheet()` | persistent across all routes |
| BadgeCelebrationHost | `<BadgeCelebrationHost>` mounted in AppShell | reads `auth-store.badgeCelebrationQueue` | enqueued from various badge unlock paths (also from Home via `checkAndUnlockBadges('cycle_ended')` on every dashboard mount — `dashboard/page.tsx:161-167`) |
| Dashboard fan-out fetches in parallel from `useDashboardData` | (cycleTxns, prevTxns, buckets, cats, allTxnsForBalance) — see Section 1 of PHASE1B_AUDIT.md | computed into `dashboardStats` | Re-runs when `cycleStartDateStr` or `mutationCount` changes |

Components in `src/components/dashboard/` that are **NOT** rendered on Home (verified by grep on `dashboard/page.tsx`):
- `streak-strip.tsx`, `momentum-strip.tsx`, `recent-badges.tsx` — these belong to `/streaks` `/momentum` `/badges` routes.

## 11. iOS PORT IMPLICATIONS

iOS Home rebuild will need the following work, organized by what does and doesn't exist today (per the iOS audit you just ran).

### Models (new)
- **`BudgetBucket`** — three rows per user (needs/wants/savings), columns `id, user_id, name, display_name, color, icon?, sort_order`. Without this iOS can't render `BucketStrip` headers in the right colors/order coming from DB. (Alternative: hardcode the 3 buckets and only read `categories.bucket_id` to group.)
- **`Goal`** — for `GoalsWidget` and the savings-bucket-counts-goal-contributions math. Columns include `goal_type` ('target' | 'perpetual'), `target_amount`, `target_date`, `funding_account_id`, `completed_at`, `is_archived`, `name`, `icon`, `color`. Plus `GoalProgress` derived shape for the widget.
- **`Streaks`, `Momentum`, `UserBadge`, `HealthScore`** — for `HealthRow`. Each maps 1:1 to Supabase tables (streaks, momentum + momentum_events, user_badges + badges, computed health-score).
- **`DailyDigest`** (shared `sika_daily_digests` row) + **`UserDailyRead`** — for `SikaDailyBanner`.
- **`DailyInsightRow`** with `insight_data: { headline, body, accent, icon?, stat? }` — for `InsightStrip`.
- **`MonthlyRecap`** with `recap_data: [card]` — for `SikaMonthlyBanner` link target (the /monthly viewer is Phase 2).
- **`PurchaseDecision`** + `DecisionData` (verdict, verdict_line, reasoning, accent, impact) — for Should I Buy.
- **`RecurringTransaction`** + `IncomeNudge` (already in iOS types?) — for `PendingRecurringCard` and `IncomeNudgeCard`. iOS audit shows `IncomeSource` exists but neither RecurringTransaction nor IncomeNudge model is confirmed.
- **`DismissedHint`** — simple, just `(user_id, hint_id)`. Could be modeled as a `Set<HintId>` cached in AppState.
- **`IncomeNudgeDismissal`** — implicitly handled by writing rows; iOS likely needs a service helper, not a stored model.

**No new model needed for "VirtualCard"** — that's the existing `Cycle` model + `profile.card_theme` enum + the cycle-card visual treatment. iOS needs to define the heritage themes (sankofa, gye_nyame, adinkrahene, copper, emerald, amber, obsidian) with their motifs, palettes, and EMV chip — pure UI, no backend.

### Services (new)
- `BucketService` (or compute on AppState) — fetch `budget_buckets`, derive bucket totals from transactions/categories.
- `GoalService` — fetchGoals, fetchGoalAmounts, computeGoalProgress.
- `StreakService`, `MomentumService`, `BadgeService`, `HealthScoreService` — gamification stack.
- `DailyDigestService` — fetch today's digest + read state.
- `InsightService` — `fetchTodayInsight`, `dismissTodayInsight` (POST `/api/insights/dismiss`), or call Supabase directly.
- `MonthlyRecapService` — fetch latest unread, dismiss, mark viewed.
- `PurchaseDecisionService` — POST ask, POST outcome.
- `RecurringService` — generateDueTransactions (CLIENT-SIDE on web — iOS may keep this client-side or move to a Supabase Edge Function).
- `IncomeNudgeService` — getDueIncomeNudges + recordNudgeDismissal.
- `HintsService` — fetchDismissed, dismissHint.

### AppState properties (new)
- `buckets: [BudgetBucket]` (or derive from constants if not modeled)
- `goals: [Goal]`, `goalProgresses: [GoalProgress]`
- `streaks: Streaks?`, `momentum: Momentum?`, `userBadges: [UserBadge]`, `healthScore: HealthScore?`
- `todayDigest: DailyDigest?`, `digestRead: Bool`
- `todayInsight: DailyInsightRow?`
- `monthlyRecapId: UUID?` (just the unread banner pointer)
- `incomeNudges: [IncomeNudge]`, `pendingRecurring: [{ recurring, dueDates }]`
- `dismissedHints: Set<HintId>`, `hintsLoaded: Bool`
- `badgeCelebrationQueue: [BadgeCelebrationItem]`

The web has these split across two Zustand stores (auth-store has profile/incomeSources/accounts/streaks/momentum/userBadges/healthScore/badgeQueue; transaction-store has transactions/categories/dashboardStats). iOS already has the auth half in `AppState` plus accounts/categories/transactions; the gamification half is missing entirely.

### Cron equivalents on iOS
**None.** Crons are server-only. iOS just consumes the rows the crons produced. The four cron writes happen on Vercel on a schedule and iOS reads the resulting Supabase tables.

### New components on iOS (rough estimate, in render order)

| Component | Source web file (lines) | Notes |
|---|---|---|
| Cycle navigation row | inline in dashboard/page.tsx (29 lines) | Two icon buttons + center label + "Past month" subtitle |
| `SikaDailyBanner` | 33 | Conditional on digest+read state |
| `InsightStrip` | 68 | Color-accented strip + Lucide-by-name icon mapping |
| `SikaMonthlyBanner` | 56 | Tap → /monthly; X dismiss |
| `CycleCard` (with motif + chip + 7 themes) | 209 + motifs.tsx + chip.tsx | Heritage themes — the most complex visual asset on Home |
| `SpendCard` | 41 | × 2 in 2-col grid |
| `ShouldIBuyButton` + `DecisionSheet` | 27 + 335 | Multi-phase modal |
| `SundayRecapCard` | 131 | Sunday-only; per-week dismissal id derived from ISO week |
| `HealthRow` | 92 | Sika score + flame + tier + N/8 badges |
| `IncomeNudgeCard` + `PendingRecurringCard` | 110 (one file) | Two card variants in the same file |
| `BucketStrip` | 59 | Three horizontal progress bars, tile is a Link to /buckets |
| `WeeklyChart` | 56 | Apple `Charts` BarChart equivalent (iOS has no charts framework yet — `import Charts` first-time wire-up) |
| `GoalsWidget` | 69 | Top-3 goal cards with motion progress bars |
| `RecentTransactions` | 83 | Dashboard variant (top-5, simpler than full TransactionItem) |
| `OnboardingModal` | 672 | Massive 6-step wizard — iOS may already have this |
| `HintCard` (+ `BucketsTooltip`) | 143 | Generic per-user dismissible tile |
| Pull-to-refresh wrapper | uses ui/pull-to-refresh | iOS has `.refreshable` natively |
| `BadgeCelebrationHost` | (mounted in AppShell, not Home) | Modal queue for badge unlocks |

### Work that's already reusable on iOS (per your iOS audit)
- `Cycle` struct + `CycleCalculator` enum mirrors `lib/cycle.ts`. ✓
- `CurrencyFormatter` mirrors `useCurrency()`. ✓
- `Profile`, `Account`, `Transaction`, `TransactionCategory`, `IncomeSource` models. ✓
- `AppState` already loads accounts/categories/transactions on bootstrap. The fan-out pattern (parallel `async let`) is already in place; just needs more parallel fetches added.
- Heritage theme palette tokens: `SikaTheme.Color.bucketNeeds/Wants/Savings` exist. ✓
- `SikaStepIndicator` and `SikaChip` reusable primitives in `Sika/Core/UI/Onboarding/`. ✓

### Verification flags before iOS rebuild
- **`purchase_decisions.bucket` constraint** — code accepts `'savings'` but DDL says `'future'`. Verify production DB before mirroring.
- **`monthly_recaps.dismissed_at` column** — exists per migration 0025 but original 0021 didn't have it; ensure your DB has it.
- **Sika Daily news shape** — `stories` jsonb structure is in `src/types/daily.ts` (not printed here) and the `headline` field is what's surfaced in the banner. Read that file before modeling on iOS.
- **No central card registry** — iOS shouldn't try to over-abstract a `HomeCard` enum/protocol; web treats each card as its own component with its own data path. Cleaner to mirror that, even if more component files.

## Adjacent observations

- **`/dashboard/cycle-detail`** route is reachable from tapping the CycleCard. Likely shows a per-cycle breakdown — relevant to Home's flow but its content is out of scope here.
- **Top bar settings gear** is the only nav off Home that isn't in the bottom nav / side rail. iOS should keep the gear-on-Home pattern (since Settings isn't a tab on mobile).
- **`PostHogProvider` + `analytics.transactionLogged`/`decisionOpened`/`decisionVerdictReceived`** — Home and the decision flow fire several PostHog events. Mirror these on iOS via the existing `AnalyticsService`.
- **`<BadgeCelebrationHost />`** is mounted globally in `AppShell` and consumes a per-action queue. Whenever a Home action (transaction insert, decision outcome, cycle end check) calls `checkAndUnlockBadges`, the host pops modals one at a time. This is its own subsystem, separate from the dismissible-card catalog above — flag as part of the gamification stack.
- **`dashboard/page.tsx:161-167`** runs `checkAndUnlockBadges(supabase, user.id, 'cycle_ended')` on every Home mount. iOS must replicate this if it wants `cycle_ended` badges to ever fire (there's no server trigger for this category).
