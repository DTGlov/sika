# Sika Phase 1 Audit
Generated: 2026-05-06

This audit was produced from a read-only walk of the `sika-web` repo on branch `feat/welcome-push-and-pwa-install-guide`. Quoted code snippets reflect file state at audit time. Where I was unable to verify a fact in code, the entry is marked **UNKNOWN**.

---

## 0. Repo overview

### Top-level `src/`
- `src/app/` — Next.js App Router. Three top-level route groups: `(app)` (authenticated), `(auth)` (login/signup/verify-email), and `api/` (Vercel Functions for cron + AI + push). Plus public `/privacy` and `/monthly-share/share/[id]`.
- `src/components/` — UI: `ui/` (shadcn primitives), `layout/` (AppShell/TopBar/BottomNav/SideRail), `dashboard/`, `transactions/`, `accounts/`, `goals/`, `recurring/`, `settings/`, `monthly/`, `decision/`, `cycle-card/`, `badges/`, `onboarding/`, `brand/`. Loose components: `hint-card.tsx`, `momentum-float.tsx`, `progress-bar.tsx`, `pwa-register.tsx`, `pwa-splash.tsx`.
- `src/hooks/` — `use-currency`, `use-dashboard-data`, `use-feature-flag`, `use-haptics`, `use-media-query`, `use-profile`, `use-streaks`.
- `src/lib/` — domain helpers (`cycle.ts`, `accounts.ts`, `goals.ts`, `recurring.ts`, `streaks.ts`, `momentum.ts`, `badges.ts`, `income.ts`, `income-nudges.ts`, `health-score.ts`, `hints.ts`, `currencies.ts`, `constants.ts`, `pwa.ts`, `haptics.ts`, `push-sender.ts`, `push-subscriptions.ts`, `revalidation.ts`, `share-monthly.ts`, `toast-with-haptic.ts`, `utils.ts`), plus subdirs: `ai/` (system prompts), `analytics/` (PostHog), `daily/`, `decisions/`, `format/`, `insights/`, `monthly/`, `supabase/` (client/server/service/middleware).
- `src/stores/` — Zustand: `auth-store.ts`, `transaction-store.ts`.
- `src/types/` — TS types per domain.

### Counts
- Files in `src/app/(app)/`: **19**
- Files in `src/components/`: **72**

### Unconventional structure worth flagging
- Two parallel "type" columns on `accounts`: `type` (the legacy enum) and `account_type` (newer enum: `general/wallet/cash/savings/investment/other`) — but `account_type` is referenced in the `handle_new_user` trigger (migrations 0029/0030) and never has a matching `ALTER TABLE accounts ADD COLUMN account_type`. No migration in `supabase/migrations/` creates it. App code only uses the legacy `type` field (`src/types/account.ts:1` enumerates `bank | momo | cash | savings | investment | other`); there are zero `accountType` or `account_type` references in `src/`. **The trigger as written would fail on a fresh database** unless `account_type` was added out-of-band (e.g. via Supabase dashboard).
- `src/app/(app)/template.tsx` exists alongside `layout.tsx` — used for per-navigation animations.
- The dashboard cycle nav writes `?cycle=YYYY-MM-DD` to the URL and parses it back through `parseCycleParam`; this is the only deeplink-driven cycle navigation.
- A `monthly-share/share/[id]` public page exists outside the `(app)` group for sharing recap previews.

---

## 1. Database schema — every Phase 1 table

All migrations in `supabase/migrations/`. RLS is enabled on every table. The single `handle_new_user()` trigger (rewritten across 0001/0003/0004/0013/0029/0030) seeds buckets/categories/accounts/streaks on `auth.users` insert. There are no other table-level `create trigger` statements except `update_updated_at` rebound to most tables.

### profiles
Source: `0001_initial_schema.sql:2-12`, modified by 0003, 0005, 0014, 0020, 0026, 0027, 0028, 0029, 0030.

