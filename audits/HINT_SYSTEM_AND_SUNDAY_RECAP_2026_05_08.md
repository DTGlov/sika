# Hint System + SundayRecapCard Audit — 2026-05-08

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Phase 4 implementation —
foundational HintCard + dismissed_hints integration + SundayRecapCard
as first concrete consumer.

Source of truth: web repo `feat/welcome-push-and-pwa-install-guide` branch
as of 2026-05-08.

---

## 1. Hint Type Definition

File: `src/lib/hints.ts` (lines 3-16)

```ts
export type HintId =
  | 'recurring_intro'
  | 'accounts_intro'
  | 'dashboard_buckets_intro'
  | 'settings_income_sources'
  | 'settings_categories'
  | 'transaction_sheet_reconcile'
  | 'goals_intro'
  | 'target_intro'
  | 'streaks_intro'
  | 'dashboard_card_intro'
  | 'card_theme_available'
  | 'accounts_reconcile_reminder'
  | `sunday_recap_${string}`;
```

Notes:
- `HintId` is a string-literal union, with one template-literal arm
  (`sunday_recap_${string}`) for the per-week recap card.
- The DB column `hint_id` is plain `text`, so any string can land in
  `dismissed_hints`. The TS union is the source-of-truth for what the
  client *produces*; iOS must mirror **every literal** plus the recap
  pattern.
- `streaks_intro` is declared in the union but has **no consumer** in
  the current source (grep returned only the declaration). It is
  vestigial — iOS should still include it in the enum so historical
  rows decode without crashing.

## 2. Enumeration of All Hint IDs

| hint_id | Consumer File:Line | Trigger Condition | Dismiss Behavior | CTA? |
|---|---|---|---|---|
| `recurring_intro` | `src/app/(app)/recurring/page.tsx:324-331` | Always shown on Recurring page until dismissed | Permanent (row in `dismissed_hints`) | No (X only) |
| `accounts_intro` | `src/app/(app)/accounts/page.tsx:124-133` | `allBalancesAreZero` — every account has opening balance 0 | Permanent | No (X only) |
| `accounts_reconcile_reminder` | `src/app/(app)/accounts/page.tsx:135-143` | Always shown on Accounts page until dismissed | Permanent | No (X only) |
| `dashboard_card_intro` | `src/app/(app)/dashboard/page.tsx:335-340` | Always shown beneath CycleCard until dismissed | Permanent | No (X only) |
| `dashboard_buckets_intro` | `src/app/(app)/dashboard/page.tsx:528-533` | Always shown above BucketStrip until dismissed | Permanent | **Yes — "Got it"** |
| `settings_income_sources` | `src/app/(app)/settings/page.tsx:232-241` | `hasNoIncomeSources` — `incomeSources.length === 0` | Permanent | No (X only) |
| `card_theme_available` | `src/app/(app)/settings/page.tsx:247-252` | Always shown above CardThemePicker until dismissed | Permanent | No (X only) |
| `settings_categories` | `src/app/(app)/settings/page.tsx:362-371` | `hasOnlyDefaultCats` — every active cat is a default or null `user_id` | Permanent | No (X only) |
| `goals_intro` | `src/app/(app)/goals/page.tsx:92-100` | `!loading && goalProgresses.length === 0` | Permanent | **Yes — "Got it"** |
| `transaction_sheet_reconcile` | `src/components/transactions/transaction-sheet.tsx:627-633` | `step === 'reconcile'` inside transaction sheet | Permanent | No (X only) |
| `target_intro` | `src/components/transactions/transaction-sheet.tsx:793-800` | Inside expanded "paid from sinking fund" section, when `!sfHintDismissed` | Permanent | **Yes — "Got it"** |
| `streaks_intro` | *(none — declared in union but unused)* | n/a | n/a | n/a |
| `sunday_recap_<isoYear>_W<isoWeek>` | `src/components/dashboard/sunday-recap-card.tsx:13-17, 26-131` | `new Date().getDay() === 0` (local Sunday) **and** id for current ISO-week not in dismissed list | Permanent **per ISO-week** — id rotates each week so dismiss only suppresses *this* week's recap | No (X only) |

Concrete recap id format (line 17): `` `sunday_recap_${year}_W${week.toString().padStart(2, '0')}` `` — e.g. `sunday_recap_2026_W19`.

**Universal mechanic (every hint above):** dismiss = upsert
`(user_id, hint_id)` into `dismissed_hints`. Re-shown only if user
hits "Reset onboarding hints" in Settings (which deletes all rows
for the user). There is no snooze, no expiry, no per-platform
scoping — a hint dismissed on web stays dismissed on iOS, and vice
versa.

## 3. dismissed_hints Table

File: `supabase/migrations/0008_dismissed_hints.sql` (lines 1-13)