Columns:
- `id uuid` PK, FK → `auth.users` ON DELETE CASCADE
- `full_name text` (nullable)
- `monthly_income numeric(12,2) default 0`
- `currency text NOT NULL default 'GHS'` (made NOT NULL in 0030)
- `needs_percent numeric(5,2) default 50`
- `wants_percent numeric(5,2) default 30`
- `savings_percent numeric(5,2) default 20` (renamed from `future_percent` in 0029)
- `cycle_start_day int default 1` CHECK (1..28) — added 0003
- `accounts_banner_dismissed bool NOT NULL default false` — added 0005
- `card_theme text NOT NULL default 'sankofa'` CHECK in (`sankofa, gye_nyame, adinkrahene, copper, emerald, amber, obsidian`) — final state from 0028 (was metallic names from 0014 originally)
- `theme_preference text default 'dark'` CHECK in (`light, dark`) — re-added in 0026 (dropped in 0020)
- `haptics_enabled bool default true` — added 0027
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`

FKs: `id` → `auth.users.id` (CASCADE).
Policies: `"own profile" on profiles for all using (auth.uid() = id)` (0001:60).
Triggers: `handle_new_user()` AFTER INSERT on `auth.users`.

### accounts
Source: `0003_accounts_and_cycles.sql:2-15`.

Columns:
- `id uuid` PK
- `user_id uuid NOT NULL` FK → `auth.users` (CASCADE)
- `name text NOT NULL`
- `type text NOT NULL` CHECK in (`bank, momo, cash, savings, investment, other`)
- `icon text`, `color text` (nullable)
- `opening_balance numeric(12,2) NOT NULL default 0`
- `is_active bool default true`
- `is_default bool default false` — unique partial index on `(user_id) where is_default = true` (0003:18)
- `sort_order int default 0`
- `created_at timestamptz`, `updated_at timestamptz`

**Discrepancy:** trigger (0029, 0030) inserts `(user_id, name, type, account_type, opening_balance, sort_order)` referencing `account_type` — that column has no migration. Probably present in production via dashboard but not reproducible from the migration history.

Policies: `"own accounts" for all using (auth.uid() = user_id)`.
Triggers: `accounts_updated_at BEFORE UPDATE` running `update_updated_at()`.

### categories
Source: `0001_initial_schema.sql:27-36`, modified 0004.

Columns:
- `id uuid` PK
- `user_id uuid` FK → `auth.users` (CASCADE) — nullable (system categories)
- `bucket_id uuid` FK → `budget_buckets` (SET NULL)
- `name text NOT NULL`
- `icon text`, `is_default bool default false`, `is_archived bool default false`
- `category_type text NOT NULL default 'expense'` CHECK in (`expense, income, adjustment, transfer, system`) — added 0004
- `created_at timestamptz`

Constraint `category_bucket_consistency` (0004:22): `(expense AND bucket_id NOT NULL) OR (non-expense AND bucket_id IS NULL)`.
Policies: `"own categories" for all using (auth.uid() = user_id OR user_id IS NULL)`.
Triggers: none direct; populated by `handle_new_user()`.

### transactions
Source: `0001_initial_schema.sql:39-48` plus migrations 0003, 0005, 0006, 0009, 0010.

Columns:
- `id uuid` PK
- `user_id uuid NOT NULL` FK → `auth.users` (CASCADE)
- `category_id uuid` FK → `categories` (SET NULL) — nullable
- `amount numeric(12,2) NOT NULL` — for adjustments this is signed (positive = increase, negative = decrease)
- `type text NOT NULL` CHECK in (`expense, income, transfer, adjustment`) — adjustment added in 0005
- `note text`
- `transaction_date date NOT NULL default current_date`
- `account_id uuid NOT NULL` FK → `accounts` (RESTRICT) — added 0003
- `to_account_id uuid` FK → `accounts` (RESTRICT) — added 0003, transfer-only
- `generated_from_recurring uuid` FK → `recurring_transactions` (SET NULL) — added 0006
- `goal_id uuid` FK → `goals` (SET NULL) — added 0009 (transfers that contribute to a goal)
- `paid_from_goal_id uuid` FK → `goals` (SET NULL) — added 0010 (expense paid from a sinking-fund goal)
- `created_at timestamptz`

Constraints:
- `transfer_accounts_differ` (0003:34): `type != 'transfer'` OR (both account ids set and differ)
- `non_transfer_no_to_account` (0003:38): `type = 'transfer'` OR `to_account_id IS NULL`
- `paid_from_goal_requires_expense` (0010:9): `paid_from_goal_id IS NULL OR type = 'expense'`

Indexes: `(user_id, transaction_date desc)`, `(category_id)`, `(account_id)`, `(generated_from_recurring) where ... not null`, `(paid_from_goal_id) where ... not null`, `(goal_id) where ... not null`.

Policies: `"own transactions" for all using (auth.uid() = user_id)`.
Triggers: none direct.

### recurring_transactions
Source: `0006_recurring_transactions.sql:2-30`.

Columns:
- `id uuid` PK
- `user_id uuid NOT NULL` FK → `auth.users`
- `account_id uuid NOT NULL` FK → `accounts` (RESTRICT)
- `category_id uuid` FK → `categories` (SET NULL)
- `type text NOT NULL` CHECK in (`expense, income`) **— income allowed at the schema level** (the UI restricts to expense; see Section 12)
- `amount numeric(12,2) NOT NULL` CHECK > 0
- `note text`
- `frequency text NOT NULL` CHECK in (`daily, weekly, biweekly, monthly, yearly`)
- `start_date date NOT NULL`, `end_date date` (nullable)
- `schedule_day int` (DOW for weekly/biweekly, DOM for monthly with `-1` = "last day", ignored otherwise)
- `auto_log bool default true`
- `last_generated_date date` (nullable)
- `is_active bool default true`, `is_paused bool default false`
- `created_at`, `updated_at`

Policies: `"own recurring" for all using (auth.uid() = user_id)`.
Triggers: `recurring_updated_at BEFORE UPDATE`.

### income_sources
Source: `0002_income_sources.sql:1-12`.

Columns:
- `id uuid` PK
- `user_id uuid NOT NULL` FK → `auth.users` (CASCADE)
- `name text NOT NULL`
- `amount numeric(12,2) NOT NULL` CHECK > 0
- `frequency text NOT NULL` CHECK in (`monthly, weekly, biweekly, irregular`)
- `expected_day int` (1-31 for monthly, 0-6 for weekly, null for irregular)
- `is_active bool default true`
- `notes text`
- `created_at`, `updated_at`

Policies: `"own income sources" for all using (auth.uid() = user_id)`.
Triggers: `income_sources_updated_at BEFORE UPDATE`.

### income_nudge_dismissals
Source: `0006_recurring_transactions.sql:50-58`.

Columns: `id uuid` PK, `user_id NOT NULL`, `income_source_id NOT NULL` FK → `income_sources` (CASCADE), `due_date date NOT NULL`, `action text NOT NULL` CHECK in (`logged, snoozed, dismissed`), `created_at`. UNIQUE `(user_id, income_source_id, due_date)`.

Policies: `"own dismissals" for all using (auth.uid() = user_id)`.
Triggers: none.

### budget_buckets
Source: `0001_initial_schema.sql:15-24`.

Columns: `id uuid` PK, `user_id NOT NULL` FK, `name text NOT NULL` (`needs|wants|savings`), `display_name text NOT NULL`, `color text NOT NULL`, `icon text`, `sort_order int NOT NULL`, `created_at`.

Policies: `"own buckets" for all using (auth.uid() = user_id)`.
Triggers: none direct (seeded by `handle_new_user`).

### goals
Source: `0009_goals.sql`, modified 0010, 0012.

Columns: `id uuid` PK, `user_id NOT NULL`, `name text NOT NULL` (1..80), `description text`, `icon text`, `color text`, `goal_type text NOT NULL` CHECK in (`target, perpetual`) (was `savings/perpetual/sinking_fund` originally; consolidated in 0012), `target_amount numeric(12,2)` CHECK > 0, `deadline date`, `funding_account_id NOT NULL` FK → `accounts` (RESTRICT), `priority int default 5` CHECK 1..10, `is_active bool default true`, `is_archived bool default false`, `completed_at timestamptz`, `previous_goal_id uuid` FK → `goals` (SET NULL), `cycle_count int default 1`, `created_at`, `updated_at`.

Constraint `goal_type_rules`: perpetual ⇒ `deadline IS NULL`; target ⇒ both `target_amount` and `deadline` not null.

Policies: `"own goals" for all using (auth.uid() = user_id)`.
Triggers: `goals_updated_at BEFORE UPDATE`.

### streaks
Source: `0013_streaks.sql:1-25`.

Columns: `user_id uuid` PK FK → `auth.users` (CASCADE), `logging_current int`, `logging_longest int`, `logging_last_date date`, `savings_current int`, `savings_longest int`, `savings_last_week date` (Monday of last contribution week), `freezes_banked int default 0` CHECK 0..2, `freezes_earned_total int default 0`, `logging_milestones_shown int[] default '{}'`, `savings_milestones_shown int[] default '{}'`, `created_at`, `updated_at`.

Policies: `"own streaks" for all using (auth.uid() = user_id)`.
Triggers: `streaks_updated_at BEFORE UPDATE`. Backfill on migration. New row inserted by `handle_new_user()`.

### momentum
Source: `0015_momentum.sql:3-9`, tier values updated by 0016.

Columns: `user_id uuid` PK FK → `auth.users` (CASCADE), `total_points int NOT NULL default 0`, `tier text NOT NULL default 'bronze'` CHECK in (`bronze, silver, gold, platinum, diamond`), `created_at`, `updated_at`.

Policies (split per-action): `"Users can view/insert/update own momentum"` (SELECT/INSERT/UPDATE).
Triggers: none direct.

### momentum_events
Source: `0015_momentum.sql:11-17`.

Columns: `id uuid` PK, `user_id NOT NULL` FK, `event_type text NOT NULL`, `points int NOT NULL`, `created_at`.
Index: `momentum_events_user_created (user_id, created_at desc)`.
Policies: SELECT + INSERT for `auth.uid() = user_id`.

### user_badges
Source: `0017_badges.sql:13-20`.

Columns: `id uuid` PK (default `uuid_generate_v4()`), `user_id NOT NULL` FK, `badge_id text NOT NULL` FK → `badges(id)`, `unlocked_at timestamptz NOT NULL default now()`, `celebration_shown bool default false`, UNIQUE `(user_id, badge_id)`.

Policies: `"own user_badges" for all using (auth.uid() = user_id)`.
Triggers: none.

### badges
Source: `0017_badges.sql:2-10`. **Shared catalog (no user_id).** No RLS — readable by anyone authenticated by default-row-permissions (note: I did not see an explicit RLS enable in 0017, so reads are PUBLIC unless reverted elsewhere).

Columns: `id text` PK, `name text`, `description text`, `icon_name text` (Lucide), `rarity text` (`common|rare`), `sort_order int`, `created_at`.

Seeded with 8 badges (0017:28-36): `first_steps, week_warrior, goal_getter, consistent_saver, century_club, month_of_discipline, seeker, safety_net`.

### purchase_decisions
Source: `0024_purchase_decisions.sql:1-12`.

Columns: `id uuid` PK, `user_id NOT NULL` FK, `item_name text NOT NULL`, `amount numeric(12,2) NOT NULL`, `bucket text NOT NULL` CHECK in (`needs, wants, savings`), `urgency text` CHECK in (`now, can_wait, not_sure`), `decision_data jsonb NOT NULL`, `outcome text default 'undecided'` CHECK in (`bought, skipped, undecided`), `outcome_transaction_id uuid` FK → `transactions` (SET NULL), `created_at`.

Index: `(user_id, created_at desc)`.
Policies: SELECT/INSERT/UPDATE all `auth.uid() = user_id`.
Triggers: none.

### daily_insights
Source: `0023_daily_insights.sql`.

Columns: `id uuid` PK, `user_id NOT NULL` FK, `insight_date date NOT NULL`, `insight_data jsonb NOT NULL`, `generated_at timestamptz`, `dismissed_at timestamptz`, UNIQUE `(user_id, insight_date)`.

Policies: SELECT + UPDATE for `auth.uid() = user_id`. **No INSERT policy** — inserts happen via the service-role cron.
Triggers: none.

### sika_daily_digests
Source: `0018_sika_daily.sql:2-9`. **Shared (no user_id).**

Columns: `id uuid` PK, `digest_date date NOT NULL UNIQUE`, `stories jsonb NOT NULL`, `is_fallback bool default false`, `generated_at`, `created_at`.

Index `(digest_date desc)`. No RLS enabled. Includes a `cleanup_old_digests()` PL/pgSQL function that keeps the last 2.

### sika_daily_sources
Source: `0018_sika_daily.sql:28-35`.

Columns: `id uuid` PK, `name text`, `rss_url text`, `category text` CHECK in (`world_markets, africa_rising, tech_trends, young_money`), `is_active bool default true`, `created_at`. Seeded with 12 RSS feeds.
Policies: none (no RLS enable). Read by service-role cron.

### monthly_recaps (renamed from `weekly_recaps`)
Source: `0021_weekly_recaps.sql` + `0022_rename_weekly_to_monthly.sql` + `0025_monthly_banner_dismiss.sql`.

Columns: `id uuid` PK, `user_id NOT NULL` FK, `month_start date NOT NULL`, `month_end date NOT NULL`, `recap_data jsonb NOT NULL`, `generated_at`, `viewed_at timestamptz`, `shared_at timestamptz`, `dismissed_at timestamptz`, UNIQUE `(user_id, month_start)`.

Index: `(user_id, month_start DESC)`.
Policies: SELECT + UPDATE for owner. No INSERT (cron uses service role).

### user_daily_reads
Source: `0018_sika_daily.sql:14-20`.

Columns: `id uuid` PK, `user_id NOT NULL` FK, `digest_date date NOT NULL`, `read_at timestamptz`, UNIQUE `(user_id, digest_date)`.

Policies: `"own daily reads" for all using (auth.uid() = user_id)`.

### dismissed_hints
Source: `0008_dismissed_hints.sql`.

Columns: `user_id` (PK part), `hint_id text` (PK part), `dismissed_at timestamptz`. Composite PK `(user_id, hint_id)`. Hint IDs are stable strings defined in `src/lib/hints.ts`.

Policies: `"own dismissed hints" for all using (auth.uid() = user_id)`.

### push_subscriptions
Source: `0031_push_subscriptions.sql`.

Columns: `id uuid` PK, `user_id NOT NULL` FK, `endpoint text NOT NULL`, `p256dh_key text NOT NULL`, `auth_key text NOT NULL`, `user_agent text`, `created_at`, UNIQUE `(user_id, endpoint)`. Index on `user_id`.

Policies: SELECT/INSERT/DELETE for `auth.uid() = user_id`. No UPDATE.

---

## 2. Onboarding flow

### Trigger condition
`src/app/(app)/dashboard/page.tsx:93-97`:
```ts
useEffect(() => {
  if (profile && profile.monthly_income === 0 && incomeSources.length === 0) {
    setShowOnboarding(true);
  }
}, [profile, incomeSources]);
```
i.e. shown the first time after signup whenever both `profiles.monthly_income === 0` AND `income_sources` is empty. Closing the modal does not persist a "seen" flag — it relies on `monthly_income > 0` after step 6 to avoid re-trigger.

### Modal: `src/components/dashboard/onboarding-modal.tsx`
6-step progressive flow; step state held entirely in component, persisted only on Step 6's "Finish".

#### Step 1 — Intro
Plain text + "Get started" CTA + "I'll do this later" exit. No DB writes.

#### Step 2 — Currency picker
- Searchable list. Loads `POPULAR_CURRENCIES` first (8 codes — see below), then `ALL_CURRENCIES`.
- Source list: `src/lib/currencies.ts:7` (popular) and `:9-141` (all). 119 currencies seeded.
- `POPULAR_CURRENCIES = ['GHS', 'NGN', 'KES', 'ZAR', 'EGP', 'USD', 'EUR', 'GBP']`.
- Default: `'GHS'`. Stored to component state until finish.

#### Step 3 — Primary income
- `react-hook-form` with `primarySchema` (lines 48-63):
  ```ts
  const primarySchema = z.object({
    name: z.string().min(1, 'Required').max(50),
    amount: z.number().positive('Must be greater than 0'),
    frequency: z.enum(['monthly', 'weekly', 'biweekly', 'irregular']),
    expected_day: z.number().int().min(0).max(31).nullable().optional(),
  }).superRefine((data, ctx) => {
    if (data.frequency !== 'irregular' && data.expected_day == null) {
      ctx.addIssue({ /* "Pick the day of month/week..." */ });
    }
  });
  ```
- Frequency picker uses `FREQUENCIES = ['monthly','weekly','biweekly','irregular']`. `biweekly` displays as "Bi-wk" (line 396).
- For `monthly`, asks day-of-month (1-31). For `weekly|biweekly`, picks from `DAY_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']`. For `irregular`, no expected_day collected and the message reads: "Irregular income — Sika won't send reminders. Log it manually when received."

#### Step 4 — Extra income (templates)
4 templates from `EXTRA_TEMPLATES` (lines 41-46):
| _key | name | frequency | expected_day |
| --- | --- | --- | --- |
| `weekly-allowance` | Weekly Allowance | weekly | 1 |
| `monthly-allowance` | Monthly Allowance | irregular | null |
| `side-hustle` | Side Hustle | irregular | null |
| `benefit` | Benefit / Subsidy | monthly | 1 |

Tap template → inline amount input → confirm with check / cancel with X. Added items render below as removable chips.

#### Step 5 — Review
Shows total monthly income (computed via `calculateMonthlyEquivalent` per source, then summed in component). Lists each source with monthly equivalent. Bucket preview hardcoded to 50/30/20: Needs `#00D9A3`, Wants `#FBBF24`, Savings `#60A5FA` (note: this is independent of `DEFAULT_BUCKET_PERCENTS`, which says 50/30/20 in `src/lib/constants.ts:28-32`).

#### Step 6 — PWA install
Renders `<PwaInstallGuide />` (`src/components/onboarding/pwa-install-guide.tsx`). Branches by `detectPlatform()` from `src/lib/pwa.ts`: `ios-safari` / `android-chrome` / `desktop` / `other`. Two-button row: "Skip for now" → calls `handleFinish()`; "I've installed Sika" → if `isInPWA()` calls `handleFinish()`, else toasts "Open Sika from your home screen to continue". **iOS Phase 1 will skip this entire step.**

### `handleFinish` (lines 162-202) — the only DB write of onboarding
```ts
const all = [primarySource, ...extraSources];
const toInsert = all.map(s => ({
  user_id, name, amount, frequency, expected_day,
  is_active: true, notes: null,
}));
await supabase.from('income_sources').insert(toInsert).select();
const total = totalMonthlyIncome(sources);
await supabase.from('profiles')
  .update({ monthly_income: total, currency: selectedCurrency, updated_at: now })
  .eq('id', user.id).select().single();
analytics.onboardingCompleted({ stepsCompleted: 6 });
```

### `analytics.onboardingCompleted`
`src/lib/analytics/identify.ts:21-22`:
```ts
onboardingCompleted: (properties?: { stepsCompleted: number }) =>
  posthog.capture('onboarding_completed', properties),
```
Only one property: `stepsCompleted` (always passed as `6`).

### `calculateMonthlyEquivalent`
`src/lib/income.ts:3-13`:
```ts
export function calculateMonthlyEquivalent(amount, frequency) {
  switch (frequency) {
    case 'monthly': return amount;
    case 'weekly': return amount * 4.333;
    case 'biweekly': return amount * 2.167;
    case 'irregular': return amount;
  }
}
```

### `FREQUENCY_LABELS` / `FREQUENCY_COLORS`
`src/lib/income.ts:21-33`:
- Labels: `monthly: 'Monthly', weekly: 'Weekly', biweekly: 'Bi-weekly', irregular: 'Irregular'`
- Colors: `monthly: '#00D9A3', weekly: '#60A5FA', biweekly: '#FBBF24', irregular: '#A1A1AA'`

(Note: `src/lib/recurring.ts:9-15` exports a *different* `FREQUENCY_LABELS` for recurring expense schedules: adds `daily/yearly`, drops `irregular`.)

---

## 3. Add Transaction flow

### Routes & components
- No dedicated route. Triggered globally by `<AddTransactionFab />` (rendered inside `AppShell`, `src/components/layout/app-shell.tsx:47-48`) which calls `useTransactionStore.openLogSheet()`.
- The sheet itself: `src/components/transactions/transaction-sheet.tsx` (933 lines) is the entire transaction lifecycle (create, edit, reconcile-as-adjustment).
- Sub-components in `src/components/transactions/`: `amount-keypad.tsx`, `category-grid.tsx`, `income-category-picker.tsx`, `insufficient-balance-sheet.tsx`, `transaction-item.tsx`.

### Multi-step
Four step types:
- `expense`/`income`: `amount → category → details`
- `transfer`: `amount → accounts → details`
- `adjustment` (reconcile): single `reconcile` step

The active step list comes from `stepList` (lines 418-422). FAB always opens at step `amount` with `txType='expense'` unless re-opened with `editingTransaction` or `reconcileContext`.

### Fields & validation
- **amount**: numeric keypad (`AmountKeypad`); `parseFloat(amount) > 0` to proceed.
- **type**: switched via the keypad's tab control (`expense | income | transfer`) plus a hidden "Reconcile" link below the keypad.
- **category_id**: required for expense (`CategoryGrid`); for income, `IncomeCategoryPicker` chooses from `INCOME_PRESETS` + a custom-emoji "other" option, mapped to a category via `resolveIncomeCategory()` (lines 234-248).
- **account_id**: defaults to `accounts.find(a => a.is_default)?.id ?? accounts[0]?.id` (line 59). Selected via account chip row.
- **to_account_id**: only for transfers; selected on `accounts` step.
- **date**: `txDate` defaults to `format(new Date(), 'yyyy-MM-dd')` and is **user-editable** in the `details` step via `<input type="date">` (line 743-748).
- **note**: free-text field on `details` step.
- **paid_from_goal_id**: optional, only shown when `txType === 'expense' && sinkingFundGoals.length > 0`. Live balance check + overspend block.
- No Zod schema for the transaction itself — validation is ad-hoc in `handleSave`/`handleNext`.

### `transaction_date` capture
- New txns: `txDate = format(new Date(), 'yyyy-MM-dd')`, user-modifiable via the date input on the details step.
- Reconcile flow forces `transaction_date: format(new Date(), 'yyyy-MM-dd')` (line 377).

### `type` is set via UI
Keypad's tab control supplies expense/income/transfer; Scale-icon shortcut puts it in adjustment mode and switches step to `reconcile` (lines 168-181).

### Insert payload (lines 266-275)
```ts
const payload = {
  amount: parseFloat(amount),
  type: txType,
  category_id: (txType === 'transfer' || txType === 'adjustment') ? null : effectiveCategoryId,
  account_id,
  to_account_id: txType === 'transfer' ? toAccountId : null,
  note: effectiveNote || null,
  transaction_date: txDate,
  paid_from_goal_id: txType === 'expense' ? paidFromGoalId : null,
};
// inserted with user_id added
await supabase.from('transactions').insert({ user_id, ...payload }).select(...).single();
```
Reconcile payload (lines 369-378):
```ts
{ user_id, amount: reconcileDiff, type: 'adjustment',
  category_id: null, account_id, to_account_id: null,
  note: note || `Reconciled to ${formatMoney(actual)}`,
  transaction_date: today }
```
`reconcileDiff` is `actualBalance - sikaBalance` so the signed amount lands in the column.

### Optimistic update logic
- Insert goes to Supabase first; on success the returned row (with joined `category/account/to_account`) is added via `useTransactionStore.addTransaction` (line 301), which prepends to the in-memory list. **No optimistic write before the network call** — the UI shows a spinner via `setSaving(true)`. So this is server-confirmed only.
- `updateTransaction` mutates the same store on edit success (line 288).
- `revalidateForEntity('transaction' | 'sinking_fund_payment' | 'adjustment')` triggers a `bumpMutation()` on the store, which causes `useDashboardData` and others to refetch derived totals.

### Goal fields
- `goal_id` (transfer-only) is set in the **goal contribution flow**, not in the transaction sheet — see `contributeToGoal` in `src/lib/goals.ts:82-110` (Section 13).
- `paid_from_goal_id` is set in transaction-sheet only when `txType==='expense'` and the user expanded "Paid from a target?" and selected a target-type goal (lines 752-883).

### `generated_from_recurring`
Set only by `src/lib/recurring.ts` — never by the transaction sheet. See Section 12.