```sql
-- Track which onboarding hints each user has dismissed.
-- hint_id is a stable string key defined in src/lib/hints.ts.
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

Columns:
- `user_id`: `uuid`, FK → `auth.users` (`on delete cascade`), NOT NULL
- `hint_id`: `text`, NOT NULL — free-form string; client enforces shape via `HintId` union
- `dismissed_at`: `timestamptz`, default `now()` — never read by current client code (informational/forensic only)

Composite primary key: `(user_id, hint_id)`. This is also what
`upsert(..., { onConflict: 'user_id,hint_id' })` keys against in
`dismissHint`. There is **no separate** `id` column — the composite
PK is the row identity.

RLS policies:
- `"own dismissed hints"`: `for all using (auth.uid() = user_id)` —
  single policy covering SELECT/INSERT/UPDATE/DELETE. Users only
  ever see/touch their own rows.

Profile delete: `src/app/api/profile/delete/route.ts:26` includes
`'dismissed_hints'` in the list of tables purged during account
deletion (handled there in addition to the FK cascade for safety).

## 4. HintCard Component

File: `src/components/hint-card.tsx` (lines 1-82)

**A generic HintCard exists.** All non-recap hints render through this
single component. The SundayRecapCard does **not** use this generic —
it is a bespoke card with its own visual chrome (see §5).

```tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { dismissHint } from '@/lib/hints';
import type { HintId } from '@/lib/hints';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { BUCKET_CONFIG } from '@/lib/constants';

interface HintCardProps {
  hintId: HintId;
  title: string;
  body: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'banner' | 'inline';
  className?: string;
  /** If provided, renders a CTA button instead of (or alongside) the X dismiss */
  cta?: string;
}