### Insert path
**Direct client-side `supabase.from('transactions').insert(...)`** in the sheet. There is no server action / API route for transaction inserts.

### Post-insert side effects (lines 300-359)
1. `hapticMedium()` + add to store + `analytics.transactionLogged({ type, bucket })`.
2. `updateLoggingStreak(supabase, user.id)` → updates `setStreaks`, may show milestone toast, may award `'logging_streak_7_days'` momentum.
3. `checkAndUnlockBadges(supabase, user.id, 'streak_updated')` → enqueues celebrations.
4. `awardMomentum(supabase, user.id, 'transaction_logged')` (+2 points) → may show TierUpModal.
5. `checkAndUnlockBadges(supabase, user.id, 'transaction_logged')` (`first_steps`, `century_club`).
6. If `paid_from_goal_id`: refetch goal balance; if goal complete (contributions and totalPaid both ≥ target), set `completed_at`, show `<NextCycleModal>`, award `goal_completed` momentum, check `goal_completed` badges.
7. Toast "Income logged!" / "Transfer recorded!" / "Expense logged!" depending on type.
8. `MomentumFloatContainer` floats the points number visually.
9. `TierUpModal` opens on tier change.

Reconcile post-side-effects (lines 405-409): toast, `awardMomentum('account_reconciled')` (+3 points), `checkAndUnlockBadges('account_reconciled')`.

---

## 4. Transactions list

### Route
`src/app/(app)/transactions/page.tsx` (`TransactionsContent` rendered inside a Suspense fallback).

### Default filter/sort
- `period = 'cycle'` (current budget cycle) — read from `?period=`, default `'cycle'`.
- `sort = 'date-desc'` (newest first).
- `type/account/category/bucket = 'all'`, `amtMin/amtMax = ''`.
- All filters live in the URL via `?period&type&account&category&bucket&sort&amtMin&amtMax` (lines 51-58, written by `updateParam`).

### Period tabs (lines 30-36)
`This Month` (cycle), `Last Month` (prev_cycle), `30 Days`, `90 Days`, `All`. Period → date range in `getDateRange` (lines 70-96), using `getCycleForDate(today, profile.cycle_start_day)` for the cycle-relative ranges.

### Available filters
- **Type** (line 283): `all/expense/income/transfer/adjustment`
- **Account**: any of `accounts` plus "All accounts". Query uses `or(account_id.eq.X,to_account_id.eq.X)` to catch transfers (line 132).
- **Category**: any of non-archived categories.
- **Bucket** (lines 339): `needs/wants/savings` — applied client-side post-fetch via `t.category?.bucket?.name === urlBucket`.
- **Amount range**: `gte/lte` on `amount`.
- **Sort**: `date-desc/date-asc/amount-desc/amount-asc`.

### Grouping
Grouped by `transaction_date` (date string, day-level). `formatTransactionDate(date)` for the section header and `MMM d, yyyy` as a sub-label (lines 480-484). 50 per page; `Load more` button when `hasMore` (line 495).

### Swipe / long-press
None. Each row's overflow ⋯ button reveals a `DropdownMenu` with `Edit` and `Delete` (`src/components/transactions/transaction-item.tsx:140-166`).

### Edit flow
Inline. `Edit` calls `useTransactionStore.openLogSheet(txn)` which reopens the same `TransactionSheet` with `editingTransaction` prefilled (lines 119-145 of the sheet).

### Delete flow
`<Dialog>` confirmation (`transaction-item.tsx:172-200`). On confirm: `supabase.from('transactions').delete().eq('id', txn.id)` → `removeTransaction(id)` (optimistic only after the row reappears as deleted) → `revalidateForEntity('transaction')` → toast.

### Pagination
Manual `Load more` button + `range(page * 50, (page+1) * 50 - 1)`. `count: 'exact'` query lets it know if there are more.

---

## 5. Cycle math

### `getCycleForDate` — full body
`src/lib/cycle.ts:23-55`:
```ts
export function getCycleForDate(date: Date, cycleStartDay: number): CycleWindow {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  let cycleStart: Date;
  if (day >= cycleStartDay) {
    cycleStart = new Date(year, month, cycleStartDay);
  } else {
    // Previous calendar month — clamp to last day if that month is shorter
    const prevMonthDate = new Date(year, month - 1, 1);
    const daysInPrev = new Date(year, month, 0).getDate();
    cycleStart = new Date(
      prevMonthDate.getFullYear(),
      prevMonthDate.getMonth(),
      Math.min(cycleStartDay, daysInPrev)
    );
  }

  const cycleEnd = addDays(addMonths(cycleStart, 1), -1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrent = today >= cycleStart && today <= cycleEnd;

  return {
    start: cycleStart,
    end: cycleEnd,
    label: buildLabel(cycleStart, cycleEnd, cycleStartDay),
    isCurrent,
    startDateStr: format(cycleStart, 'yyyy-MM-dd'),
  };
}
```
`buildLabel` (lines 100-105): when `cycleStartDay === 1`, `format(start, 'MMMM yyyy')`; otherwise `MMM d – MMM d`.

`getCycleAtOffset(refDate, day, offset)` shifts the start date by `offset` months and rebuilds via `getCycleFromStartDate`. `parseCycleParam` accepts `yyyy-MM-dd`. `cycle_start_day` is constrained to `1..28` in the schema to avoid Feb edge cases — month-length clamping is only used when reconstructing prior cycles.

### "received" definition
`src/hooks/use-dashboard-data.ts:102-104`: `totalReceived = sum(transactions where type='income' and transaction_date in [cycleStart, cycleEnd])`. Income is **only** computed from logged `transactions`, not from `income_sources.amount`. Income sources are only used to seed the budget split (see "expected" below).

### "spent" definition
- `totalSpentThisMonth` (line 97): sum of *all* `type='expense'` (includes those flagged `paid_from_goal_id`).
- `totalSpentActual` (lines 100-101): sum of expenses where `paid_from_goal_id IS NULL` — the value used for `cycleNet` and bucket math.
- Adjustments are **excluded** from both numbers (only `expense` rows match the filter).

### "expected" definition
`monthlyIncome` for bucket limits (`use-dashboard-data.ts:115-116`):
```ts
const monthlyIncome = incomeSources.length > 0
  ? totalMonthlyIncome(incomeSources)   // sum of active sources, normalized monthly
  : profile.monthly_income;             // fallback (set on onboarding)
```
`totalMonthlyIncome` (lines 15-19 of `income.ts`): sums `calculateMonthlyEquivalent(amount, frequency)` over `is_active` sources only.

### `cycleNet` formula
`use-dashboard-data.ts:105`: `cycleNet = totalReceived - totalSpentActual`. So sinking-fund-paid expenses are excluded from the net.

### Supabase RPCs / views
**None.** All cycle math is client-side via the helpers above. No `create function` (other than `update_updated_at`, `handle_new_user`, `cleanup_old_digests`) and no `create view` in any migration.

### "Discipline math vs balance math"
The codebase doesn't use that exact phrase, but the distinction is enforced in two places:
- **Discipline math** (i.e. bucket allocation): handled by `bucketSpend` / `bucketLimits` in `use-dashboard-data.ts:114-156`. It excludes `paid_from_goal_id` expenses ("their cost was already accounted for by the monthly contribution to the goal"), and adds *transfers* to savings/investment accounts and goal contributions to `bucketSpend.savings` (lines 137-156).
- **Balance math** (account ledger): `computeAccountBalances` in `src/lib/accounts.ts:19-49`. It sums `opening_balance + income - expense + transfers ± adjustments` per account. **All** expenses count here, including sinking-fund-paid ones — adjustments only affect balance, not buckets.

The only "savings"-bucket counting rules sit in `use-dashboard-data.ts:135-156`:
1. Any transfer with `goal_id` set → counted as savings spend.
2. Transfer to a savings/investment account that did *not* originate from another savings/investment account → counted (filters out internal shuffles).

---

## 6. Buckets

### Spent-per-bucket function
`src/hooks/use-dashboard-data.ts:114-156` (within `fetchData`). No dedicated extracted function. Body excerpt:

```ts
const bucketSpend: Record<BucketName, number> = { needs: 0, wants: 0, savings: 0 };
const bucketLimits: Record<BucketName, number> = {
  needs:   (monthlyIncome * profile.needs_percent)   / 100,
  wants:   (monthlyIncome * profile.wants_percent)   / 100,
  savings: (monthlyIncome * profile.savings_percent) / 100,
};

const SAVINGS_ACCOUNT_TYPES = new Set(['savings', 'investment']);
const bucketMap = new Map((buckets ?? []).map((b) => [b.id, b.name as BucketName]));

for (const txn of bucketExpenses) {           // bucketExpenses = expenses w/o paid_from_goal_id
  const bucketId = txn.category?.bucket_id;
  if (bucketId) {
    const bName = bucketMap.get(bucketId);
    if (bName) bucketSpend[bName] += txn.amount;
  }
}

for (const txn of cycleTxnList) {
  if (txn.type !== 'transfer') continue;
  if (txn.goal_id) { bucketSpend.savings += txn.amount; continue; }
  const toType = txn.to_account?.type;
  const fromType = txn.account?.type;
  if (toType && SAVINGS_ACCOUNT_TYPES.has(toType) &&
      (!fromType || !SAVINGS_ACCOUNT_TYPES.has(fromType))) {
    bucketSpend.savings += txn.amount;
  }
}
```

### Needs/Wants counting
- Any expense where `category.bucket_id` resolves to `needs` or `wants` (via `bucketMap`) and `paid_from_goal_id IS NULL`.
- Transfers and adjustments never affect Needs or Wants.

### Savings counting
- Goal contributions (any transfer with `goal_id`) — full amount.
- Transfers TO an account whose `type ∈ {savings, investment}`, where source account is NOT also savings/investment (rule 2 above).
- Notably: there is no longer a "Savings" expense category in the seed (0029 explicitly removed it). If a user keeps an old expense category mapped to the savings bucket, it would also be counted (the loop matches by `bucket_id`).

### Dashboard component
`src/components/dashboard/bucket-strip.tsx`. Renders a `<Link href="/buckets">` card with three rows (one per bucket). Each row: label, `format(spent) of format(limit)`, thin progress bar at `min(100, spent/limit * 100)` colored from `BUCKET_CONFIG[bucket].color`.

### Tap on a bucket card
The strip is a single Link to `/buckets`, **not** per-bucket — but `BucketsPage` (`src/app/(app)/buckets/page.tsx`) opens with the **Needs** tab active by default (line 112). Tabs let the user switch buckets in-page; tapping doesn't pre-select.

### Allocation calculation
`use-dashboard-data.ts:117-121`:
```ts
const bucketLimits = {
  needs:   monthlyIncome * profile.needs_percent   / 100,
  wants:   monthlyIncome * profile.wants_percent   / 100,
  savings: monthlyIncome * profile.savings_percent / 100,
};
```

### Locked spec defaults (45/15/40 — confirmed wrong; product-spec defaults are 50/30/20)
- DB defaults: `0001:7-9` → `needs=50, wants=30, future=20` (later renamed to savings).
- App defaults: `src/lib/constants.ts:28-32`: `needs:50, wants:30, savings:20`.
- Onboarding bucket preview (lines 603-612 of onboarding-modal): same.
- The `45/15/40` ratio referenced in the audit prompt does not appear anywhere in the current codebase.

### Rounding / display rules
- `useCurrency().format(value)` for primary money displays (defined in `src/hooks/use-currency.ts`, calls into `src/lib/format/currency.ts`). Standard locale-formatted, includes the user's currency symbol.
- `formatCurrencyCompact` exists for small spaces — used in onboarding (line 22 of modal).
- Pcts on bucket bars are clamped to `Math.min(100, ...)` (no overshoot indicator on the strip; the `/buckets` page has the same clamp at line 170).

---

## 7. Categories

### Source
- Seeded by `handle_new_user()` trigger on signup. The latest version (migration 0030) seeds 14 default expense categories (Needs/Wants only — no Savings categories in the seed since 0029) plus 7 income categories (Salary, Side Hustle, Gift, Refund, Loan Repayment, Sale, Bonus). Adjustment category is added by 0004 to existing users but the *latest* trigger version (0030) **does not include** the `Balance Adjustment` insert. Production users created after 0030 may not have an adjustment category. (This is part of an apparent migration regression where 0030 dropped the adjustment seeding from earlier 0013.)
- Users can add/edit/archive via Settings → Categories (`src/app/(app)/settings/page.tsx:362-548`, `category-modal.tsx`).

### Relationship to buckets
- Migration 0004 enforces: `expense → bucket_id NOT NULL`; non-expense → `bucket_id IS NULL` (CHECK `category_bucket_consistency`).
- App fallback used in places where `category_type` is missing: treat as `expense` if `bucket_id` is set, else `income` (`src/app/(app)/transactions/page.tsx:199`, settings page lines 177-183, etc.).

### Default categories on signup
See Section 1 → `handle_new_user()` body. Final shape from migration 0030. Adjustment seeding is in 0004's body but not in 0030's rewrite — see "Things I might have missed".

### Income vs expense in UI
- Add Transaction sheet uses `IncomeCategoryPicker` for `type='income'` (with `INCOME_PRESETS` + custom-emoji "other"). For expenses, `CategoryGrid` filters to `c.category_type === 'expense' || (no type && bucket_id != null)`.
- Settings groups categories into 4 sections: `Needs`, `Wants`, `Savings`, "Spending (no bucket)", `Income`, `Adjustments`, plus a collapsed Archived section.
- Category modal (`src/components/settings/category-modal.tsx`) — UNKNOWN if it sets `category_type`; full body not read but it's the only way users add custom ones.

---

## 8. Accounts

### Account types
- DB enum `accounts.type` (column `type`) per `0003`: `bank, momo, cash, savings, investment, other`.
- Mirrored in TS: `AccountType = 'bank' | 'momo' | 'cash' | 'savings' | 'investment' | 'other'` (`src/types/account.ts:1`).
- Migrations 0029/0030 reference an additional `account_type` column with values `general | wallet | cash | savings | investment | other`, used in trigger seed only. The column has no migration. The app code never reads it.

### Behavior driven by `type`
- Display: `ACCOUNT_TYPE_CONFIG` (`src/lib/accounts.ts:3-10`) maps each type to `{ label, color, emoji }` (e.g. `bank → 🏦 #00D9A3`, `momo → 📱 #FBBF24`, `savings → 🐷 #60A5FA`).
- Bucket math: only `savings` and `investment` are treated as "savings sinks" for transfer-to-savings counting (`SAVINGS_ACCOUNT_TYPES = new Set(['savings', 'investment'])`).
- `is_default`: enforced unique per user via partial index. Default account preselected as the source on the FAB/transaction sheet.

### Default accounts on signup (migration 0030 trigger)
1. `Bank` (type=`bank`, account_type=`general`)
2. `Hubtel wallet` (type=`momo`, account_type=`wallet`)
3. `MTN MoMo Wallet` (type=`momo`, account_type=`wallet`)
4. `Savings` (type=`savings`, account_type=`savings`)

(The trigger does not call `is_default = true` on any of them, so newly-onboarded users have NO default account from 0030 alone — earlier migrations did set Bank as default.)

### Accounts list component
`src/app/(app)/accounts/page.tsx`. Renders:
- "Total balance" card (sums `computeAccountBalances` across active accounts).
- Two intro hints: `accounts_intro` (when all `opening_balance === 0`) and `accounts_reconcile_reminder`.
- Per-account card: emoji, name, default star, balance in account color, three icon buttons (Reconcile via `openReconcileSheet`, Edit, Delete).
- `AccountModal` for add/edit (`src/components/accounts/account-modal.tsx`).
- Custom delete confirmation that allows reassigning transactions to another account (lines 247-291).

### Transfer flow
Transfers are created via the transaction sheet's `transfer` mode (`step = 'accounts'`) — selects a `from` account, then a `to` account from the remainder. Inserts a single row `type='transfer'` with both `account_id` and `to_account_id` set.

### Reconciliation logic
`TransactionSheet`'s `'reconcile'` step:
- User enters their actual current balance in selected account.
- App computes `reconcileDiff = actual - sikaBalance`.
- Inserts a transaction `type='adjustment'`, `category_id=null`, `to_account_id=null`, `amount=reconcileDiff` (signed).
- Adjustments are excluded from bucket math but applied to balance via `computeAccountBalances`.
- Awards `account_reconciled` momentum (+3 pts) and checks badges.
- Triggered also from a "scale" icon on each account card, which calls `useTransactionStore.openReconcileSheet({ accountId, sikaBalance })`.

---

## 9. Sika Score / Streaks / Momentum / Badges

### Sika Score
There is **no surface called "Sika Score" in the current code.** The closest concepts are:
- **Momentum** (`total_points` + tier).
- **Health Score** — `src/lib/health-score.ts` exists and is referenced by `useAuthStore.healthScore` and the dashboard's `<HealthRow />`. Did not deep-read; UNKNOWN exact computation.

### Streaks
Two streaks per user, stored in `streaks`:
- **Logging streak** (daily, all-types). Updated by `updateLoggingStreak()` on every user-initiated transaction insert. Counts gap=1 as continuation; gap≥2 consumes freezes (one per missed day, max 2 banked); else resets to 1. Earns a freeze every 10 days. Milestones at 7/14/30/60/100 days.
- **Savings streak** (weekly, Mon-Sun). Updated by `updateSavingsStreak()` on each goal contribution. Same freeze semantics in weeks. Milestones at 4/12/26/52 weeks.
- Passive break detection: `checkStreakHealth()` runs on dashboard load via `useStreakHealth` hook; if a gap exceeds banked freezes, marks `logging_current = 0` / `savings_current = 0` and surfaces a "compassionate" toast once.

What counts as a streak event:
- Logging: any user-initiated transaction insert (NOT recurring auto-generated). See `transaction-sheet.tsx:308-322`.
- Savings: goal contribution via `contributeToGoal` → `updateSavingsStreak` (`contribute-modal.tsx:80`).

### Momentum
Each user has one `momentum` row + many `momentum_events`. Score is monotonic; tier is derived from thresholds (`bronze 0`, `silver 500`, `gold 2000`, `platinum 5000`, `diamond 10000`).

What gets logged (MOMENTUM_AMOUNTS, `src/types/momentum.ts:31-39`):
| event_type | points |
| --- | --- |
| transaction_logged | 2 |
| transaction_logged_via_nudge | 5 |
| goal_contribution | 10 |
| account_reconciled | 3 |
| logging_streak_7_days | 50 |
| goal_completed | 100 |
| bucket_within_limit_full_month | 75 |

Writers of `momentum_events` rows: `src/lib/momentum.ts:82` (the only write) — called by `awardMomentum(supabase, userId, eventType)`. Callers:
- `transaction-sheet.tsx`: on transaction insert (`'transaction_logged'`); on `'logging_streak_7_days'` milestone hit; on goal completion (`'goal_completed'`); on reconcile (`'account_reconciled'`).
- `contribute-modal.tsx`: on goal contribution (`'goal_contribution'`).
- `transaction_logged_via_nudge` and `bucket_within_limit_full_month` are **defined but never written** (no callsites).