export function HintCard({ hintId, title, body, icon: Icon, variant = 'inline', className, cta }: HintCardProps) {
  const { user, dismissedHints, hintsLoaded, addDismissedHint } = useAuthStore();
  const supabase = createClient();

  if (!hintsLoaded) {
    return <Skeleton className={`h-[72px] rounded-2xl bg-card ${className ?? ''}`} />;
  }

  const isDismissed = dismissedHints.includes(hintId);

  async function handleDismiss() {
    if (!user) return;
    addDismissedHint(hintId);
    await dismissHint(supabase, user.id, hintId);
  }

  if (isDismissed) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={hintId}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`bg-card border border-[#D4A017]/30 rounded-2xl p-4 ${className ?? ''}`}
      >
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-[#D4A017]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-sm font-medium mb-1">{title}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{body}</p>
            {cta && (
              <button
                onClick={handleDismiss}
                className="mt-3 h-7 px-3 rounded-lg bg-[#D4A017] text-[#0E1A2E] text-xs font-semibold hover:bg-[#B8891A] transition-colors"
              >
                {cta}
              </button>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground/70 hover:text-muted-foreground transition-colors mt-0.5"
            aria-label="Dismiss hint"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
```

Visual spec (decoded from class names):
- Background: `bg-card` (token).
- Border: 1px, `#D4A017` (gold) at 30% alpha — i.e. `rgba(212, 160, 23, 0.3)`.
- Corner radius: 16pt (`rounded-2xl` = `1rem`).
- Padding: 16pt (`p-4`).
- Layout: horizontal flex, `items-start`, gap 12pt (`gap-3`).
- Optional leading icon: 16×16, `#D4A017` foreground.
- Title: `text-sm` (14pt), `font-medium`, `text-foreground`. Margin-bottom 4pt.
- Body: `text-xs` (12pt), `text-muted-foreground`, leading-relaxed (~1.625).
- Optional CTA button (when `cta` prop present): 28pt high, 12pt horizontal padding, gold background `#D4A017`, dark navy text `#0E1A2E` (`bg-[#D4A017] text-[#0E1A2E]`), `text-xs font-semibold`, 8pt radius (`rounded-lg`). Sits 12pt below body.
- Trailing dismiss button: 14×14 X icon, top-right, `text-muted-foreground/70` → `text-muted-foreground` on hover.
- `variant` prop is plumbed but **unused** in the current implementation — only the className is applied. Both `'banner'` and `'inline'` callers render identically. Treat as informational metadata, not visual difference.

Behavior:
- **Loading state:** while `hintsLoaded === false`, returns a Skeleton (72pt high, `rounded-2xl bg-card`) so the layout doesn't shift when hints data arrives. Critical for iOS to mirror — otherwise a hint can flash on then disappear.
- **Dismissed state:** returns `null` (renders nothing).
- **Dismiss flow:** *both* the X icon and the CTA button (if present) call `handleDismiss`. The CTA is *always* a dismiss action — there is no "alternate accept" path. The CTA is just an alternate styling for hints where a styled "Got it" button reads better than a corner X.
- **Optimistic update:** `addDismissedHint(hintId)` updates Zustand store *before* awaiting the network call. UI hides immediately even if the upsert is in flight.
- **Animation:** framer-motion enter (`opacity 0→1`, `y -8→0`, 200ms) and exit (`opacity 1→0`, `y 0→-8`, `height: 0`, 200ms). The exit collapses height so following content slides up into place.

There is also a `BucketsTooltip` component in the same file (lines 84-143) — it is **not a hint**, just an always-visible `?` icon that opens a dialog explaining the 50/30/20 buckets. Does not touch `dismissed_hints`. Mentioned only to avoid confusion when scanning the file.

## 5. SundayRecapCard

File: `src/components/dashboard/sunday-recap-card.tsx` (lines 1-131)

```tsx
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek, format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useCurrency } from '@/hooks/use-currency';
import { dismissHint } from '@/lib/hints';
import type { HintId } from '@/lib/hints';

function getRecapHintId(): HintId {
  const now = new Date();
  const year = getISOWeekYear(now);
  const week = getISOWeek(now);
  return `sunday_recap_${year}_W${week.toString().padStart(2, '0')}` as HintId;
}

interface RecapData {
  loggingDays: number;
  savedTotal: number;
  goalsCount: number;
}

export function SundayRecapCard() {
  const { user, dismissedHints, addDismissedHint } = useAuthStore();
  const supabase = createClient();
  const { format: formatMoney } = useCurrency();
  const hintId = getRecapHintId();

  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);

  const isSunday = new Date().getDay() === 0;
  const isDismissed = dismissedHints.includes(hintId);

  useEffect(() => {
    if (!user || !isSunday || isDismissed) { setLoading(false); return; }

    const now = new Date();
    const weekStart = format(startOfISOWeek(now), 'yyyy-MM-dd');
    const weekEnd = format(endOfISOWeek(now), 'yyyy-MM-dd');

    Promise.all([
      supabase
        .from('transactions')
        .select('transaction_date')
        .eq('user_id', user.id)
        .gte('transaction_date', weekStart)
        .lte('transaction_date', weekEnd)
        .neq('type', 'adjustment'),
      supabase
        .from('transactions')
        .select('amount, goal_id')
        .eq('user_id', user.id)
        .eq('type', 'transfer')
        .not('goal_id', 'is', null)
        .gte('transaction_date', weekStart)
        .lte('transaction_date', weekEnd),
    ]).then(([txRes, contribRes]) => {
      const dates = new Set((txRes.data ?? []).map((r: { transaction_date: string }) => r.transaction_date));
      const contribs = contribRes.data ?? [];
      const savedTotal = contribs.reduce((s: number, r: { amount: number }) => s + r.amount, 0);
      const goalIds = new Set(contribs.map((r: { goal_id: string }) => r.goal_id).filter(Boolean));
      setData({
        loggingDays: dates.size,
        savedTotal,
        goalsCount: goalIds.size,
      });
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSunday, isDismissed]);

  if (!isSunday || isDismissed || loading || !data) return null;

  async function handleDismiss() {
    if (!user) return;
    addDismissedHint(hintId);
    await dismissHint(supabase, user.id, hintId);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="bg-card border border-[#D4A017]/20 rounded-2xl p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-foreground text-sm font-semibold">📊 Your week in money</p>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground/70 hover:text-muted-foreground transition-colors shrink-0"
          aria-label="Dismiss weekly recap"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          <span>🔥</span>
          <span className="text-muted-foreground">Logging:</span>
          <span className="text-foreground font-medium">{data.loggingDays}/7 days</span>
        </div>

        {data.savedTotal > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span>💰</span>
            <span className="text-muted-foreground">Saved:</span>
            <span className="text-foreground font-medium">
              {formatMoney(data.savedTotal)}
              {data.goalsCount > 0 && (
                <span className="text-muted-foreground font-normal">
                  {' '}to {data.goalsCount} goal{data.goalsCount !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
        )}

        {data.loggingDays === 0 && data.savedTotal === 0 && (
          <p className="text-muted-foreground text-xs">Quiet week — that&apos;s okay. Fresh start tomorrow.</p>
        )}
      </div>
    </motion.div>
  );
}
```

### Visual structure
- Background: `bg-card`. Border: `#D4A017` at **20% alpha** (note: lighter than HintCard's 30%). Radius: 16pt. Padding: 16pt.
- Header row: title `📊 Your week in money` (text-sm, font-semibold) on the left; dismiss X (14×14) on the right. 12pt margin-bottom.
- Body: vertical stack with 6pt gaps (`space-y-1.5`).
  - **Logging row** (always shown when card renders): `🔥 Logging: {N}/7 days`. Label muted, value `text-foreground font-medium`.
  - **Saved row** (conditional, `data.savedTotal > 0`): `💰 Saved: {formatted amount}` followed by `to {N} goal[s]` when `goalsCount > 0`. Pluralization is in-text (`goal` vs `goals`).
  - **Quiet-week fallback** (when `loggingDays === 0 && savedTotal === 0`): paragraph "Quiet week — that's okay. Fresh start tomorrow." in muted-foreground / text-xs.
- No CTA button — only the X dismisses.

### "Is it Sunday?" check
```ts
const isSunday = new Date().getDay() === 0;
```
- Pure client-side, **local-device** date. `getDay() === 0` = Sunday.
- No cron, no server signal, no timezone normalization. Re-evaluated on every render (component is mounted unconditionally on the dashboard — see §7 — and short-circuits when not Sunday).
- Edge case: if a user crosses midnight while on the dashboard, the card will not refresh until the page re-mounts. Web accepts this; iOS may want to evaluate on view appearance.

### Hint id rotation
- `getRecapHintId()` (lines 13-17) constructs the id from **ISO week** (`getISOWeek` + `getISOWeekYear` from date-fns). Format: `sunday_recap_2026_W19`. Week is zero-padded to two digits.
- This is the per-week recurrence mechanism: dismissing only inserts the row for *this* week. Next Sunday computes a different id, sees no row in `dismissed_hints`, shows the card again.

### Content data
Two parallel queries against `transactions`, scoped to `[startOfISOWeek(now), endOfISOWeek(now)]` inclusive:
1. **Logging days:** `select('transaction_date')`, exclude `type='adjustment'`. The card counts **distinct dates** with at least one non-adjustment transaction (set of `transaction_date` strings → size).
2. **Goal saving total:** `select('amount, goal_id')`, `type='transfer'`, `goal_id is not null`. Sums `amount`; counts distinct goals contributed-to.

Note the slight inconsistency: "logging days" excludes `adjustment` but does **not** filter by type otherwise — so transfers and income count toward logging-days. This is deliberate in web (the streak/logging concept is "did you interact with Sika?" not "did you log an expense?").

### Dismiss flow
Identical to HintCard: optimistic local update via `addDismissedHint(hintId)`, then `await dismissHint(supabase, user.id, hintId)` writes the row.

### Re-show behavior
- Dismiss is **permanent for the current ISO week** only.
- Next Sunday → new hint id (next ISO week) → row not present → card shows again.
- "Reset onboarding hints" in Settings deletes all rows including past `sunday_recap_*` rows; harmless because past-week ids are never re-checked.

### Skeleton/loading behavior
Unlike HintCard, SundayRecapCard does **not** wait on `hintsLoaded`. It uses its own `loading` state for the data fetch and renders nothing while loading. This means if `dismissedHints` haven't loaded yet but it *is* Sunday, the card will fetch and render even if the user has already dismissed it; once `dismissedHints` arrives (which happens during initial profile load in `useProfile` — see §6), the next render will hide it. iOS should likely gate on `hintsLoaded` to avoid the brief flash.

## 6. Dismissal Hook / Service

File: `src/lib/hints.ts` (lines 18-44)

```ts
export async function dismissHint(
  supabase: SupabaseClient,
  userId: string,
  hintId: HintId
): Promise<void> {
  await supabase
    .from('dismissed_hints')
    .upsert({ user_id: userId, hint_id: hintId }, { onConflict: 'user_id,hint_id' });
}

export async function resetHints(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase.from('dismissed_hints').delete().eq('user_id', userId);
}

export async function fetchDismissedHints(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('dismissed_hints')
    .select('hint_id')
    .eq('user_id', userId);
  return (data ?? []).map((r: { hint_id: string }) => r.hint_id);
}
```

The fetch returns just an array of `string` ids (no metadata, no
`dismissed_at`). The store then holds `dismissedHints: string[]`
which consumers query with `.includes(hintId)`.

### Where the fetch is wired
File: `src/hooks/use-profile.ts` (lines 7-48)

```ts
import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { fetchDismissedHints } from '@/lib/hints';
import type { UserBadge } from '@/types/badge';

export function useProfile() {
  const {
    user, profile,
    setProfile, setIncomeSources, setAccounts, setDismissedHints,
    setStreaks, setMomentum, setUserBadges, enqueueBadgeCelebrations,
  } = useAuthStore();
  const supabase = createClient();

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const [profileRes, sourcesRes, accountsRes, hintsData, streaksRes, momentumRes, badgesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('income_sources').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true).order('sort_order'),
      fetchDismissedHints(supabase, user.id),
      supabase.from('streaks').select('*').eq('user_id', user.id).single(),
      supabase.from('momentum').select('*').eq('user_id', user.id).single(),
      supabase.from('user_badges').select('*').eq('user_id', user.id).order('unlocked_at', { ascending: false }),
    ]);
    if (profileRes.data) setProfile(profileRes.data);
    if (sourcesRes.data) setIncomeSources(sourcesRes.data);
    if (accountsRes.data) setAccounts(accountsRes.data);
    setDismissedHints(hintsData);
    if (streaksRes.data) setStreaks(streaksRes.data);
    if (momentumRes.data) setMomentum(momentumRes.data);
    if (badgesRes.data) {
      const allBadges = badgesRes.data as UserBadge[];
      setUserBadges(allBadges);
      const pending = allBadges.filter(b => !b.celebration_shown);
      if (pending.length > 0) enqueueBadgeCelebrations(pending);
    }
  }, [user, supabase, setProfile, setIncomeSources, setAccounts, setDismissedHints, setStreaks, setMomentum, setUserBadges, enqueueBadgeCelebrations]);

  useEffect(() => {
    if (user && !profile) {
      fetchProfile();
    }
  }, [user, profile, fetchProfile]);

  return { profile, refetch: fetchProfile };
}
```

`setDismissedHints` is called **unconditionally** (no `if (data)` guard) so that an empty array still flips `hintsLoaded` to `true`. The store flag:

File: `src/stores/auth-store.ts` (lines 47-58)
```ts
dismissedHints: [],
hintsLoaded: false,
...
setDismissedHints: (dismissedHints) => set({ dismissedHints, hintsLoaded: true }),
addDismissedHint: (hintId) =>
  set((s) => ({ dismissedHints: s.dismissedHints.includes(hintId) ? s.dismissedHints : [...s.dismissedHints, hintId] })),
```

`addDismissedHint` is idempotent (deduped via `.includes`).

### Reset flow (Settings)
File: `src/app/(app)/settings/page.tsx` (lines 168-174)
```ts
async function handleResetHints() {
  if (!user) return;
  const { setDismissedHints } = useAuthStore.getState();
  await supabase.from('dismissed_hints').delete().eq('user_id', user.id);
  setDismissedHints([]);
  toast.success('Hints will appear again');
}
```
Triggered by a `RotateCcw`-iconed button labeled "Reset onboarding hints" in the App preferences section (lines 549-561). Inline DB delete; doesn't go through the `resetHints` helper (probably a refactor opportunity but not relevant for iOS port).

### Patterns
- **Optimistic update:** local-state mutation precedes the awaited write in both HintCard.handleDismiss and SundayRecapCard.handleDismiss. Failures are silently dropped (no rollback, no error toast).
- **No cache invalidation library:** Zustand store as single source of truth. No React Query / SWR. iOS pattern: hold the array in `AppState`, mutate locally on dismiss.
- **No realtime subscription:** dismissals do *not* propagate cross-device live. Other tabs/sessions see the change only on next refetch (which happens on `useProfile` mount when `profile` is null — i.e. login or reset).
- **Single fetch on profile load:** there is no per-page refetch. The list of dismissed ids is loaded **once** per session, in parallel with profile/accounts/streaks/etc.

## 7. Home Page Render Slot

File: `src/app/(app)/dashboard/page.tsx` — relevant excerpts:

`HintCard`s tied to dashboard:

Lines 326-342 — **dashboard_card_intro** sits *immediately beneath* the `<CycleCard>`, inside the same JSX fragment, with `className="mt-4"`:
```tsx
<>
  <CycleCard
    cycleNet={dashboardStats?.cycleNet ?? 0}
    cycleLabel={cycle.label}
    userName={profile?.full_name?.toUpperCase() ?? 'SIKA USER'}
    theme={(profile?.card_theme ?? 'sankofa') as import('@/types/card-theme').CycleCardTheme}
    received={dashboardStats?.totalReceived ?? 0}
    spent={dashboardStats?.totalSpentActual ?? 0}
    expected={monthlyIncome}
  />
  <HintCard
    className="mt-4"
    hintId="dashboard_card_intro"
    title="This is your month card"
    body="It shows money that came in minus money that went out this month. Resets at the start of each month. Customize the style in Settings."
  />
</>
```

Lines 345-388 — **SundayRecapCard slot** is between `<ShouldIBuyButton />` and `<HealthRow />`, after the spend-summary grid:
```tsx
{/* Section divider — separates card+stats from rest of dashboard */}
<div className="my-6 border-t border-border/40" />

{/* Spend summary cards */}
<div className="grid grid-cols-2 gap-3">
  {/* SpendCard x2 */}
</div>

{/* Should I buy it? */}
{loading ? (
  /* skeleton */
) : (
  <ShouldIBuyButton />
)}

{/* Sunday recap — only on Sundays */}
<SundayRecapCard />

{/* Financial health row */}
<HealthRow />
```

Lines 524-534 — **dashboard_buckets_intro** sits *above* the `<BucketStrip />`, has a CTA "Got it":
```tsx
{/* Bucket strip — visible on all sizes, links to /buckets detail page */}
<HintCard
  hintId="dashboard_buckets_intro"
  title="How buckets work"
  body="Your income is split 50/30/20 by default: Needs (must-haves like rent, food, transport), Wants (eating out, entertainment, gym), Savings (savings, investments, emergency fund). Customize the split in Settings."
  cta="Got it"
/>
<BucketStrip />
```

### Vertical order on the dashboard (top → bottom)
1. CycleCard
2. **HintCard `dashboard_card_intro`** (just below CycleCard)
3. — divider —
4. SpendCard grid (Today / This Month)
5. ShouldIBuyButton
6. **SundayRecapCard** (Sundays only)
7. HealthRow
8. (income summary, nudges, recurring pending, account balances, goals widget)
9. **HintCard `dashboard_buckets_intro`** (just above BucketStrip)
10. BucketStrip
11. WeeklyChart
12. RecentTransactions (desktop)

### Multiplicity / priority
- There is **no "show only one hint at a time" logic.** Every HintCard renders independently. Nothing is queued or staged.
- **No sort/priority** — order is whatever the JSX tree produces. If both `dashboard_card_intro` and `dashboard_buckets_intro` are undismissed, both are shown simultaneously (separated by the rest of the dashboard).
- The `SundayRecapCard` does its own gating (`isSunday && !isDismissed && data`).
- iOS implication: don't try to be clever and limit to one hint per screen. Mirror web's "show all undismissed" behavior so the dismiss-state is the only mental model the user needs.

## 8. Adjacent Patterns

### OnboardingModal (separate, not a hint)
File: `src/components/dashboard/onboarding-modal.tsx` (referenced from `src/app/(app)/dashboard/page.tsx:15, 553`).

This is the first-time welcome flow (income setup, currency, push, PWA install guide). It is **NOT** part of the hint system:
- It does not write to `dismissed_hints`.
- Its open/closed state is driven by some other mechanism (likely a profile column like `onboarding_completed` — out of scope for this audit).
- Imports `analytics.onboardingCompleted` and `PwaInstallGuide`, neither of which interact with hints.

iOS Phase 4 should **not** treat onboarding completion and hint dismissal as the same concept. They are independent.

### BucketsTooltip (always-visible info)
Co-located in `src/components/hint-card.tsx:84-143`. A `?` button that opens a Dialog explaining buckets. Always available, no dismissal — purely on-demand info. iOS likely already has a similar pattern (or doesn't need one).

### IncomeNudgeCard / nudges (a different "soft prompt" concept)
File pattern: `src/app/(app)/dashboard/page.tsx:427-438` shows `<IncomeNudgeCard nudge={...} onDismiss={...} />` — these are **per-cycle nudges** for expected-income transactions. They have their own dismiss/snooze logic, not `dismissed_hints`. Different table, different mental model. Out of scope for Phase 4 but worth knowing they exist so iOS doesn't conflate them with hints.

### No localStorage-based hints
Grep for `localStorage` returned 0 hits in `src/components/` and `src/app/`. All ephemeral UI state that should survive across sessions goes through `dismissed_hints` (or its parallels for nudges, badges, etc.). iOS should not need a UserDefaults-only fallback path.

### No "tutorial" vs "hint" distinction
There is one concept: the dismissible HintCard with optional CTA. There are no multi-step coachmarks, no spotlight overlays, no walk-through tutorials. The OnboardingModal is the only "guided flow" and it's a distinct, gated, full-screen modal.

### Potential iOS confusion points
1. **`HintId` includes a template-literal arm.** Swift can't model `` `sunday_recap_${string}` `` as an enum case. Treat HintId as a string wrapper or use a separate enum case `case sundayRecap(year: Int, week: Int)` with a custom rawValue mapping.
2. **`streaks_intro` is dead code.** Include it in the iOS enum anyway for forward-compatibility — if any user dismissed it on web (improbable but possible during dev), iOS must decode the row without crashing.
3. **`HintCard.variant` is plumbed-but-unused.** Don't waste iOS effort modeling banner vs inline; they render identically today.
4. **`dismissed_hints.dismissed_at` is never read.** Don't expose it on the iOS model unless future analytics needs it.
5. **Optimistic dismiss has no rollback.** Web doesn't surface upsert failures. If iOS networking is less forgiving, decide explicitly whether to retry, queue, or surface the error — web's behavior is "fire and forget".
6. **SundayRecapCard's `isSunday` check is local-device.** Two devices in different timezones can disagree. The hint id is per ISO-week though, so the dismiss carries across — even if iOS shows the card a few hours earlier or later, dismissing it once sticks.
7. **Logging-days on the recap excludes only `adjustment` type.** Make sure iOS uses the same exclusion or the numbers will diverge.

---

## iOS Implementation Notes

To mirror web's hint system in iOS Phase 4:

### Models

**HintId** — a string-backed type. Recommendation: a struct wrapping `String` plus a static catalog of known ids, rather than a strict enum (because of the recap template-literal arm).

```swift
struct HintId: RawRepresentable, Hashable, Codable {
    let rawValue: String
    init(rawValue: String) { self.rawValue = rawValue }

    // Stable known ids (mirror src/lib/hints.ts)
    static let recurringIntro                = HintId(rawValue: "recurring_intro")
    static let accountsIntro                 = HintId(rawValue: "accounts_intro")
    static let accountsReconcileReminder     = HintId(rawValue: "accounts_reconcile_reminder")
    static let dashboardBucketsIntro         = HintId(rawValue: "dashboard_buckets_intro")
    static let dashboardCardIntro            = HintId(rawValue: "dashboard_card_intro")
    static let cardThemeAvailable            = HintId(rawValue: "card_theme_available")
    static let settingsIncomeSources         = HintId(rawValue: "settings_income_sources")
    static let settingsCategories            = HintId(rawValue: "settings_categories")
    static let goalsIntro                    = HintId(rawValue: "goals_intro")
    static let targetIntro                   = HintId(rawValue: "target_intro")
    static let transactionSheetReconcile     = HintId(rawValue: "transaction_sheet_reconcile")
    static let streaksIntro                  = HintId(rawValue: "streaks_intro") // declared on web, currently unused; include for forward compat

    static func sundayRecap(year: Int, week: Int) -> HintId {
        HintId(rawValue: "sunday_recap_\(year)_W\(String(format: "%02d", week))")
    }
}
```

This keeps unknown ids decodable (forward-compat with future web additions) while giving compile-time safety for known ones via the static members.

**DismissedHint** — match the table but ignore unused columns.
```swift
struct DismissedHint: Codable, Equatable {
    let user_id: UUID
    let hint_id: String
    // dismissed_at exists in DB but is never read by web — omit from the model unless needed
}
```

For the `AppState` cache, just hold `Set<String>` (mirroring web's `string[]` + `.includes()`):
```swift
var dismissedHints: Set<String> = []
var hintsLoaded: Bool = false
```

### Services

**DismissedHintService.fetchAll(userId:) -> [String]**

```swift
// Equivalent to fetchDismissedHints — returns array of hint_id strings
let rows: [DismissedHintRow] = try await supabase
    .from("dismissed_hints")
    .select("hint_id")
    .eq("user_id", userId)
    .execute()
    .value
return rows.map(\.hint_id)
```

**DismissedHintService.dismiss(userId:hintId:)**

```swift
// Equivalent to dismissHint — upsert with composite-key conflict
struct Row: Encodable { let user_id: UUID; let hint_id: String }
try await supabase
    .from("dismissed_hints")
    .upsert(Row(user_id: userId, hint_id: hintId.rawValue),
            onConflict: "user_id,hint_id")
    .execute()
```

**DismissedHintService.resetAll(userId:)** (for the Settings reset button)
```swift
try await supabase
    .from("dismissed_hints")
    .delete()
    .eq("user_id", userId)
    .execute()
```

### AppState integration

- Add `dismissedHints: Set<String>` and `hintsLoaded: Bool` to AppState (or whatever holds session state).
- In `loadProfile` (mirror of `useProfile.fetchProfile`), add a parallel call to `DismissedHintService.fetchAll`. After the parallel batch resolves, set `dismissedHints = Set(result)` *and* `hintsLoaded = true` in a single update so SwiftUI views see them together.
- Computed helper:
  ```swift
  func isDismissed(_ hintId: HintId) -> Bool {
      dismissedHints.contains(hintId.rawValue)
  }
  ```
- Optimistic dismiss:
  ```swift
  @MainActor
  func dismissHint(_ hintId: HintId) async {
      dismissedHints.insert(hintId.rawValue)         // optimistic
      try? await DismissedHintService.dismiss(
          userId: currentUser.id, hintId: hintId)    // fire-and-forget on failure (matches web)
  }
  ```
- Reset (Settings):
  ```swift
  @MainActor
  func resetHints() async throws {
      try await DismissedHintService.resetAll(userId: currentUser.id)
      dismissedHints.removeAll()
      hintsLoaded = true
  }
  ```

### HintCard component (SwiftUI)

**Required props (parameters):**
- `hintId: HintId`
- `title: String`
- `body: String`
- `icon: Image?` (optional leading icon — web uses Lucide icons; iOS should accept SF Symbol or asset)
- `cta: String?` — when present, render a "Got it"-style button that *also* dismisses
- `variant`: do **not** add this; web declares it but doesn't use it.

**Visual spec (port verbatim from §4):**
- Background: card token (matches existing iOS card backgrounds).
- Border: 1pt stroke, gold `#D4A017` at 30% opacity (`Color(red: 0.831, green: 0.627, blue: 0.090).opacity(0.3)`).
- Corner radius: 16pt.
- Padding: 16pt all sides.
- Layout: HStack(alignment: .top, spacing: 12) with optional leading icon (16pt, gold), VStack title+body+optional CTA, trailing X button (top-right).
- Title: 14pt, semibold-medium (matches `.font-medium`), foreground color.
- Body: 12pt, secondary/muted color, line-height ≈1.45-1.625.
- CTA button (when `cta != nil`): 28pt height, 12pt h-padding, gold fill `#D4A017`, navy text `#0E1A2E`, 12pt semibold, 8pt corner radius. Sits 12pt below body. Tapping it = dismiss.
- X dismiss button: 14pt SF Symbol (`xmark`), muted foreground.

**Skeleton state (CRITICAL):**
- While `appState.hintsLoaded == false`, render a 72pt-tall placeholder with the card's background and corner radius — NOT the actual hint. This prevents the flash-then-disappear when dismissed-hints data arrives after first paint.
- When `hintsLoaded == true && isDismissed(hintId) == true`, render `EmptyView()` (web returns `null`).

**Animation:**
- On enter: opacity 0→1, offset y -8→0 over 0.2s (`.easeOut`).
- On exit (when dismissed): opacity 1→0, offset y 0→-8, height collapse over 0.2s. Use `.transition(.asymmetric(...))` or `withAnimation { … }` plus a conditional `if`.

**Dismiss gestures:**
- Required: tap on X button.
- Required: tap on CTA button (if present).
- **Optional / iOS-idiomatic:** swipe-to-dismiss. Web doesn't have this, but it's idiomatic on iOS. Defer to your design call — the bare minimum to match web is the X tap.

**Behavior:**
- On any dismiss action: call `appState.dismissHint(hintId)` (the optimistic version). Don't await before hiding.

### SundayRecapCard (SwiftUI)

**Trigger:** evaluate on view appearance (`onAppear`) and use `Calendar.current.component(.weekday, from: Date()) == 1` (where 1 = Sunday in Apple's calendar). Don't try to keep it live across midnight — match web's "evaluate on mount" model.

**ISO week id:** Apple's `Calendar(identifier: .iso8601)` provides ISO week + ISO year. Build the id with the same format: `sunday_recap_\(year)_W\(format("%02d", week))`. Reuse `HintId.sundayRecap(year:week:)` from above.

**Content data sources from AppState/services:**
- `loggingDays`: distinct `transaction_date` values in `[startOfISOWeek...endOfISOWeek]` where `type != "adjustment"`. Set count.
- `savedTotal`: sum of `amount` from transfers in same range with `goal_id != nil`.
- `goalsCount`: distinct `goal_id` count among those transfers.

These two queries should run in parallel via `async let` to mirror web's `Promise.all`.

**Visual structure:**
- Card with `bg-card`, gold border at **20% opacity** (note: lighter than HintCard's 30%), 16pt corners, 16pt padding.
- Title row: `📊 Your week in money` (14pt semibold) + trailing X dismiss (14pt).
- Body: VStack 6pt spacing.
  - Logging row: `🔥 Logging: <N>/7 days`.
  - Saved row (if `savedTotal > 0`): `💰 Saved: <formatted> [to <N> goal[s]]`.
  - Quiet-week fallback (if `loggingDays == 0 && savedTotal == 0`): "Quiet week — that's okay. Fresh start tomorrow." in muted 12pt.

**Slot on Home (AuthenticatedHomeView):**
- After ShouldIBuy / spend-summary cards.
- Before HealthRow.
- Web puts it at exactly that position in `dashboard/page.tsx:387`. Mirror this — don't put it at the top.

**Dismiss flow:** identical to HintCard. Optimistic local `dismissedHints.insert(...)`, then upsert. View hides via the same `isDismissed(hintId)` check on next render.

**Re-show:** automatic next Sunday because the id rotates by ISO-week. No special code needed.

### Schema considerations

- **Does iOS need a Supabase migration to add dismissed_hints?**
  **No.** Migration `0008_dismissed_hints.sql` is already applied server-side. iOS just consumes the existing table.

- **RLS policies that affect iOS auth flow:**
  Single policy: `"own dismissed hints" for all using (auth.uid() = user_id)`. As long as iOS authenticates as the user (same Supabase JWT pattern web uses), all CRUD operations on `dismissed_hints` will work. No extra grants, no service-role calls needed.

- **Profile delete:** if iOS exposes account deletion, the existing `/api/profile/delete` route already cleans up `dismissed_hints`. iOS-initiated deletion that goes through the same endpoint is covered. If iOS adds a separate native deletion path, ensure it includes `dismissed_hints` in the cleanup list (or relies on the FK cascade from `auth.users`).

- **No new types to add to TypeScript Database type generator.** The schema is unchanged.