Tier logic in `src/lib/momentum.ts:46-102`. `awardMomentum` upserts the momentum row, inserts an event row, and returns `{ momentum, points_awarded, tier_changed, new_tier, previous_tier }`. The dashboard surfaces float animations + `TierUpModal`.

### Badges
- 8 badges in `badges` table, seeded once. `user_badges` is the join.
- `TRIGGER_BADGES` map (`src/lib/badges.ts:15-22`) lists which badges can be unlocked per trigger event.
- Conditions checked client-side (sequential queries) via `checkBadgeCondition`. Examples:
  - `first_steps`: ≥1 transaction.
  - `century_club`: ≥100 transactions.
  - `week_warrior`: streak `logging_current ≥ 7`.
  - `consistent_saver`: streak `savings_current ≥ 4`.
  - `month_of_discipline`: streak `logging_current ≥ 30`.
  - `goal_getter`: ≥1 target-type goal with `completed_at`.
  - `seeker`: ≥5 target-type goals with `completed_at`.
  - `safety_net`: net Life Savings perpetual goal balance ≥ 3× rolling-3-cycle average Needs spend (case-insensitive name match `'life savings'`).
- Unlocked rows are inserted with `celebration_shown=false`; the `<BadgeCelebrationHost />` queue plays them via `<BadgeUnlockModal>`. `markCelebrationShown` flips the flag.

### Dashboard surface for momentum
- `src/components/dashboard/momentum-strip.tsx` — tier icon + name + total points + thin progress bar to next tier + "X pts to {nextTier}".
- Tap → `/momentum` (`src/app/(app)/momentum/page.tsx`) — full tier card, recent 30 events, tier ladder.
- `MomentumFloatContainer` floats `+N` chips on each award.
- `TierUpModal` appears on tier change.

### Levels/tiers vs numeric score
Both. Score is the underlying numeric, tier (`bronze..diamond`) is derived. Tier displays in the dashboard strip; the numeric score shows in the `/momentum` page.

---

## 10. Should Sika Buy

### Route / component
- No dedicated route. Triggered from `<ShouldIBuyButton />` (`src/components/decision/should-i-buy-button.tsx`) rendered on the dashboard.
- Sheet: `src/components/decision/decision-sheet.tsx` (336 lines). Phases: `input → loading → result | error`.

### User inputs
- `item_name` (text, 1-120 chars).
- `amount` (number > 0, ≤ 10,000,000).
- `bucket` (`needs|wants|savings`).
- `urgency` (`now|can_wait|not_sure` — optional).

### Algorithm
Calls `POST /api/decisions/ask` (`src/app/api/decisions/ask/route.ts`):
1. Zod-validate input.
2. Auth via Supabase server client.
3. `computeDecisionContext(serviceClient, userId, input)` builds a context object — see `src/lib/decisions/compute-decision-context.ts` (UNKNOWN exact contents but invoked from this route).
4. `generateDecision(ctx)` (`src/lib/decisions/generate-decision.ts:9-35`) calls Anthropic:
   - Model: `claude-sonnet-4-6`.
   - System prompt: `DECISION_VOICE_PROMPT` from `src/lib/ai/decision-voice-prompt.ts`.
   - max_tokens: 1024.
   - Strips JSON code fences and parses.
   - Validates: requires `verdict`, `verdict_line`, `reasoning`; rejects verdict_line > 12 words.
5. Inserts the row into `purchase_decisions` and returns `{ id, decision }`.

### What's written to `purchase_decisions`
`{ user_id, item_name, amount, bucket, urgency, decision_data: <DecisionData JSON>, outcome: 'undecided' (default) }` — see route lines 30-41.

### How it surfaces back
- One-shot. The result phase shows: verdict banner, "the math" (bucket impact, optional goal impact, optional opportunity_cost), reasoning, and a two-button row (`Nah, skip` / `I bought it`).
- Outcome reported to `POST /api/decisions/outcome` (best-effort, errors silently). On `bought`, navigates to `/transactions`.
- No history view in Phase 1.

### AI integration
- Anthropic only. SDK: `@anthropic-ai/sdk`. Used in 3 places: `decisions/generate-decision.ts`, `insights/generate-insight.ts`, `monthly/generate-recap.ts`.
- API key: `process.env.ANTHROPIC_API_KEY`.

---

## 11. Daily insights and Sika Daily

### `daily_insights` (per-user AI-generated)
- **Cron**: `src/app/api/cron/insights-generate/route.ts`. Auth header `Bearer ${CRON_SECRET}`. Iterates all profiles; if no insight row for today: build `computeInsightContext(supabase, userId, now)`, call `generateInsight(ctx)` (`src/lib/insights/generate-insight.ts`), insert into `daily_insights`, then `sendPushToUser(...)` with the headline as the push title and the body as text. Schedule itself: **UNKNOWN** — `vercel.json` is empty, so cron schedules must be configured via Vercel dashboard or have not been migrated yet. The audit prompt mentions "4am insight" but no schedule appears in the repo.
- **Display**: `<InsightStrip />` on the dashboard (`src/components/dashboard/insight-strip.tsx`). Maps `insight.icon` to a Lucide component, applies accent color (green/amber/red/blue/neutral). Has dismiss button → `POST /api/insights/dismiss` → sets `dismissed_at` on the row.
- **Manual trigger**: `POST /api/insights/trigger-for-me` (likely for testing — UNKNOWN body).
- **Display fetch**: dashboard fetches via `supabase.from('daily_insights').select('*').eq('user_id', user.id).eq('insight_date', today).maybeSingle()` (also `GET /api/insights/today`).

### `sika_daily_digests` (shared news digest)
- **Cron**: `src/app/api/cron/generate-digest/route.ts` → dynamic import `generateDigest()` from `src/lib/daily/generate-digest.ts`.
- **Pipeline**: `fetchRssSources(supabase)` → `fetchAllCandidates(sources)` → `filterStories(candidates)` → `summarizeStory(story)` (the AI summarization step, presumed Anthropic-based — UNKNOWN, full body not read) → insert into `sika_daily_digests` with `stories: jsonb`.
- Fallback: if pipeline fails or yields no stories, inserts a single placeholder ("Quiet day in the markets") with `is_fallback=true`.
- **Display**: `<SikaDailyBanner />` on the dashboard (links to `/daily`). The `/daily` page (`src/app/(app)/daily/page.tsx`) renders one `<StoryCard>` per story (image, category pill, emoji, title, summary, source). Auto-marks-as-read after 10 seconds (`AUTO_READ_DELAY_MS`).
- **RSS handling**: `src/lib/daily/fetch-rss.ts` — UNKNOWN parser used (would need a library like `rss-parser`); fetches all 12 seeded sources from `sika_daily_sources`.
- **Read tracking**: `user_daily_reads (user_id, digest_date)` — inserted when user views the page.
- **Cleanup**: `cleanup_old_digests()` PL/pgSQL function keeps the latest 2; not auto-called from any migration trigger — would need to be invoked manually or by a separate cron.

---

## 12. Recurring transactions

### Expense-only enforcement
- DB CHECK `recurring_transactions.type IN ('expense', 'income')` actually allows both — so the schema is permissive.
- The UI is the gate: `src/app/(app)/recurring/page.tsx:31-42` only ships `'expense'` templates with the comment:
  > "Recurring templates are expense-only by design. Income lives in income_sources… so it doesn't get double-modeled."
- `RecurringModal` (`src/components/recurring/recurring-modal.tsx`) — UNKNOWN if it allows income, but the page filters `expense` for the main tab and `paused` for paused.

### Auto-log flow
- Triggered client-side, once per session, from `useDashboardData` (`src/hooks/use-dashboard-data.ts:25-32`):
  ```ts
  generateDueTransactions(supabase, user.id).then(({ pending }) => {
    setPendingRecurring(pending);
  });
  ```
- `generateDueTransactions` (`src/lib/recurring.ts:161-198`):
  - For each active+unpaused recurring rule, computes all missed dates from `last_generated_date+1` (or `start_date`) up to today via repeated `getNextDueDate`.
  - If `auto_log=true`: inserts one `transactions` row per missed date with `generated_from_recurring=rec.id`. Then bumps `last_generated_date`.
  - If `auto_log=false`: returned in `pending[]` for the dashboard nudge UI to ask the user.
- Auto-generated transactions DO NOT count toward the logging streak (the streak is only updated from `transaction-sheet.tsx`'s manual save path).

### Detail page UI
`src/app/(app)/recurring/[id]/page.tsx` — fetches the recurring rule (with joined account/category), shows current-instance status (already handled this period?), and offers `Log` (calls `confirmPendingRecurring`) / `Skip` (calls `skipPendingRecurring`).

### Per-instance log/skip UI
- On the dashboard: `<PendingRecurringCard>` for each pending rule — "Log" / "Skip".
- On `/recurring/[id]`: same logic via `confirmPendingRecurring` and `skipPendingRecurring`.
- `getCurrentInstancePeriod(rec, today)` defines what "this period" means per frequency (`recurring.ts:251-285`): monthly = schedule_day → schedule_day-1 of next month; weekly/biweekly = ISO week (Mon-Sun) of today; yearly = calendar year; daily = today.
- `isHandledThisInstance` checks whether `last_generated_date` is inside that period.

---

## 13. Goals

### Routes
- List: `src/app/(app)/goals/page.tsx`.
- Detail: `src/app/(app)/goals/[id]/page.tsx`.

### Create flow
- `<GoalModal>` (`src/components/goals/goal-modal.tsx`) — UNKNOWN form schema details. Fields per `goals` table: `name` (1-80), `description`, `icon`, `color` (from `GOAL_COLORS` 6-color palette), `goal_type` (`target` or `perpetual`), `target_amount`, `deadline`, `funding_account_id`, `priority` (1-10).
- Suggestion pills on empty state: "Life Savings" (perpetual), "Emergency Fund / New Car / Vacation" (target).

### Contribute flow
`<ContributeModal>` (`src/components/goals/contribute-modal.tsx`) → `contributeToGoal` (`src/lib/goals.ts:82-110`):
```ts
await supabase.from('transactions').insert({
  user_id, account_id: fromAccountId,
  to_account_id: goal.funding_account_id,
  amount, type: 'transfer',
  note: note || `Contribution to ${goal.name}`,
  transaction_date, goal_id: goal.id,
});
// If target goal and threshold met:
await supabase.from('goals').update({ completed_at: now }).eq('id', goal.id);
```
So a contribution **is a transfer** with `type='transfer'`, `goal_id` set, `to_account_id` = the goal's funding account. Bucket math counts these in the savings bucket.

Post-side-effects: `revalidateForEntity('goal_contribution')`, `updateSavingsStreak`, `awardMomentum('goal_contribution')` (+10), `checkAndUnlockBadges('contribution_made')`.

### Progress bar calculation
`computeGoalProgress` (`src/lib/goals.ts:30-71`):
- `currentAmount` = `fetchGoalAmounts(goalId).net` = `Σ contributions − Σ payments`.
  - Contributions: `transactions where goal_id = X and type = 'transfer'`.
  - Payments: `transactions where paid_from_goal_id = X and type = 'expense'`.
- For target-type only: `progress_percent = min(100, current/target * 100)`, `days_remaining = max(0, daysTo(deadline))`, `required_monthly_pace = remaining / (days_remaining/30)`, `required_weekly_pace`, `is_on_track` (compares actual vs linear-by-elapsed-time).
- For perpetual goals: all of the above stay null.

### Goal completion side effects
- Auto-complete on contribute (`contributeToGoal`): if target reached, set `completed_at`.
- Auto-complete on payment (transaction-sheet `paid_from_goal_id` path): if both `contributions ≥ target` AND `totalPaid ≥ target`, set `completed_at` and open `<NextCycleModal>`. Awards `goal_completed` momentum (+100), checks `goal_completed` badges.
- "Next cycle" pattern (`createNextCycle`, `suggestNextCycleName`, `suggestNextDeadline`) creates a follow-on target goal linked via `previous_goal_id` and `cycle_count++`.

---

## 14. Settings

All under `src/app/(app)/settings/`:
- `page.tsx` — main settings (tabs/sections rendered as sequential cards).
- `currency/page.tsx` — currency picker route (deeplinked from main settings).

Server endpoints under `src/app/api/profile/`:
- `currency/route.ts` — write currency change.
- `theme/route.ts` — write theme.
- `haptics/route.ts` — write haptics_enabled.
- `delete/route.ts` — DELETE account (cascades via FK).

### Sub-section summary (each writes the table indicated)
| Section | Component | Tables written |
| --- | --- | --- |
| Profile (full_name) | `src/app/(auth)/signup/page.tsx` is the only place name is captured during onboarding; settings page does not surface a name editor. UNKNOWN if name can be edited later. | `profiles` (signup only) |
| Income sources | `<IncomeSourcesSection />` | `income_sources` (CRUD) — also bumps `profiles.monthly_income` indirectly via re-derived total |
| Currency | "/settings/currency" route → `POST /api/profile/currency` | `profiles.currency` |
| Theme | `<AppearanceSection />` → `POST /api/profile/theme` | `profiles.theme_preference` |
| Bucket %s | inline form | `profiles.{needs,wants,savings}_percent` (must sum to 100; `cycle_start_day` 1-28) |
| Card style | `<CardThemePicker />` | `profiles.card_theme` (UNKNOWN endpoint — UNKNOWN if it goes through `/api/profile/...` or direct) |
| Haptics | `<HapticsSection />` → `POST /api/profile/haptics` | `profiles.haptics_enabled` |
| Notifications (push toggle) | `<NotificationSettings />` (gated by `experimental_push_notifications`) | `push_subscriptions` (insert/delete) |
| Categories | `<CategoryModal />` | `categories` (insert/update/archive) |
| Hints reset | inline `handleResetHints` | `dismissed_hints` (delete-by-user_id) |
| Sign out | `supabase.auth.signOut()` + `useAuthStore.reset()` | none |
| Delete account | `<DangerZone />` → `DELETE /api/profile/delete` | All cascades; `momentum_events` deleted explicitly per route line 22 |
| Privacy | link to `/privacy` static page | none |

### Notes
- "Bucket %s" form requires sum=100 (Zod refine, line 50-53 of settings page).
- `cycle_start_day` is editable on the settings form.
- The "set your real balances" hint (banner) is shown on `/accounts` only when all opening balances are zero.

---

## 15. Push notifications

### VAPID setup
- Public key: `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` (used in `src/lib/push-subscriptions.ts:3`).
- Server-side key: presumably in `src/lib/push-sender.ts` (UNKNOWN — full body not read but it's the only sender callsite) using `web-push` or similar. The package was added in commit `ebfc04f` per the audit-prompt context note.

### Subscribe endpoint
Browser-side via service worker, then `supabase.from('push_subscriptions').upsert(...)` (`src/lib/push-subscriptions.ts:55-65`). Best-effort POST to `/api/push/welcome` to fire a "welcome" notification (so user immediately sees one).

### Cron jobs that send notifications
1. **`/api/cron/income-reminders`** — Iterates all active `income_sources` grouped by user. Calls `getDueIncomeNudges` per user (matches today vs `expected_day` for `monthly/weekly/biweekly`). For each user with due nudges, sends one push:
   - 1 source → `"<name> expected today"` / `"Did you receive your <name>? Tap to confirm."`
   - >1 → `"N income sources expected today"` / `"<names> — tap to log them."`
   - URL `/dashboard`, tag `income-reminder`.
2. **`/api/cron/insights-generate`** — Generates today's insight and sends push with headline as title, body as text, URL `/dashboard`, tag `daily-insight`.
3. **`/api/cron/generate-digest`** — Builds shared digest. Doesn't send push (display banner only).
4. **`/api/cron/monthly-generate`** — On cycle-end day per user, generates a `monthly_recaps` row. Doesn't send push (UI banner-only).

All four routes require header `Bearer ${process.env.CRON_SECRET}`. Schedules for these crons are UNKNOWN — `vercel.json` is empty (`{}`). The schedule must live outside the repo (Vercel dashboard) or has not been added yet.

### Welcome push
`/api/push/welcome` — fired immediately after subscribe. Body and tag UNKNOWN (route file not read).

---

## 16. Analytics + feature flags

### PostHog setup
`src/lib/analytics/posthog-provider.tsx`. `posthog.init` runs on the client only with:
- `api_host: NEXT_PUBLIC_POSTHOG_HOST`
- `defaults: '2026-01-30'`
- `person_profiles: 'identified_only'`
- `capture_pageview: false` (manual `$pageview` on every pathname change)
- `capture_pageleave: true`
- `session_recording`: masks all inputs, masks `[data-private]`, blocks `[data-private-full]` and `.sika-sensitive`.
- `autocapture: false`, `enable_heatmaps: false`.
- Bootstraps with empty feature flags; reloads after init.

### Analytics module
`src/lib/analytics/identify.ts:18-38`. Events:
- `signed_up` (no props)
- `onboarding_completed` (`{ stepsCompleted }`)
- `transaction_logged` (`{ type: 'income'|'expense'|'transfer'|'adjustment', bucket?: string }`)
- `decision_opened`
- `decision_verdict_received` (`{ verdict }`)
- `monthly_recap_viewed`
- `monthly_recap_shared`

### Feature flags (callsites)
Searched `useFeatureFlag` / `useFeatureFlagVariant` in `src/`. Only one product flag in use:
- `experimental_push_notifications` — `src/components/settings/notification-settings.tsx:24`. Controls visibility of the push toggle UI. (No other flags currently in code.)

`useFeatureFlag` and `useFeatureFlagVariant` are defined in `src/hooks/use-feature-flag.ts`. Hooks subscribe via `posthog.onFeatureFlags`; default is `false` until PostHog loads.

---

## 17. State management (Zustand stores)

Two stores total.

### `src/stores/auth-store.ts`
**State:**
- `user: User | null` (Supabase user)
- `profile: Profile | null`
- `incomeSources: IncomeSource[]`
- `accounts: Account[]`
- `dismissedHints: string[]`, `hintsLoaded: boolean`
- `streaks: Streaks | null`
- `momentum: Momentum | null`
- `userBadges: UserBadge[]`
- `badgeCelebrationQueue: { userBadgeId, badgeId }[]`
- `healthScore: HealthScore | null`

**Actions:** simple setters for each piece, plus `addDismissedHint(id)`, `enqueueBadgeCelebrations(badges)` (de-dupes), `shiftBadgeCelebration()`, `reset()` (signout).

**Read from:** every authenticated screen — `useAuthStore` is consumed in dashboards, settings, transactions sheet, contribute modal, recurring modal, accounts page, badges/momentum/streaks pages, etc. Population happens in `AppShell` and `useProfile`/`useStreakHealth` hooks.

### `src/stores/transaction-store.ts`
**State:**
- `transactions: Transaction[]`
- `categories: Category[]`
- `dashboardStats: DashboardStats | null` (cycle-derived totals + bucket spend/limits + weeklySpend + accountBalances)
- `isLogSheetOpen: boolean`
- `editingTransaction: Transaction | null`
- `reconcileContext: { accountId, sikaBalance } | null`
- `mutationCount: number` (used as a refetch trigger across consumers)

**Actions:** setters for each list, `openLogSheet(txn?)`, `openReconcileSheet(ctx)`, `closeLogSheet()`, `addTransaction`, `updateTransaction`, `removeTransaction`, `bumpMutation`.

**Read from:** transaction sheet, transactions page, dashboard data hook, accounts page (mutation-triggered balance refresh), buckets page (read dashboardStats), settings page (categories), goals page.

(Nothing in the codebase persists either store across reloads — both reset on every page load. `localStorage` is not used for state hydration.)

---

## 18. Things I might have missed

### Migration regressions
- `handle_new_user()` is rewritten in 0001, 0003, 0004, 0013, 0029, 0030. The latest version (0030) **omits** the `Balance Adjustment` adjustment-category insert that was added in 0004, the `streaks` row insert that was added in 0013, and changes to the savings_id usage. New users from 0030 onwards may not get a streaks row or an adjustment category seeded. Code paths defend against this (`fetchOrCreateStreaks` lazy-creates, `IncomeCategoryPicker` allows custom names) but it's worth flagging.
- `accounts.account_type` column referenced in 0029/0030 trigger never has its `ALTER TABLE accounts ADD COLUMN account_type` migration. The trigger would fail on a fresh DB unless the column was hand-added. Application code never reads `account_type`.
- 0030's trigger does not call `is_default = true` on any seeded account; earlier triggers did. Newly-onboarded users may have no default account, which is what the FAB falls back to via `accounts[0]?.id`.

### Half-implemented / in-flux
- `MOMENTUM_AMOUNTS` defines `transaction_logged_via_nudge` (5 pts) and `bucket_within_limit_full_month` (75 pts). Both are **declared but never awarded** anywhere in `src/`. If iOS replicates Phase 1 it can ignore these or stub them.
- The income-nudge flow on the dashboard does NOT pass `'transaction_logged_via_nudge'` to `awardMomentum` — it uses the default `'transaction_logged'` value via the regular sheet path.
- TODO comments in `src/lib/income.ts:37-39` and `src/lib/cycle.ts:107` flag deferred work for income auto-log and income-streak (phase-1.5 / phase-2).
- `cleanup_old_digests()` is defined but not called from any cron route. Old digests will accumulate unless invoked manually.
- The `welcome push` flow exists (`/api/push/welcome`) but I did not read its body — UNKNOWN message content.
- The card_theme system has 7 themes (sankofa, gye_nyame, adinkrahene, copper, emerald, amber, obsidian) — these are heritage Adinkra-themed; not metallic as the migration history suggested.
- "Sika Score" doesn't exist as a label. The user-visible gamification surfaces are: Streaks, Momentum (with tier), Badges, Health Score (small row on dashboard, computation UNKNOWN).

### Cron schedules
`vercel.json` is `{}`. None of the cron schedules (insight 4am, digest 6am UTC per file comment, income reminders, monthly generate) are committed. Either the schedules are configured via the Vercel dashboard or this is a critical gap.

### Other observations
- `src/hooks/use-dashboard-data.ts` runs `generateDueTransactions` once per session via a `useRef` guard, then sets `pendingRecurring` for any `auto_log=false` rules. This is the only auto-log mechanism in Phase 1.
- The auth flow lives entirely in `src/app/(auth)/`: `signup`, `verify-email`, `login`. Phase 1 audit prompt marks Auth as DONE.
- `<AppShell />` provides global UI: `TopBar`, `BottomNav` (mobile) / `SideRail` (desktop), `<AddTransactionFab>`, `<TransactionSheet>`, `<BadgeCelebrationHost>`, etc.
- There is no offline support beyond service worker registration — the app expects network connectivity for every action.
- `monthly-share/share/[id]` is a public, non-auth route for sharing recap previews (used by the "Share" button on the monthly recap).
- The `formatCompact` helper from `useCurrency` is what powers compact dashboard amounts (e.g. "₵1.2k"). UNKNOWN exact thresholds without reading `src/lib/format/currency.ts`.

---

## 19. Summary table for iOS planning

| Feature | Files (count) | Tables touched | iOS Phase |
| --- | --- | --- | --- |
| Auth (login, signup, verify-email) | 4 (`src/app/(auth)/...`) | `auth.users`, `profiles` (via trigger) | DONE |
| Onboarding | 3 (`onboarding-modal.tsx`, `onboarding/pwa-install-guide.tsx`, dashboard trigger) | `profiles`, `income_sources` | 1A |
| Add Transaction | 8 (`transaction-sheet.tsx`, `amount-keypad.tsx`, `category-grid.tsx`, `income-category-picker.tsx`, `add-transaction-fab.tsx`, `insufficient-balance-sheet.tsx`, `transaction-store.ts`, `revalidation.ts`) | `transactions`, `streaks`, `momentum`, `momentum_events`, `user_badges`, optional `goals.completed_at` | 1B |
| Transactions list | 3 (`(app)/transactions/page.tsx`, `transaction-item.tsx`, `useTransactionStore`) | `transactions` (read/delete) | 1B |
| Cycle math | 3 (`lib/cycle.ts`, `use-dashboard-data.ts`, `lib/constants.ts`) | `transactions`, `profiles`, `budget_buckets`, `accounts` (read) | 1A |
| Buckets | 3 (`bucket-strip.tsx`, `(app)/buckets/page.tsx`, `lib/constants.ts`) | `budget_buckets`, `categories`, `transactions` (read) | 1A |
| Categories | 4 (`(app)/settings/page.tsx`, `category-modal.tsx`, `category-grid.tsx`, `income-category-picker.tsx`) | `categories` | 1A |
| Accounts | 4 (`(app)/accounts/page.tsx`, `account-modal.tsx`, `lib/accounts.ts`, `types/account.ts`) | `accounts`, `transactions` (reassign) | 1A |
| Sika Score / Streaks / Momentum / Badges | ~12 (`lib/streaks.ts`, `lib/momentum.ts`, `lib/badges.ts`, `momentum-strip.tsx`, `streak-strip.tsx`, `recent-badges.tsx`, `momentum-float.tsx`, `(app)/streaks/page.tsx`, `(app)/momentum/page.tsx`, `(app)/badges/page.tsx`, `badges/badge-celebration-host.tsx`, `badges/badge-unlock-modal.tsx`, `badges/badge-card.tsx`, `hooks/use-streaks.ts`) | `streaks`, `momentum`, `momentum_events`, `badges`, `user_badges` | 1C |
| Should Sika Buy | 4 (`should-i-buy-button.tsx`, `decision-sheet.tsx`, `lib/decisions/*`, `api/decisions/*`) + `ai/decision-voice-prompt.ts` | `purchase_decisions` (write/update outcome) | 2+ |
| Daily insights (per-user AI) | 5 (`api/cron/insights-generate`, `lib/insights/*`, `insight-strip.tsx`, `api/insights/*`, `ai/insight-voice-prompt.ts`) | `daily_insights` | 2+ |
| Sika Daily (shared digest) | 6 (`api/cron/generate-digest`, `lib/daily/*`, `sika-daily-banner.tsx`, `(app)/daily/page.tsx`) | `sika_daily_digests`, `sika_daily_sources`, `user_daily_reads` | 2+ |
| Recurring transactions | 4 (`(app)/recurring/page.tsx`, `(app)/recurring/[id]/page.tsx`, `recurring-modal.tsx`, `lib/recurring.ts`) | `recurring_transactions`, `transactions` (auto-insert) | 1C |
| Goals | 7 (`(app)/goals/page.tsx`, `(app)/goals/[id]/page.tsx`, `goal-modal.tsx`, `contribute-modal.tsx`, `next-cycle-modal.tsx`, `goals-widget.tsx`, `lib/goals.ts`) | `goals`, `transactions` (with `goal_id` / `paid_from_goal_id`) | 1C |
| Settings | 12+ (settings page + 8 setting components + 4 profile API routes) | `profiles`, `categories`, `income_sources`, `dismissed_hints`, `push_subscriptions` (delete account: cascades) | 1B |
| Push notifications | 4 (`lib/push-sender.ts`, `lib/push-subscriptions.ts`, `notification-settings.tsx`, `api/push/welcome`) + 4 cron routes | `push_subscriptions` | NEEDED-LATER (iOS will use APNs) |
| Analytics + feature flags | 3 (`lib/analytics/identify.ts`, `lib/analytics/posthog-provider.tsx`, `hooks/use-feature-flag.ts`) | none | 1A (just events; flags optional) |
| State management (Zustand stores) | 2 (`stores/auth-store.ts`, `stores/transaction-store.ts`) | none directly | 1A (translate to `@Observable` AppState + per-feature classes) |
| Monthly recap | 6 (`(app)/monthly/page.tsx`, `monthly-share/share/[id]`, `monthly-recap.tsx`, `sika-monthly-banner.tsx`, `lib/monthly/*`, `api/cron/monthly-generate`) | `monthly_recaps` | 2+ |
| PWA install / install JIT modal | 3 (`pwa-register.tsx`, `pwa-splash.tsx`, `onboarding/pwa-install-guide.tsx`) | none | NEEDED-LATER (iOS native equivalents differ entirely) |
| Hints / dismissals | 2 (`hint-card.tsx`, `lib/hints.ts`) | `dismissed_hints` | 1B |
| Dashboard composition | ~16 dashboard components | (read only) | 1A glue |

---
END OF AUDIT
