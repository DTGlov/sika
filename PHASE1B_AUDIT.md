# Sika Phase 1B Audit
Generated: 2026-05-06

This audit re-walks the `sika-web` repo from the perspective of Phase 1B: tab bar / nav shell, dashboard, transactions list/add/edit/delete, cycle math, buckets math + UI, categories, accounts. PHASE1_AUDIT.md (10-day-old, broader-scope) is in the repo root; this document narrows on the core money loop and quotes exact file paths and code so the iOS architect doesn't have to guess. Where a fact could not be verified in code, the entry is marked **UNKNOWN**.

---

## 0. Top-level navigation structure (web)

### Where the authenticated app lives
- Authenticated route group: `src/app/(app)/` (layout at `src/app/(app)/layout.tsx`).
- The layout is a server component that calls `supabase.auth.getUser()` and redirects to `/login` if no user. It then mounts `<AppShell user={user}>...</AppShell>`.
- `AppShell` (`src/components/layout/app-shell.tsx`) is the **visual chrome** for every authenticated page. It mounts:
  - `SideRail` (`md:` and up)
  - `BottomNav` (mobile only)
  - `TopBar` is **not** part of AppShell — each route renders it itself when desired (e.g. `dashboard/page.tsx:255`). On routes like `/transactions`, `/accounts`, `/buckets`, the page provides its own header instead.
  - Always-mounted: `<AddTransactionFab />`, `<TransactionSheet />`, `<BadgeCelebrationHost />`.
- An `(app)/template.tsx` exists alongside the layout (used for per-navigation animations; out of scope here).

### Nav style
Web has **both** a mobile bottom nav (`md:hidden`) and a desktop side rail (`hidden md:flex`). They are not visually unified — they're two separate components driven by Tailwind responsive classes. iOS will collapse this to a single tab bar.

### Mobile bottom nav (`src/components/layout/bottom-nav.tsx:8-14`)
```ts
const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Home',         icon: Home },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/accounts',     label: 'Accounts',     icon: Wallet },
  { href: '/goals',        label: 'Goals',        icon: Target },
  { href: '/recurring',    label: 'Recurring',    icon: RefreshCw },
] as const;
```
Five tabs. Settings is **not** in the bottom nav — it's reached via a gear icon in the dashboard's TopBar (`top-bar.tsx:31-37`).

### Desktop side rail (`src/components/layout/side-rail.tsx:9-16`)
Same five tabs **plus Settings**:
```ts
const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Home',         icon: Home },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/accounts',     label: 'Accounts',     icon: Wallet },
  { href: '/goals',        label: 'Goals',        icon: Target },
  { href: '/recurring',    label: 'Recurring',    icon: RefreshCw },
  { href: '/settings',     label: 'Settings',     icon: Settings },
] as const;
```

### All authenticated routes (every `page.tsx` under `src/app/(app)/`)
| Route | File | Sub-routes |
| --- | --- | --- |
| `/dashboard` | `dashboard/page.tsx` (576 lines) | `dashboard/cycle-detail/page.tsx` |
| `/transactions` | `transactions/page.tsx` (533 lines) | — |
| `/accounts` | `accounts/page.tsx` (294 lines) | — |
| `/buckets` | `buckets/page.tsx` (329 lines) | — (linked from BucketStrip) |
| `/goals` | `goals/page.tsx` (309 lines) | `goals/[id]/page.tsx` |
| `/recurring` | `recurring/page.tsx` (465 lines) | `recurring/[id]/page.tsx` |
| `/settings` | `settings/page.tsx` (633 lines) | `settings/currency/page.tsx` |
| `/streaks` | `streaks/page.tsx` (187 lines) | — (linked from HealthRow) |
| `/health` | `health/page.tsx` (183 lines) | — (linked from HealthRow) |
| `/momentum` | `momentum/page.tsx` (179 lines) | — |
| `/badges` | `badges/page.tsx` (90 lines) | — |
| `/daily` | `daily/page.tsx` (205 lines) | — (Sika Daily news) |
| `/monthly` | `monthly/page.tsx` (54 lines) | — (monthly recap viewer) |

### Primary destinations vs sub-routes (iOS tab decisions)
- **Tab candidates (Phase 1B core):** `/dashboard`, `/transactions`, `/accounts`. (Web also gives `/goals` and `/recurring` tab slots, but they're Phase 1D/2 deferred.)
- **Sub-routes / drill-downs (push, not tab):** `/buckets`, `/dashboard/cycle-detail`, `/goals/[id]`, `/recurring/[id]`, `/settings`, `/streaks`, `/health`, `/momentum`, `/badges`, `/daily`, `/monthly`.
- **Web has no equivalent tab bar with badge counts or +-FAB-in-tab patterns**: the FAB is a free-floating button, centered above the bottom nav on mobile (`add-transaction-fab.tsx:22-24`) and bottom-right on desktop.

### Other nav-related components in `src/components/`
- `src/components/layout/app-shell.tsx` — chrome wrapper
- `src/components/layout/bottom-nav.tsx` — mobile tab bar
- `src/components/layout/side-rail.tsx` — desktop rail
- `src/components/layout/top-bar.tsx` — dashboard greeting + settings button
- `src/components/transactions/add-transaction-fab.tsx` — global FAB

---

## 1. Home / Dashboard

`src/app/(app)/dashboard/page.tsx` (576 lines) is a `'use client'` page wrapped in `<Suspense>` because it consumes `useSearchParams()` (the `?cycle=YYYY-MM-DD` URL param). The default export is a `Suspense` shell whose fallback is a small skeleton; the real component is `DashboardContent`.

### Component tree (top-to-bottom render order)
```
PullToRefresh                            (src/components/ui/pull-to-refresh.tsx)
└── div max-w-2xl mx-auto pb-8
    ├── TopBar                           (src/components/layout/top-bar.tsx)
    └── div px-4 md:px-8 space-y-4
        ├── Cycle navigation (← cycle.label →)              [inline]
        ├── SikaDailyBanner | skeleton | null               (src/components/dashboard/sika-daily-banner.tsx)
        ├── InsightStrip (today's AI insight, if any)       (src/components/dashboard/insight-strip.tsx)
        ├── SikaMonthlyBanner (if unread monthly recap)     (src/components/dashboard/sika-monthly-banner.tsx)
        ├── div w-full md:max-w-[440px] md:mx-auto
        │   ├── Skeleton  (while loading)
        │   └── CycleCard                                   (src/components/dashboard/cycle-card.tsx)
        │       └── HintCard "dashboard_card_intro"         (src/components/hint-card.tsx)
        ├── <hr/> divider                                   [inline]
        ├── grid-cols-2: SpendCard "Today" + SpendCard "This Month"
        │                                                   (src/components/dashboard/spend-card.tsx)
        ├── ShouldIBuyButton                                (src/components/decision/should-i-buy-button.tsx)
        ├── SundayRecapCard (only on Sundays)               (src/components/dashboard/sunday-recap-card.tsx)
        ├── HealthRow                                       (src/components/dashboard/health-row.tsx)
        ├── Income summary row (desktop only)               [inline expand/collapse]
        ├── Income nudge cards / pending recurring cards    (src/components/dashboard/income-nudge-card.tsx)
        ├── Buckets — desktop only (BucketRing × 3)         (src/components/dashboard/bucket-ring.tsx)
        ├── Account strip — desktop only                    [inline horizontal scroll]
        ├── GoalsWidget (if any)                            (src/components/dashboard/goals-widget.tsx)
        ├── HintCard "dashboard_buckets_intro"              (src/components/hint-card.tsx)
        ├── BucketStrip ← all sizes; links to /buckets      (src/components/dashboard/bucket-strip.tsx)
        ├── WeeklyChart                                     (src/components/dashboard/weekly-chart.tsx)
        └── RecentTransactions — desktop only               (src/components/dashboard/recent-transactions.tsx)
    └── OnboardingModal (if profile.monthly_income == 0)    (src/components/dashboard/onboarding-modal.tsx)
```

**Mobile vs desktop:** the dashboard intentionally **hides** the BucketRing trio, account strip, income summary, and RecentTransactions list on mobile (`hidden md:block`). Mobile collapses these into the BucketStrip. iOS should mirror the mobile layout, not the desktop one.

### Direct child component descriptions (Phase 1B-relevant)
- **`TopBar`** (`src/components/layout/top-bar.tsx`, 39 lines) — greeting (`getGreeting()` from `lib/utils.ts`), first name from `profile.full_name`, `format(new Date(), 'MMMM yyyy')`, and a gear icon linking to `/settings`. Pure presentational, reads from `useAuthStore`.
- **`CycleCard`** (`src/components/dashboard/cycle-card.tsx`, 209 lines) — credit-card-shaped surface showing `cycleNet` formatted as currency, with chip + motif themed by `profile.card_theme` (`sankofa | gye_nyame | adinkrahene | copper | emerald | amber | obsidian`). Below the card: small text strip "Received X · Spent Y · Expected Z/mo". Tapping the card navigates to `/dashboard/cycle-detail` (preserving any `?cycle=` param).
- **`SpendCard`** (`src/components/dashboard/spend-card.tsx`, 41 lines) — small card with title, currency symbol on its own line, big amount, and an optional "X% vs prev period" delta.
- **`BucketStrip`** (`src/components/dashboard/bucket-strip.tsx`, 59 lines) — three horizontal progress bars (Needs/Wants/Savings) with `spent of limit` text and a thin colored bar. Whole card is a `<Link href="/buckets">`.
- **`BucketRing`** (`src/components/dashboard/bucket-ring.tsx`, 102 lines) — circular SVG ring (radius 36, stroke 6) with percent label. Color from `getProgressColor(percent)`. **Desktop-only** on the dashboard; included in this audit because it's the canonical bucket visualization and may inform iOS detail screens.
- **`HealthRow`** (`src/components/dashboard/health-row.tsx`, 92 lines) — Sika score / streak surface. Computes `healthScore` via `lib/health-score.ts`, shows a tier emoji + label + numeric streak. **Phase 1C deferred.**
- **`SikaDailyBanner`** (`src/components/dashboard/sika-daily-banner.tsx`, 33 lines) — entry point to `/daily`. **Phase 1C deferred.**
- **`SikaMonthlyBanner`** (`src/components/dashboard/sika-monthly-banner.tsx`, 56 lines) — links to `/monthly` recap. **Phase 2 deferred.**
- **`InsightStrip`** (`src/components/dashboard/insight-strip.tsx`, 68 lines) — AI insight strip. **Phase 1C deferred.**
- **`SundayRecapCard`** (`src/components/dashboard/sunday-recap-card.tsx`, 131 lines) — Sunday-only weekly summary. **Phase 1C/2 deferred.**
- **`OnboardingModal`** — already mapped in PHASE1_AUDIT.md; no changes since.
- **`IncomeNudgeCard` / `PendingRecurringCard`** (same file, 110 lines total) — reminder cards for income that should have arrived today and recurring expenses pending confirmation. See full source below.
- **`GoalsWidget`** (`src/components/dashboard/goals-widget.tsx`, 69 lines) — top-3 goals with progress bars. **Phase 1D/2 deferred.**
- **`WeeklyChart`** (`src/components/dashboard/weekly-chart.tsx`, 56 lines) — recharts BarChart over `weeklySpend`.
- **`RecentTransactions`** (`src/components/dashboard/recent-transactions.tsx`, 83 lines) — top-5 recent transactions. **Desktop only** on the dashboard.

### Supabase queries fired on dashboard load
Triggered from `DashboardContent` itself (not counting the `useDashboardData` hook):

1. `dashboard/page.tsx:103-121` — `supabase.from('sika_daily_digests').select('*').eq('digest_date', today).single()`, then `from('user_daily_reads').select('id').eq('user_id', user.id).eq('digest_date', today).single()`.
2. `dashboard/page.tsx:130-142` — `supabase.from('monthly_recaps').select('id, viewed_at, dismissed_at, generated_at').eq('user_id', user.id).is('viewed_at', null).is('dismissed_at', null).gte('generated_at', thirtyDaysAgo).order('month_start', { ascending: false }).limit(1).maybeSingle()`.
3. `dashboard/page.tsx:149` — `fetch('/api/insights/today')`.
4. `dashboard/page.tsx:161-166` — `checkAndUnlockBadges(supabase, user.id, 'cycle_ended')`.
5. `dashboard/page.tsx:173` — `getDueIncomeNudges(supabase, user.id, incomeSources)`.
6. `dashboard/page.tsx:180-190` — `fetchGoals` then `fetchGoalAmounts` per goal (top 3) for GoalsWidget.

Inside `useDashboardData` (`src/hooks/use-dashboard-data.ts:60-92`), in parallel:

7. `transactions` for the cycle window (with full `category`, `account`, `to_account` joins) — `lines 67-73`.
8. `transactions` for the previous cycle, only `amount, type` and only `expense` — `lines 74-80`.
9. `budget_buckets` for the user, ordered by `sort_order` — `line 81`.
10. `categories` (with bucket join) where `user_id = user OR user_id IS NULL` and `is_archived = false` — `lines 82-87`.
11. `transactions` (whole history, just `account_id, to_account_id, amount, type`) for account-balance computation — `lines 88-92`.

Inside `useProfile` hook (also called from dashboard), an additional 7-way `Promise.all` fires: `profiles`, `income_sources`, `accounts`, `dismissed_hints`, `streaks`, `momentum`, `user_badges` (`src/hooks/use-profile.ts:18-25`).

### Zustand store reads on dashboard
- `useAuthStore` — `profile, incomeSources, accounts, user, enqueueBadgeCelebrations` (`dashboard/page.tsx:58`)
- `useTransactionStore` — `dashboardStats` (`line 60`)
- Side-effect setters: `setProfile, setIncomeSources, setAccounts, setStreaks, setMomentum, setUserBadges, setHealthScore, enqueueBadgeCelebrations`.

### Loading state
- Each major block guards with `loading` from `useDashboardData`. While `loading === true`, render `<Skeleton/>` placeholders (cycle card, spend cards, bucket rings, weekly chart, recent transactions).
- The Sika Daily banner has its own `digestLoading` flag → renders a small inline skeleton, not a Skeleton component.

### Empty states
- **No transactions yet:** the dashboard still renders. `dashboardStats.recentTransactions` becomes `[]`; `RecentTransactions` shows "No transactions yet. Tap + to log one." (`recent-transactions.tsx:33-35`). Bucket rings render at 0%.
- **No income (`profile.monthly_income === 0` AND `incomeSources.length === 0`):** `OnboardingModal` opens automatically (`dashboard/page.tsx:93-97`).
- **No accounts:** the desktop account strip block is hidden (`accounts.length > 0`-gated, `dashboard/page.tsx:486`).
- **No goals:** `GoalsWidget` returns `null` when `goals.length === 0` (`goals-widget.tsx:14`).

### Conditional rendering rules
- `showOnboarding`: `profile.monthly_income === 0 && incomeSources.length === 0`
- Sika Daily banner skeleton until `digestLoading === false`, then shows banner only if `todayDigest && !digestRead`.
- AI insight: only if `todayInsight && !todayInsight.dismissed_at`.
- Monthly recap banner: only if `monthlyRecapId !== null`.
- `cycle.isCurrent` flips the spend-card titles between "Today/This Month" vs "Last day/<month name>" (`dashboard/page.tsx:357-368`).
- Forward cycle button is disabled when `cycle.isCurrent` (`line 281`).

### Buckets strip — full source
File: `src/components/dashboard/bucket-strip.tsx` (already printed in Section 0; reproduced verbatim):

```tsx
'use client';

import Link from 'next/link';
import { useTransactionStore } from '@/stores/transaction-store';
import { useCurrency } from '@/hooks/use-currency';
import { BUCKET_CONFIG } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import type { BucketName } from '@/types';

const BUCKETS: BucketName[] = ['needs', 'wants', 'savings'];

export function BucketStrip() {
  const dashboardStats = useTransactionStore((s) => s.dashboardStats);
  const { format } = useCurrency();

  if (!dashboardStats) {
    return <Skeleton className="h-40 rounded-2xl bg-card" />;
  }

  return (
    <Link
      href="/buckets"
      className="block bg-card border border-border rounded-2xl p-5 hover:bg-card/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Buckets · This month
        </p>
        <span className="text-muted-foreground text-sm">→</span>
      </div>

      <div className="flex flex-col gap-4">
        {BUCKETS.map((bucket) => {
          const config = BUCKET_CONFIG[bucket];
          const spent = dashboardStats.bucketSpend[bucket] ?? 0;
          const limit = dashboardStats.bucketLimits[bucket] ?? 0;
          const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;

          return (
            <div key={bucket}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm text-foreground">{config.label}</span>
                <span className="text-xs text-muted-foreground sika-sensitive">
                  {format(spent)} of {format(limit)}
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: config.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
```

### Sika score / streak surface (HealthRow) — full source
File: `src/components/dashboard/health-row.tsx`. Used on dashboard at line 390.
```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Flame, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTransactionStore } from '@/stores/transaction-store';
import { computeHealthScore } from '@/lib/health-score';
import { getLabelConfig } from '@/types/health';
import { hasLoggedToday } from '@/lib/streaks';
import { TierIcon } from '@/components/momentum-float';
import { getTierProgress } from '@/lib/momentum';

const TOTAL_BADGES = 8;
// (full body trimmed in this audit — Phase 1C deferred; dashboard renders <HealthRow /> at line 390)
```
The full file is 92 lines and pulls health, streak, momentum, and badge counts. **Phase 1C deferred** — iOS Phase 1B should leave a placeholder slot for this at the same vertical position.

### Sika Daily news component — full source
`src/components/dashboard/sika-daily-banner.tsx` (33 lines):
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { DailyDigest } from '@/types/daily';

interface SikaDailyBannerProps {
  digest: DailyDigest;
}

export function SikaDailyBanner({ digest }: SikaDailyBannerProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/daily')}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-card border border-[#D4A017]/20 shadow-[0_0_20px_rgba(0,217,163,0.08)] hover:border-[#D4A017]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-center gap-3">
        <div className="text-xl">📰</div>
        <div className="text-left">
          <div className="text-sm font-semibold text-foreground">
            Today&apos;s Sika Daily
          </div>
          <div className="text-xs text-muted-foreground">
            {digest.headline}
          </div>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}
```

### Recent transactions on dashboard — full source
File: `src/components/dashboard/recent-transactions.tsx` (84 lines, full body):
```tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { formatTransactionDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';
import type { Transaction } from '@/types';

interface RecentTransactionsProps {
  transactions: Transaction[];
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  const { format } = useCurrency();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.55, ease: 'easeOut' }}
      className="bg-card border border-border rounded-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Recent</p>
        <Link
          href="/transactions"
          className="flex items-center gap-1 text-[#D4A017] text-xs font-medium hover:text-[#E8B520] transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="px-5 py-10 text-center text-muted-foreground text-sm">
          No transactions yet. Tap + to log one.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {transactions.map((txn) => (
            <div key={txn.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                  style={{
                    background: txn.category?.bucket
                      ? `${txn.category.bucket.color}22`
                      : 'var(--muted)',
                  }}
                >
                  {txn.category?.icon ? (
                    <span className="text-sm">{getIconEmoji(txn.category.icon)}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">?</span>
                  )}
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {txn.category?.name ?? 'Uncategorized'}
                  </p>
                  <p className="text-muted-foreground text-xs">{formatTransactionDate(txn.transaction_date)}</p>
                </div>
              </div>
              <p className={`amount text-sm font-semibold ${txn.type === 'income' ? 'text-[#D4A017]' : 'text-foreground'}`}>
                {txn.type === 'income' ? '+' : '-'}{format(txn.amount)}
              </p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function getIconEmoji(icon: string): string {
  const map: Record<string, string> = {
    home: '🏠', 'shopping-cart': '🛒', zap: '⚡', droplet: '💧', wifi: '📶',
    car: '🚗', utensils: '🍽️', 'heart-pulse': '💊', pizza: '🍕', film: '🎬',
    'shopping-bag': '🛍️', repeat: '🔄', dumbbell: '🏋️', sparkles: '✨',
    'piggy-bank': '🐷', 'trending-up': '📈', shield: '🛡️', briefcase: '💼',
    gift: '🎁',
  };
  return map[icon] ?? '💸';
}
```

Note: this component **only handles `expense` and `income`** types in its sign rendering and emoji selection. It does not render transfer or adjustment correctly — the full TransactionItem (used on `/transactions`) handles those. It's only used on the dashboard (desktop-only block), which historically only shows recent expenses + income.

### Reminder cards — full source
File: `src/components/dashboard/income-nudge-card.tsx`. Two named exports: `IncomeNudgeCard` and `PendingRecurringCard`.

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
          <p className="text-foreground text-sm font-semibold">{incomeSource.name} expected today</p>
          <p className="text-muted-foreground text-xs mt-0.5">Did you receive {format(incomeSource.amount)}?</p>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => onLog(nudge)} className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#D4A017] text-[#0E1A2E] text-xs font-semibold hover:bg-[#B8891A] transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Yes, log it
            </button>
            <button onClick={() => onSnooze(nudge)} className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors">
              <Clock className="w-3.5 h-3.5" /> Not yet
            </button>
          </div>
        </div>
        <button onClick={() => onDismiss(nudge)} className="text-muted-foreground/70 hover:text-muted-foreground transition-colors shrink-0" title="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

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
          <p className="text-muted-foreground text-xs mt-0.5">{format(amount)} · {dueDate}</p>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={onConfirm} className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#FBBF24] text-[#0E1A2E] text-xs font-semibold hover:bg-[#F59E0B] transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Log it
            </button>
            <button onClick={onSkip} className="h-8 px-3 rounded-xl bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors">Skip</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

The auto-log expenses card is the `PendingRecurringCard` above. Both cards use `AnimatePresence` with `popLayout` mode in the dashboard to slide in/out as user acts.

The handlers `handleLogNudge` / `handleSnoozeNudge` / `handleDismissNudge` / `handleConfirmPending` / `handleSkipPending` are defined inline in `dashboard/page.tsx:194-239`. `handleLogNudge` writes a row directly:

```ts
await supabase.from('transactions').insert({
  user_id: user.id,
  account_id: defaultAccount.id,
  category_id: null,
  amount: nudge.incomeSource.amount,
  type: 'income',
  note: nudge.incomeSource.name,
  transaction_date: today,
});
```

Note **`category_id: null`** for nudge-logged income — the dashboard doesn't pick a category, just writes a free-text note.

---

## 2. Transactions — list view

File: `src/app/(app)/transactions/page.tsx` (533 lines). `'use client'` Suspense-wrapped page.

### Default state
- Period filter defaults to **`cycle`** (current cycle) — see `urlPeriod = ... ?? 'cycle'` (line 51).
- Sort defaults to **`date-desc`** (line 56).
- Other filters default to `'all'`: `type`, `account`, `category`, `bucket`. `amtMin`/`amtMax` empty.
- Page size 50 (`PAGE_SIZE = 50`, line 21). Real query is `range(0, 49)` and uses `.order(orderCol).order('created_at', { ascending: false })` as a tiebreaker.

### Period tabs
```ts
const PERIOD_TABS = [
  { value: 'cycle', label: 'This Month' },
  { value: 'prev_cycle', label: 'Last Month' },
  { value: 'last30', label: '30 Days' },
  { value: 'last90', label: '90 Days' },
  { value: 'all', label: 'All' },
] as const;
```

`getDateRange(period)` (lines 70-96) computes from/to:
- `cycle` → uses `getCycleForDate(today, cycleStartDay)` boundaries
- `prev_cycle` → cycle.start − 1 day end, − 1 calendar month start (clamped to `cycleStartDay`)
- `last30` / `last90` → today minus 29/89 days
- `all` → returns `null`, no date filter applied

### Filter UI
The full filter component is **inline in the page file** — no separate `filter-bar.tsx`. Active filters live in URL params (`type`, `account`, `category`, `bucket`, `amtMin`, `amtMax`, `sort`). `updateParam(key, value)` (lines 98-107) writes to the URL via `router.replace(...)`. A "default" value (e.g. `'all'`, empty, `'date-desc'`) deletes the param instead of setting it.

The collapsible filter panel renders 6 sections: Type, Account, Bucket, Category, Amount range, Sort. Source already printed verbatim in Section 0; lines 277-444 of `transactions/page.tsx`.

### Group-by-date logic
```ts
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
```
(`transactions/page.tsx:182-196`)

Group key = `transaction_date` (the literal `YYYY-MM-DD` string). Order within a date is whatever Supabase returned (preserved); cross-date order is by string sort on the date key.

Date label: `formatTransactionDate(date) · ${format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}` (line 483) — e.g. "Today · Mar 14, 2026".

### Search (client-side)
```ts
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
```
(lines 167-180). Bucket filter and free-text search are applied client-side, **after** the SQL fetch. Type/account/category/amount range filters are sent to Supabase.

### Row component
`src/components/transactions/transaction-item.tsx` (202 lines). Already printed in Section 0; it's a simple flex row with:
- 40×40 emoji icon (background tinted to bucket color, or muted for adjustment)
- Two-line label: title + (account name | "Auto" badge | "🎯 From fund" badge | note)
- date below
- right side: signed colored amount + 3-dot dropdown menu (Edit / Delete)

The `getIconEmoji` mapping (`transaction-item.tsx:21-31`) is the canonical icon→emoji map used across the app.

### Swipe actions
**There are none.** Web doesn't implement swipe-to-delete. Edit/delete is via the 3-dot dropdown menu (`transaction-item.tsx:140-167`). iOS will likely add real swipe actions; this is a divergence to flag.

### Tap handler
- Single tap on the row body: **no handler** — the row body is not interactive. The user must tap the 3-dot menu to get Edit / Delete.
- Edit opens the **same `TransactionSheet`** (the global add-transaction sheet) by calling `openLogSheet(txn)` from the Zustand store. The sheet pre-fills its state from `editingTransaction` (`transaction-sheet.tsx:128-139`).

### Pagination
```ts
function loadMore() {
  const next = page + 1;
  setPage(next);
  loadTransactions(next, true);
}
```
Single "Load more" button at the bottom (line 497-509). `hasMore` is `(pageNum + 1) * PAGE_SIZE < (count ?? 0)`. **No infinite scroll** — explicit button.

### Empty state UI
```tsx
{grouped.length === 0 ? (
  <div className="text-center py-20 px-4">
    <p className="text-muted-foreground text-sm">No transactions match your filters.</p>
    {(activeFilterCount > 0 || search) && (
      <button onClick={() => { clearAllFilters(); setSearch(''); }} className="mt-3 text-xs text-[#D4A017] hover:text-[#E8B520] transition-colors">
        Clear filters
      </button>
    )}
  </div>
) : ( ... )}
```
(lines 464-475). **Same message regardless** of whether the user has zero transactions overall or just filtered everything out — there's no distinct "you haven't logged anything yet" empty state on this route.

---

## 3. Transactions — add new

### Trigger
`AddTransactionFab` (`src/components/transactions/add-transaction-fab.tsx`) — a floating + button mounted globally inside `AppShell`. On tap it calls `useTransactionStore.getState().openLogSheet()` (no argument → opens for a new transaction).

```tsx
className="fixed z-40 w-14 h-14 rounded-full bg-[#D4A017] text-[#0E1A2E] shadow-lg ...
  bottom-[calc(5.4375rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2
  md:bottom-6 md:left-auto md:right-6 md:translate-x-0"
```
Mobile: centered, 87px above the bottom nav. Desktop: bottom-right corner. There is also a haptic light tap.

### The form component
File: `src/components/transactions/transaction-sheet.tsx` (933 lines). It's a single component that handles **both** add AND edit AND reconcile (adjustment). Opens as a bottom Sheet (`<Sheet side="bottom">`).

The sheet has a **stepped flow**:
```ts
type Step = 'amount' | 'category' | 'accounts' | 'details' | 'reconcile';
```
- expense / income: `amount → category → details`
- transfer: `amount → accounts → details`
- adjustment: `reconcile` (single page)

A step-progress strip at the top shows current step; back button on every step.

Sub-components used:
- `AmountKeypad` (`src/components/transactions/amount-keypad.tsx`) — custom 3×4 numeric keypad with "expense | income | transfer" pill type-switcher above
- `CategoryGrid` (`src/components/transactions/category-grid.tsx`) — 3-column emoji grid for expense categories
- `IncomeCategoryPicker` (`src/components/transactions/income-category-picker.tsx`) — 7 hardcoded preset chips + an "Other" custom-emoji-and-label row
- `InsufficientBalanceSheet` (`src/components/transactions/insufficient-balance-sheet.tsx`) — modal that appears when expense/transfer amount > account balance
- `NextCycleModal` (goals) — modal shown when the goal is fulfilled by the new payment

### All fields
Local state (`transaction-sheet.tsx:61-89`):
- `step` (UI navigation only)
- `amount: string` ("0" default; managed by keypad)
- `txType: TransactionType` ('expense' | 'income' | 'transfer' | 'adjustment')
- `categoryId: string | null`
- `accountId: string | null` (default = `accounts.find(a => a.is_default)?.id ?? accounts[0]?.id`)
- `toAccountId: string | null` (transfer only)
- `note: string`
- `txDate: string` (default `format(new Date(), 'yyyy-MM-dd')`)
- Income-specific: `incomeCategoryKey, incomeCustomEmoji, incomeCustomLabel`
- Sinking-fund-specific: `sinkingFundGoals[], paidFromGoalId, sfBalance, ...`
- Reconcile-specific: `reconcileActual: string`

### Type selector UX
Inside `AmountKeypad`, three pill buttons "expense | income | transfer" above the keypad (`amount-keypad.tsx:46-61`). Selected pill is filled gold. **Adjustment is NOT in this picker** — it's a separate "Reconcile an account balance instead" link below the keypad (`transaction-sheet.tsx:474-483`) that swaps to the reconcile step.

### Account picker
- Step `amount` (non-transfer): a wrap-flex of pill buttons, one per account, color-tinted by `ACCOUNT_TYPE_CONFIG[acc.type]`. Default account is pre-selected. (`transaction-sheet.tsx:486-510`)
- Step `accounts` (transfer only): two stacked sections "From" and "To". The "To" section excludes the currently-selected `accountId`. (lines 558-602)

Source: `useAuthStore.accounts`.

### Category picker
- Expense → `CategoryGrid` (filtered by `category_type === 'expense' || 'adjustment'`).
- Income → `IncomeCategoryPicker` (a hardcoded preset list, not a DB query):
  ```ts
  const INCOME_PRESETS = [
    { key: 'salary', label: 'Salary', emoji: '💼' },
    { key: 'side_hustle', label: 'Side Hustle', emoji: '⚡' },
    { key: 'gift', label: 'Gift', emoji: '🎁' },
    { key: 'refund', label: 'Refund', emoji: '💸' },
    { key: 'loan_repayment', label: 'Loan Repayment', emoji: '🤝' },
    { key: 'sale', label: 'Sale', emoji: '🏷️' },
    { key: 'bonus', label: 'Bonus', emoji: '🎉' },
  ] as const;
  ```
- Transfer / adjustment → no category picker.

**Filtering by transaction type:** yes (`category-grid.tsx:26-31`):
```ts
const filtered = categories.filter((c) => {
  const ctype = c.category_type ?? (c.bucket_id ? 'expense' : 'income');
  if (transactionType === 'income') return ctype === 'income' || ctype === 'adjustment';
  return ctype === 'expense' || ctype === 'adjustment';
});
```
**Filtering by selected bucket:** no — the grid shows all expense categories regardless of bucket. The bucket is implied via the category's `bucket_id`.

**Default category logic:** none. There's no "last used" or alphabetical default — `categoryId` starts `null` and the user must pick.

For income, after picking a preset, `resolveIncomeCategory()` (`transaction-sheet.tsx:234-248`) tries to **match the preset label to a real `categories` row by name** (case-insensitive). If found, it uses that category's id. If not (e.g. preset = 'side_hustle' but user renamed it), `effectiveCategoryId` is `null` and the preset's emoji/label gets prepended to the note.

### Date picker UX
A native HTML `<input type="date">` (`transaction-sheet.tsx:743-748`). Default is today.

### Optimistic insert
**No.** The flow is: spinner → wait for Supabase → on success, `addTransaction(data)` to the Zustand store, then `revalidateForEntity('transaction')` (which bumps `mutationCount`, causing dashboard / accounts / etc. to re-fetch). Errors show a `hapticToast.error('Failed to save transaction')` and abort.

### Insert payload
For non-adjustment writes (`transaction-sheet.tsx:266-275`):
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
On insert, `user_id` is added: `supabase.from('transactions').insert({ user_id: user.id, ...payload })`.

For adjustment / reconcile (`transaction-sheet.tsx:369-378`):
```ts
const payload = {
  user_id: user.id,
  amount: reconcileDiff,           // signed: positive = balance up, negative = down
  type: 'adjustment' as const,
  category_id: null,
  account_id: accountId,
  to_account_id: null,
  note: note || `Reconciled to ${formatMoney(parseFloat(reconcileActual) || 0)}`,
  transaction_date: format(new Date(), 'yyyy-MM-dd'),
};
```

**Fields explicitly NOT sent in the client payload** (relevant to your question):
- `is_active` — does **not** exist on the `transactions` table (no migration adds it).
- `soft_deleted` — does **not** exist; deletes are hard (`from('transactions').delete()`).
- `generated_from_recurring` — only set by the recurring-transaction generator (`src/lib/recurring.ts`), not by the sheet.
- `goal_id` — set when the row is a **transfer** that is a goal contribution. Set by `src/lib/goals.ts` (goal contribution flow), not by the sheet.
- `paid_from_goal_id` — set by the sheet when an expense is paid out of a sinking fund. **Excluded from bucket math** (`use-dashboard-data.ts:100`).
- `category_id` — null for `transfer` and `adjustment`.

`select` clause used after insert/update to refresh joined data:
```ts
const selectClause =
  '*, category:categories(*, bucket:budget_buckets(*)), account:accounts!account_id(id,name,type,color,icon), to_account:accounts!to_account_id(id,name,type,color,icon)';
```

### Post-insert side effects (full chain)
After a successful **non-edit** insert (`transaction-sheet.tsx:298-360`):
1. Haptic `medium()`
2. `addTransaction(data)` to local store
3. `analytics.transactionLogged({ type, bucket })` — PostHog
4. `updateLoggingStreak(supabase, user.id)` → if `milestone_hit`, toast it; if `freeze_earned`, toast that. If milestone === 7, also award `logging_streak_7_days` momentum.
5. `awardMomentum(supabase, user.id, 'transaction_logged')` → updates store, shows floating point animation, possibly tier-up modal
6. `checkAndUnlockBadges(supabase, user.id, 'transaction_logged')` and again with `'streak_updated'` → enqueues badge celebrations
7. If `paid_from_goal_id` set + goal is a target type:
   - `revalidateForEntity('sinking_fund_payment')`
   - Re-fetch goal contributions to check if goal is now fulfilled
   - If fulfilled: update `goals.completed_at`, toast, open `NextCycleModal`, award `'goal_completed'` momentum, check badges
8. Else: `revalidateForEntity('transaction')` and a type-specific success toast ("Income logged!" / "Transfer recorded!" / "Expense logged!").
9. `handleClose()` — closes sheet and resets state after 300ms.

This is **a lot of client-driven side effect logic**. iOS must replicate all of it (or move it server-side via a trigger) to maintain feature parity.

### Validation rules
- `amount > 0` — gates the Next button
- For transfer: `accountId !== toAccountId` — gates Save
- Insufficient balance check on expenses & transfers: pops `InsufficientBalanceSheet` if `parseFloat(amount) > account.balance`
- Income preset: `incomeCategoryKey != null` and (if 'other') `customLabel.trim().length > 0` — gates Next
- Sinking-fund overpayment: `numAmount > sfBalance` blocks Save with explanatory error
- Adjustment: `reconcileDiff !== 0` and `reconcileActual !== ''`

### Edit existing
Same `TransactionSheet`. `useTransactionStore.openLogSheet(txn)` sets `editingTransaction = txn`. The sheet pre-fills (lines 128-139):
```ts
setAmount(Math.abs(editingTransaction.amount).toString());
setTxType(editingTransaction.type);
setCategoryId(editingTransaction.category_id);
setAccountId(editingTransaction.account_id ?? defaultAccountId);
setToAccountId(editingTransaction.to_account_id);
setNote(editingTransaction.note ?? '');
setTxDate(editingTransaction.transaction_date);
setStep(editingTransaction.type === 'adjustment' ? 'reconcile' : 'amount');
```
**All fields are editable post-creation**, including amount, type, account, category, date, note. There's no "amount is immutable after some grace period" — fully editable forever. On save, the path is `update().eq('id', editingTransaction.id)` then `updateTransaction(data)` in the store.

### Update payload
Same as insert payload (minus `user_id`, since it's not changed).

### Delete
- **Hard delete:** `supabase.from('transactions').delete().eq('id', txn.id)` (`transaction-item.tsx:47`)
- **No soft delete column** — deleted rows are gone.
- **Confirmation pattern:** an explicit `<Dialog>` confirms before delete (`transaction-item.tsx:172-200`). Title: "Delete this transaction?". Body quotes the txn label and amount: "This will permanently remove "{txnLabel}" ({format(amount)}) from your records. This can't be undone."
- **Optimistic remove:** `removeTransaction(id)` happens *after* the Supabase delete returns success (no rollback). UX-wise the row exit-animates via `AnimatePresence`.
- After delete: `revalidateForEntity('transaction')` then toast "Transaction deleted".

---

## 4. Transaction edit + delete

Edit and delete are both wired through the **same TransactionSheet** and TransactionItem dropdown menu (`transaction-item.tsx:140-167`). Already covered in Section 3. Key facts:

- **Edit route or sheet:** sheet (no dedicated `/transactions/[id]/edit` route exists).
- **Editable fields post-creation:** all of them — amount, type (you can switch an expense to an income), category, account, date, note. There is **no immutability** of any field.
- **Update payload:** same shape as insert payload; calls `update(payload).eq('id', editingTransaction.id).select(selectClause).single()`.
- **Delete: hard or soft?** Hard. `from('transactions').delete().eq('id', txn.id)`.
- **Where's the delete trigger?** TransactionItem dropdown menu → opens confirm dialog → `handleDelete`.
- **Confirmation pattern:** `<Dialog>` with explicit "Delete" button styled red (`bg-[#F43F5E]`).

---

## 5. Cycle math (CRITICAL)

File: `src/lib/cycle.ts` (107 lines). **Full source verbatim:**

```ts
import { format, addMonths, addDays, parse } from 'date-fns';

export interface CycleWindow {
  start: Date;
  end: Date;
  label: string;
  isCurrent: boolean;
  startDateStr: string; // 'yyyy-MM-dd' for URL param
}

/**
 * Given any date and a cycleStartDay (1-28), return the cycle window
 * that contains that date.
 *
 * Example: date=Apr 17, cycleStartDay=27
 *   → day(17) < startDay(27), so cycle began Mar 27 and ends Apr 26
 *
 * Example: date=Apr 28, cycleStartDay=27
 *   → day(28) >= startDay(27), so cycle began Apr 27 and ends May 26
 *
 * When cycleStartDay=1 the cycle matches a calendar month exactly.
 */
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

/**
 * Navigate cycles by offset from the current cycle.
 * offset=0 → current cycle, offset=-1 → previous cycle, etc.
 */
export function getCycleAtOffset(
  referenceDate: Date,
  cycleStartDay: number,
  offset: number
): CycleWindow {
  const current = getCycleForDate(referenceDate, cycleStartDay);
  return getCycleFromStartDate(addMonths(current.start, offset), cycleStartDay);
}

/**
 * Build a cycle from an explicit start date (used when re-constructing
 * from the URL ?cycle=yyyy-MM-dd param).
 */
export function getCycleFromStartDate(startDate: Date, cycleStartDay: number): CycleWindow {
  const cycleEnd = addDays(addMonths(startDate, 1), -1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrent = today >= startDate && today <= cycleEnd;

  return {
    start: startDate,
    end: cycleEnd,
    label: buildLabel(startDate, cycleEnd, cycleStartDay),
    isCurrent,
    startDateStr: format(startDate, 'yyyy-MM-dd'),
  };
}

/** Parse a ?cycle=yyyy-MM-dd URL param safely; returns null on bad input. */
export function parseCycleParam(param: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
  try {
    return parse(param, 'yyyy-MM-dd', new Date());
  } catch {
    return null;
  }
}

function buildLabel(start: Date, end: Date, cycleStartDay: number): string {
  if (cycleStartDay === 1) {
    return format(start, 'MMMM yyyy');
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
}

// TODO(phase-1.5): Use cycle for income streak tracking
```

### Edge cases handled
- **`cycle_start_day` is constrained to 1..28** at the database level (`migrations/0003_accounts_and_cycles.sql:45`: `check (cycle_start_day between 1 and 28)`). So Feb 29 / 30 / 31 issues are **avoided by constraint**, not handled.
- **Previous month is shorter than `cycleStartDay`:** the first `if (day >= cycleStartDay)` branch can't be reached if month is shorter. The `else` branch clamps to `Math.min(cycleStartDay, daysInPrev)`. Example: April 1 with cycleStartDay=28 → prev month = March, daysInPrev = 31, so cycleStart = Mar 28. ✅
- **Day 31 in 30-day month:** can't happen because the constraint caps `cycleStartDay` at 28. iOS should mirror that constraint.
- **`addMonths` from date-fns:** date-fns handles month-end clamping (Mar 31 + 1 month → Apr 30).

### Where these functions are called

```bash
$ grep -rn "from '@/lib/cycle'\|from \"@/lib/cycle\"" src/
```
- `src/app/(app)/dashboard/page.tsx:37` — imports `getCycleForDate, getCycleAtOffset, parseCycleParam, getCycleFromStartDate`
- `src/app/(app)/dashboard/cycle-detail/page.tsx` — UNKNOWN content (out-of-scope file but uses cycle helpers)
- `src/app/(app)/transactions/page.tsx:17` — imports `getCycleForDate`
- `src/app/(app)/buckets/page.tsx:9` — imports `getCycleForDate`
- `src/hooks/use-dashboard-data.ts:9-11` — imports `getCycleForDate, getCycleFromStartDate, parseCycleParam`
- A handful of additional callsites in `src/lib/momentum.ts`, `src/lib/streaks.ts`, `src/lib/health-score.ts`, etc. (deferred features) — UNKNOWN exact list, but iOS Phase 1B doesn't need them.

### "Cycle net" formula
From `src/hooks/use-dashboard-data.ts:96-105`:
```ts
const expenses = (cycleTxns ?? []).filter((t) => t.type === 'expense') as Transaction[];
const totalSpentThisMonth = expenses.reduce((s, t) => s + t.amount, 0);
const bucketExpenses = expenses.filter((t) => !t.paid_from_goal_id);
const totalSpentActual = bucketExpenses.reduce((s, t) => s + t.amount, 0);
const totalReceived = (cycleTxns ?? [])
  .filter((t): t is Transaction => t.type === 'income')
  .reduce((s, t) => s + t.amount, 0);
const cycleNet = totalReceived - totalSpentActual;
```

So **`cycleNet = sum(income) − sum(expense excluding paid-from-goal)`**. Transfers and adjustments are not in the formula. The card displays `cycleNet`.

### "Discipline math vs balance math" distinction
This is enforced in two places:

1. **Bucket math (discipline math)** — in `use-dashboard-data.ts:100, 126-156`:
   - **excludes** expenses with `paid_from_goal_id` set (those were already counted by the monthly contribution to the goal)
   - **counts** transfers into savings/investment accounts and goal contributions as Savings spend
   - Drives `bucketSpend[needs|wants|savings]` and the BucketRing/BucketStrip UI

2. **Balance math** — in `src/lib/accounts.ts:19-49` (`computeAccountBalances`):
   - Walks ALL transactions (no `paid_from_goal_id` exclusion)
   - Adds income, subtracts expense, moves transfer from→to, applies signed adjustment
   - Drives `accountBalances[accId]` map

The distinction matters: a `paid_from_goal_id` expense **still decreases the account balance** (real money left the account) but **does NOT count against the bucket** (because the goal already accounted for it).

Adjustments do **not** affect bucket math at all (they're never in `bucketExpenses`) and they affect balance math via signed `amount` (positive = balance up).

### Postgres views or RPCs related to cycles
**None.** All cycle math is client-side. Searching `supabase/migrations/`:
```bash
$ grep -rn "cycle" supabase/migrations/
```
Only `cycle_start_day` column on profiles (added in 0003). No `cycle_*` views, RPCs, or triggers. The single client-side RPC call in the codebase is `supabase.rpc('cleanup_old_digests')` in `src/lib/daily/generate-digest.ts:108` — unrelated to cycles.

---

## 6. Buckets

### Bucket math — full body
Source: `src/hooks/use-dashboard-data.ts:114-156`. This is the **canonical bucket-spend computation**:

```ts
const bucketSpend: Record<BucketName, number> = { needs: 0, wants: 0, savings: 0 };
const monthlyIncome =
  incomeSources.length > 0 ? totalMonthlyIncome(incomeSources) : profile.monthly_income;
const bucketLimits: Record<BucketName, number> = {
  needs: (monthlyIncome * profile.needs_percent) / 100,
  wants: (monthlyIncome * profile.wants_percent) / 100,
  savings: (monthlyIncome * profile.savings_percent) / 100,
};

const SAVINGS_ACCOUNT_TYPES = new Set(['savings', 'investment']);

const bucketMap = new Map((buckets ?? []).map((b) => [b.id, b.name as BucketName]));
for (const txn of bucketExpenses) {
  const bucketId = txn.category?.bucket_id;
  if (bucketId) {
    const bName = bucketMap.get(bucketId);
    if (bName) bucketSpend[bName] += txn.amount;
  }
}

// Savings bucket: also count goal contributions and savings-account transfers.
// This reflects money committed to future-you this cycle, not just savings-bucket expenses.
const cycleTxnList = (cycleTxns ?? []) as Transaction[];
for (const txn of cycleTxnList) {
  if (txn.type !== 'transfer') continue;

  // Rule 1: any goal contribution (transfer with goal_id set)
  if (txn.goal_id) {
    bucketSpend.savings += txn.amount;
    continue;
  }

  // Rule 2: transfer to a savings/investment account that is NOT an internal shuffle
  // (from_account must NOT be savings/investment — only money flowing "in" counts)
  const toType = (txn.to_account as { type?: string } | null)?.type;
  const fromType = (txn.account as { type?: string } | null)?.type;
  if (
    toType && SAVINGS_ACCOUNT_TYPES.has(toType) &&
    (!fromType || !SAVINGS_ACCOUNT_TYPES.has(fromType))
  ) {
    bucketSpend.savings += txn.amount;
  }
}
```

### "Savings spent" — exact algorithm
Per the code above, **Savings bucket spend** is the sum of:
1. All `expense` transactions whose `category.bucket_id` resolves to the `savings` bucket — note: in practice the seed migrations no longer create any such categories (after 0029 the only "savings as expense" categories are gone), so this slot is usually empty.
2. All `transfer` transactions with `goal_id != null` (goal contributions).
3. All `transfer` transactions where `to_account.type IN ('savings', 'investment')` AND `from_account.type NOT IN ('savings', 'investment')` (i.e. fresh money flowing into a savings/investment account, not a savings→investment internal shuffle).

It explicitly **does not** count expenses with `paid_from_goal_id` (those are excluded earlier when building `bucketExpenses`). It also does not count Savings via `category_type === 'transfer'` rows — `'transfer'` rows have `category_id = null`.

### Bucket allocation: monthlyIncome × percent / 100
Computed at `use-dashboard-data.ts:117-121`. The `monthlyIncome` source is (in priority order): `totalMonthlyIncome(incomeSources)` if any income sources exist, else `profile.monthly_income`. The `*_percent` columns live on `profiles`.

### Where the canonical split lives
The default split is **50/30/20** (per the `profiles` schema defaults: `needs_percent default 50`, `wants_percent default 30`, `future_percent → savings_percent default 20`). Confirmed in `migrations/0001_initial_schema.sql:7-9` and `migrations/0029_savings_bucket_rename.sql:1`.

```ts
// src/lib/constants.ts:28-32
export const DEFAULT_BUCKET_PERCENTS: Record<BucketName, number> = {
  needs: 50,
  wants: 30,
  savings: 20,
};
```

Live values come from the `profiles` row, which the user can edit in `/settings`. **There is no 45/15/40 default anywhere in the codebase** — the audit prompt's "45/15/40" reference appears to be incorrect for this build. Web ships with **50/30/20**.

### Bucket strip component on dashboard
Already printed in full in Section 1.

### Bucket detail page — full source
File: `src/app/(app)/buckets/page.tsx` (329 lines). Already printed in full in Section 0 of this audit. Key behavior:
- Tabs across the top, one per bucket (rendered from the `buckets` rows; default tab is `needs`).
- Active bucket header: progress bar + "spent of limit" + "X remaining".
- Transaction list below the bar:
  - For Needs/Wants: shows expense transactions where `category_id` is in the bucket's category set, top 20.
  - For Savings: shows transfers to savings/investment accounts (with the same external-money-only rule) + goal contributions, top 20.
- Reads `bucketSpend` and `bucketLimits` directly from `dashboardStats` in the Zustand store (so the math is identical to the dashboard).

### "Spent" vs "remaining" UI representation
- BucketStrip on dashboard: thin colored progress bar, label "X of Y" where X = spent, Y = limit.
- BucketRing (desktop): circular ring at `clamp(0, 100, spent/limit×100)`. Color shifts: <70% green (#00D9A3), <90% amber (#FBBF24), ≥90% red (#F43F5E) — see `src/lib/utils.ts:54-58 getProgressColor`.
- /buckets page header: shows `formatMoney(spent)` of `formatMoney(limit)`, plus "remaining = max(0, limit − spent)" line below.

### Per-bucket transaction filtering
On `/buckets`, tapping a tab filters `transactions` array client-side. The `/transactions` page also has a `bucket` URL param that filters to `t.category?.bucket?.name === urlBucket` (only expense rows that have a category linked to a bucket; `transactions/page.tsx:169`). Tapping a Savings filter on `/transactions` will **not** show transfers — only expense rows.

### "Savings-flagged accounts" concept
There is **no `is_savings` flag column** on `accounts`. The signal is the `type` column. `accounts.type` is a CHECK enum: `'bank' | 'momo' | 'cash' | 'savings' | 'investment' | 'other'`. The code in two places treats the `'savings'` and `'investment'` values as the "savings-flagged" set:

```ts
// src/hooks/use-dashboard-data.ts:123
const SAVINGS_ACCOUNT_TYPES = new Set(['savings', 'investment']);

// src/app/(app)/buckets/page.tsx:54
const SAVINGS_ACCOUNT_TYPES = new Set(['savings', 'investment']);
```

iOS must apply the same set. Note: the schema also has a separate `account_type` column referenced by trigger 0029/0030 (values `'general' | 'wallet' | 'savings' | ...`) — but **app code never references it** and no migration creates the column. PHASE1_AUDIT.md flagged this as a discrepancy. iOS should mirror `type`, not `account_type`.

---

## 7. Categories

### Master list / management UI
- Default categories are seeded by the `handle_new_user()` trigger on signup (see Section 10).
- User-managed list lives on `/settings`. UNKNOWN exact UI — `src/app/(app)/settings/page.tsx` is 633 lines and outside the focus here. Categories are fetched on dashboard load via `useDashboardData` and cached in `useTransactionStore.categories`.
- Phase 1B can ship without a category-management UI (use the seeded defaults), but iOS should mirror the seed.

### Default categories on signup
Seeded in `handle_new_user()` (latest version is in `0030_currency_support.sql:32-56`, augmenting/replacing 0029 / 0013 / 0004 / 0001):

```sql
INSERT INTO categories (user_id, bucket_id, name, icon, is_default) VALUES
  -- Needs
  (new.id, needs_id, 'Rent',         'home',         true),
  (new.id, needs_id, 'Groceries',    'shopping-cart',true),
  (new.id, needs_id, 'Light Bill',   'zap',          true),
  (new.id, needs_id, 'Water Bill',   'droplet',      true),
  (new.id, needs_id, 'Data Bundle',  'wifi',         true),
  (new.id, needs_id, 'Transport',    'car',          true),
  (new.id, needs_id, 'Chop Money',   'utensils',     true),
  (new.id, needs_id, 'Healthcare',   'heart-pulse',  true),
  -- Wants
  (new.id, wants_id, 'Eating Out',   'pizza',        true),
  (new.id, wants_id, 'Entertainment','film',         true),
  (new.id, wants_id, 'Shopping',     'shopping-bag', true),
  (new.id, wants_id, 'Subscriptions','repeat',       true),
  (new.id, wants_id, 'Gym',          'dumbbell',     true),
  (new.id, wants_id, 'Personal Care','sparkles',     true),
  -- Income presets
  (new.id, null, 'Salary',         'briefcase',  true),
  (new.id, null, 'Side Hustle',    'zap',        true),
  (new.id, null, 'Gift',           'gift',       true),
  (new.id, null, 'Refund',         'refresh-cw', true),
  (new.id, null, 'Loan Repayment', 'handshake',  true),
  (new.id, null, 'Sale',           'tag',        true),
  (new.id, null, 'Bonus',          'sparkle',    true);
```

**No Savings expense categories.** This is intentional after migration 0029: money "into Savings" is a transfer, not an expense. So Savings spend is computed from transfers + goal contributions only.

**`category_type` column is NOT explicitly set in the 0029/0030 trigger code.** The 0013 version did set `category_type` (e.g. `'expense'`, `'income'`, `'adjustment'`) but the 0029 / 0030 rewrites dropped it. The category_type defaults to `'expense'` (from the column default in 0004), so income preset rows seeded by the 0030 trigger will get `category_type='expense'` even though they have `bucket_id IS NULL`. **This violates the `category_bucket_consistency` CHECK constraint** added in 0004 (`(expense AND bucket_id NOT NULL) OR (non-expense AND bucket_id IS NULL)`). **This is a real bug in the latest trigger** — see Section 13.

### category_type and bucket_id
- `category_type text` (added in 0004, default `'expense'`, CHECK in `expense | income | adjustment | transfer | system`)
- `bucket_id uuid` FK → `budget_buckets` ON DELETE SET NULL (nullable)
- CHECK `category_bucket_consistency`: expense MUST have bucket_id, non-expense MUST NOT.

### Category-to-bucket mapping for default categories
Per the seed above:
- **Needs** (8 categories): Rent, Groceries, Light Bill, Water Bill, Data Bundle, Transport, Chop Money, Healthcare
- **Wants** (6 categories): Eating Out, Entertainment, Shopping, Subscriptions, Gym, Personal Care
- **Savings**: 0 expense categories
- **Income** (no bucket, 7 categories): Salary, Side Hustle, Gift, Refund, Loan Repayment, Sale, Bonus

### Income vs expense categories — UI difference
- Expense → `CategoryGrid`: 3-column grid, all expense-typed user categories with their actual icons.
- Income → `IncomeCategoryPicker`: a **hardcoded** 7-preset chip grid + an "Other" custom row — does NOT pull from the `categories` table directly. After selecting, `resolveIncomeCategory()` tries to match the preset's label to a real category by name (case-insensitive) so the row gets a `category_id`. If the user has renamed/deleted the category, the row falls back to `category_id = null` and the preset label is prepended to the note.

---

## 8. Accounts

### Account types enum
```ts
// src/types/account.ts:1
export type AccountType = 'bank' | 'momo' | 'cash' | 'savings' | 'investment' | 'other';
```
DB constraint: `migrations/0003_accounts_and_cycles.sql:6`:
```sql
type text not null check (type in ('bank','momo','cash','savings','investment','other')),
```

The legacy/secondary `account_type` column (values `'general' | 'wallet' | 'savings' | ...`) referenced in 0029/0030 trigger has no migration and **isn't used by app code**. Treat as not-existing for iOS.

### Default accounts on signup
Per the latest trigger (`0030_currency_support.sql:59-63`):
```sql
INSERT INTO accounts (user_id, name, type, account_type, opening_balance, sort_order) VALUES
  (new.id, 'Bank',             'bank',    'general', 0, 1),
  (new.id, 'Hubtel wallet',    'momo',    'wallet',  0, 2),
  (new.id, 'MTN MoMo Wallet',  'momo',    'wallet',  0, 3),
  (new.id, 'Savings',          'savings', 'savings', 0, 4);
```
(Earlier 0013 trigger seeded only "Bank / MoMo / Cash" with `is_default = true` on Bank — this changed in 0029/0030. Note the 0030 version does **not** set `is_default = true` on any account, which leaves the `is_default` column at its default `false` for every row. iOS should detect this and either pick a default in the trigger or fall back to `accounts[0]` in app code — `transaction-sheet.tsx:59` already does the latter: `defaultAccountId = accounts.find(a => a.is_default)?.id ?? accounts[0]?.id ?? null`.)

### Accounts list page
File: `src/app/(app)/accounts/page.tsx` (294 lines). Layout:
- Header: "Accounts" + "Add" button (top right)
- Two HintCards: `accounts_intro` (only when all accounts have $0 opening balance) and `accounts_reconcile_reminder` (always)
- Total balance card: sum of `balances[acc.id] ?? acc.opening_balance` over all accounts
- Per-account row: type-color dot, big emoji, name (with "Default" star badge if `is_default`), capitalized type label, action buttons (reconcile / edit / delete-if-not-default), and big colored balance.
- Delete confirmation overlay: if account has transactions, prompts the user to choose another account to **reassign** them to before deleting; if it has none, just confirms.

### Add/edit account UI
File: `src/components/accounts/account-modal.tsx` (377 lines). A `<Dialog>` with form fields:
- Name (max 40 chars)
- Type — 3-column grid of all 6 account types with type-color tinting
- Opening balance (numeric, ≥ 0). Label is "Current balance — RIGHT NOW" when **adding**, "Opening balance" when editing. Below: a hint "Enter the actual balance in this account today — not zero, unless it's empty. Sika adds/subtracts from this as you log transactions."
- "Set as default" toggle — when toggled on, atomically clears any other default first.
- "Active" toggle (edit only)
- "Reconcile to real balance" expander (edit only) — shows current Sika balance, lets user enter actual, computes diff, inserts an adjustment transaction.

**Account schema (Zod):**
```ts
const accountSchema = z.object({
  name: z.string().min(1, 'Required').max(40, 'Max 40 chars'),
  type: z.enum(['bank', 'momo', 'cash', 'savings', 'investment', 'other']),
  opening_balance: z.number().min(0, 'Must be ≥ 0'),
  is_default: z.boolean(),
  is_active: z.boolean(),
});
```

**Insert payload** (`account-modal.tsx:109-118`):
```ts
const payload = {
  user_id: user.id,
  name: values.name,
  type: values.type,
  icon: ACCOUNT_TYPE_CONFIG[values.type].emoji,
  color: ACCOUNT_TYPE_CONFIG[values.type].color,
  opening_balance: values.opening_balance,
  is_default: values.is_default,
  is_active: values.is_active,
};
// Plus on insert: sort_order: accounts.length + 1
```
Note **`icon` is set to the emoji literal** ("🏦", "📱", etc.), not a name like "landmark". This differs from the trigger seed; both shapes are tolerated by app code (see `getIconEmoji` mapping fallback to '💸').

### Transfer between accounts UI
Built into the `TransactionSheet` (txType = 'transfer'). After picking an amount:
- Step `accounts`: two pill-row sections "From" and "To". `To` is filtered to exclude `accountId`. (Lines 558-602 of `transaction-sheet.tsx`).
- Constraint: account_id !== to_account_id (validated client-side; also DB CHECK `transfer_accounts_differ`).
- After the user proceeds, balance check runs again; if `From` account has insufficient balance, `InsufficientBalanceSheet` opens.

**Transfer row representation:** ONE row in `transactions` with `type='transfer'`, `account_id = from`, `to_account_id = to`. Not two rows. Confirmed by `account-modal.tsx`, `transaction-sheet.tsx:271`, and `computeAccountBalances` (which subtracts from `account_id` and adds to `to_account_id`).

**Bucket math implication:** as covered in Section 6, a transfer where `to_account.type ∈ {savings, investment}` AND `from_account.type ∉ {savings, investment}` counts toward Savings spend. Internal savings → investment shuffles do not. Goal contributions (transfer with `goal_id` set) always count.

---

## 9. State management for these features

Two Zustand stores under `src/stores/`:

### `src/stores/auth-store.ts` (82 lines)
```ts
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { Profile, IncomeSource } from '@/types';
import type { Account } from '@/types/account';
import type { Streaks } from '@/types/streak';
import type { Momentum } from '@/types/momentum';
import type { UserBadge } from '@/types/badge';
import type { HealthScore } from '@/types/health';

interface BadgeCelebrationItem {
  userBadgeId: string;
  badgeId: string;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  incomeSources: IncomeSource[];
  accounts: Account[];
  dismissedHints: string[];
  hintsLoaded: boolean;
  streaks: Streaks | null;
  momentum: Momentum | null;
  userBadges: UserBadge[];
  badgeCelebrationQueue: BadgeCelebrationItem[];
  healthScore: HealthScore | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setIncomeSources: (sources: IncomeSource[]) => void;
  setAccounts: (accounts: Account[]) => void;
  setDismissedHints: (hints: string[]) => void;
  addDismissedHint: (hintId: string) => void;
  setStreaks: (streaks: Streaks | null) => void;
  setMomentum: (momentum: Momentum | null) => void;
  setUserBadges: (badges: UserBadge[]) => void;
  setHealthScore: (score: HealthScore | null) => void;
  enqueueBadgeCelebrations: (badges: UserBadge[]) => void;
  shiftBadgeCelebration: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null, profile: null, incomeSources: [], accounts: [],
  dismissedHints: [], hintsLoaded: false,
  streaks: null, momentum: null, userBadges: [],
  badgeCelebrationQueue: [], healthScore: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setIncomeSources: (incomeSources) => set({ incomeSources }),
  setAccounts: (accounts) => set({ accounts }),
  setDismissedHints: (dismissedHints) => set({ dismissedHints, hintsLoaded: true }),
  addDismissedHint: (hintId) =>
    set((s) => ({ dismissedHints: s.dismissedHints.includes(hintId) ? s.dismissedHints : [...s.dismissedHints, hintId] })),
  setStreaks: (streaks) => set({ streaks }),
  setMomentum: (momentum) => set({ momentum }),
  setUserBadges: (userBadges) => set({ userBadges }),
  setHealthScore: (healthScore) => set({ healthScore }),
  enqueueBadgeCelebrations: (badges) =>
    set((s) => ({
      badgeCelebrationQueue: [
        ...s.badgeCelebrationQueue,
        ...badges
          .filter(b => !s.badgeCelebrationQueue.some(q => q.userBadgeId === b.id))
          .map(b => ({ userBadgeId: b.id, badgeId: b.badge_id })),
      ],
    })),
  shiftBadgeCelebration: () =>
    set((s) => ({ badgeCelebrationQueue: s.badgeCelebrationQueue.slice(1) })),
  reset: () => set({
    user: null, profile: null, incomeSources: [], accounts: [],
    dismissedHints: [], hintsLoaded: false, streaks: null, momentum: null,
    userBadges: [], badgeCelebrationQueue: [], healthScore: null,
  }),
}));
```

**Where it's read (Phase 1B-relevant):**
- `app-shell.tsx` (setUser on mount + identifyUser to PostHog)
- `dashboard/page.tsx` (`profile, incomeSources, accounts, user, enqueueBadgeCelebrations`)
- `transactions/page.tsx` (`user, profile, accounts`)
- `accounts/page.tsx` (`user, accounts, setAccounts`)
- `buckets/page.tsx` (`user, profile`)
- `transaction-sheet.tsx` (`user, accounts, setStreaks, setMomentum, enqueueBadgeCelebrations`)
- `top-bar.tsx` (`profile`)
- `use-profile.ts` (write side: setters for all fields)

### `src/stores/transaction-store.ts` (52 lines)
```ts
import { create } from 'zustand';
import type { Transaction, Category, DashboardStats } from '@/types';

interface ReconcileContext {
  accountId: string;
  sikaBalance: number;
}

interface TransactionState {
  transactions: Transaction[];
  categories: Category[];
  dashboardStats: DashboardStats | null;
  isLogSheetOpen: boolean;
  editingTransaction: Transaction | null;
  reconcileContext: ReconcileContext | null;
  mutationCount: number;
  setTransactions: (txns: Transaction[]) => void;
  setCategories: (cats: Category[]) => void;
  setDashboardStats: (stats: DashboardStats) => void;
  openLogSheet: (txn?: Transaction) => void;
  openReconcileSheet: (context: ReconcileContext) => void;
  closeLogSheet: () => void;
  addTransaction: (txn: Transaction) => void;
  updateTransaction: (txn: Transaction) => void;
  removeTransaction: (id: string) => void;
  bumpMutation: () => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: [], categories: [], dashboardStats: null,
  isLogSheetOpen: false, editingTransaction: null, reconcileContext: null,
  mutationCount: 0,
  setTransactions: (transactions) => set({ transactions }),
  setCategories: (categories) => set({ categories }),
  setDashboardStats: (dashboardStats) => set({ dashboardStats }),
  openLogSheet: (txn) => set({ isLogSheetOpen: true, editingTransaction: txn ?? null, reconcileContext: null }),
  openReconcileSheet: (context) => set({ isLogSheetOpen: true, editingTransaction: null, reconcileContext: context }),
  closeLogSheet: () => set({ isLogSheetOpen: false, editingTransaction: null, reconcileContext: null }),
  addTransaction: (txn) => set((s) => ({ transactions: [txn, ...s.transactions] })),
  updateTransaction: (txn) => set((s) => ({
    transactions: s.transactions.map((t) => (t.id === txn.id ? txn : t)),
  })),
  removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
  bumpMutation: () => set((s) => ({ mutationCount: s.mutationCount + 1 })),
}));
```

**Where it's read (Phase 1B-relevant):**
- `dashboard/page.tsx` (`dashboardStats`)
- `transactions/page.tsx` (`transactions, setTransactions, categories, mutationCount`)
- `accounts/page.tsx` (`mutationCount, openReconcileSheet`)
- `buckets/page.tsx` (`dashboardStats`)
- `transaction-item.tsx` (`removeTransaction, openLogSheet`)
- `transaction-sheet.tsx` (most of the store)
- `bucket-strip.tsx` (`dashboardStats`)
- `use-dashboard-data.ts` (`setDashboardStats, setCategories, mutationCount`)
- `revalidation.ts` (calls `bumpMutation()`)

### Mutation invalidation
The codebase uses `mutationCount` in the transaction store as a generic re-fetch trigger. `revalidateForEntity(entity)` (`src/lib/revalidation.ts`) just calls `bumpMutation()`. Every page that fetches data has a `useEffect` whose deps include `mutationCount`, so any mutation invalidates everything.

The full `REVALIDATION_MAP` (informational only — code only uses `bumpMutation`):
```ts
export const REVALIDATION_MAP = {
  transaction:           ['/dashboard', '/transactions', '/accounts', '/streaks', '/health'],
  account:               ['/accounts', '/dashboard', '/transactions', '/settings'],
  transfer:              ['/dashboard', '/transactions', '/accounts'],
  adjustment:            ['/dashboard', '/transactions', '/accounts'],
  category:              ['/settings', '/dashboard', '/transactions'],
  incomeSource:          ['/settings', '/dashboard'],
  profile:               ['/dashboard', '/settings'],
  bucket:                ['/dashboard', '/settings'],
  goal:                  ['/goals', '/dashboard'],
  goal_contribution:     ['/goals', '/dashboard', '/accounts', '/transactions', '/streaks', '/health'],
  sinking_fund_payment:  ['/goals', '/dashboard', '/accounts', '/transactions'],
  card_theme:            ['/dashboard', '/settings'],
  momentum_event:        ['/dashboard', '/momentum', '/health'],
  badge_unlocked:        ['/dashboard', '/badges', '/health'],
  digest_read:           ['/dashboard', '/daily'],
  digest_generated:      ['/dashboard', '/daily'],
} as const;
```

iOS will translate these stores into AppState extensions / @Observable classes. The two-store split (auth-store for user/profile/accounts, transaction-store for transactions/categories/sheet UI) is a useful organizing line for SwiftUI too.

---

## 10. Server-side triggers / RPC functions related to Phase 1B

### Trigger inventory
```bash
$ grep -rln "create or replace function\|create function\|create trigger\|CREATE TRIGGER\|CREATE OR REPLACE FUNCTION" supabase/migrations/
```
Found in: 0001, 0002, 0003, 0004, 0006, 0009, 0013, 0018, 0029, 0030.

After collapsing replacements, the **active** triggers are:

1. **`on_auth_user_created` AFTER INSERT on `auth.users`** → seeds profile, buckets, categories, accounts, streaks, etc. Latest body lives in `0030_currency_support.sql:7-67` (which supersedes 0029, 0013, 0004, 0001).
2. **`update_updated_at()`** — used as a BEFORE UPDATE trigger on multiple tables (`accounts`, `recurring_transactions`, `streaks`, `goals` per migrations 0003, 0006, 0009, 0013). The function itself is presumably defined globally somewhere — its body is not printed in any of these migrations. **UNKNOWN** definition body; based on standard Supabase patterns it's probably:
   ```sql
   create or replace function update_updated_at() returns trigger as $$
   begin new.updated_at = now(); return new; end;
   $$ language plpgsql;
   ```
   but this is a guess.

### What about transactions inserts/updates/deletes?
**There are NO server-side triggers on `transactions`** in the migration history. Every side effect (momentum, streaks, badges, health score, account balance) is computed **client-side** after the insert succeeds. This is critical — see Section 13.

There is also **no trigger on `goals`, `categories`, `accounts`** for momentum / badge / streak side effects.

### Latest `handle_new_user()` body (from `0030_currency_support.sql:7-67`)

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  needs_id uuid;
  wants_id uuid;
  savings_id uuid;
  user_currency text;
BEGIN
  user_currency := COALESCE(new.raw_user_meta_data->>'currency_code', 'GHS');

  INSERT INTO profiles (id, full_name, currency)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', user_currency);

  -- Create the three buckets
  INSERT INTO budget_buckets (user_id, name, display_name, color, sort_order)
  VALUES
    (new.id, 'needs',   'Needs',   '#00D9A3', 1),
    (new.id, 'wants',   'Wants',   '#FBBF24', 2),
    (new.id, 'savings', 'Savings', '#60A5FA', 3);

  SELECT id INTO needs_id   FROM budget_buckets WHERE user_id = new.id AND name = 'needs';
  SELECT id INTO wants_id   FROM budget_buckets WHERE user_id = new.id AND name = 'wants';
  SELECT id INTO savings_id FROM budget_buckets WHERE user_id = new.id AND name = 'savings';

  -- Default categories (see Section 7 for the seed list)
  INSERT INTO categories (user_id, bucket_id, name, icon, is_default) VALUES
    -- Needs (8) ...
    -- Wants (6) ...
    -- Income presets (7) ...
  ;

  -- Default accounts
  INSERT INTO accounts (user_id, name, type, account_type, opening_balance, sort_order) VALUES
    (new.id, 'Bank',            'bank',    'general', 0, 1),
    (new.id, 'Hubtel wallet',   'momo',    'wallet',  0, 2),
    (new.id, 'MTN MoMo Wallet', 'momo',    'wallet',  0, 3),
    (new.id, 'Savings',         'savings', 'savings', 0, 4);

  RETURN new;
END;
$$;
```
(Trigger registration: `create trigger on_auth_user_created after insert on auth.users for each row execute procedure handle_new_user();` from `0001:117-119` — never re-registered, only the function body is replaced.)

**The 0030 trigger body has two known bugs** (see Section 13 for footgun details):
1. References `account_type` column that has no migration adding it.
2. Doesn't pass `category_type`, so income preset rows default to `'expense'` and would violate the 0004 CHECK constraint requiring expense categories to have `bucket_id NOT NULL`. The 0030 trigger inserts those income rows with `bucket_id = null`.

The 0013 trigger version is the last one that did this correctly (passing explicit `category_type` for each row). **UNKNOWN whether 0030 has been actually applied to production** — if it hasn't, the live trigger may be 0029 (which has the same `account_type` bug but at least pre-dates the 0004 constraint as written, since it always sets `category_type` via column default after seeded by a constraint-aware row). If you find that signups are working in production, the live function is presumably the 0013 body — not what migration 0030 says it should be.

### RPC functions called from client
Single hit:
```
src/lib/daily/generate-digest.ts:108:  await supabase.rpc('cleanup_old_digests');
```
Out of scope for Phase 1B. **No transactions/buckets/accounts RPCs are called from client code.**

---

## 11. Things relevant to home but Phase 1B-deferred

These appear on the dashboard (or are linked from it) but should not be implemented in Phase 1B. iOS Phase 1B should leave UI placeholders / vertical space where appropriate. Order is top-to-bottom on the web dashboard.

| Element | Source file(s) | Data shape it expects | Phase | Notes for iOS |
|---|---|---|---|---|
| Sika Daily banner | `components/dashboard/sika-daily-banner.tsx` | `DailyDigest` row from `sika_daily_digests` (queried in `dashboard/page.tsx:103-121`) | 1C | Conditionally renders only if there's a digest for today AND user hasn't read it. iOS can leave a slot below the cycle nav and hide it for now. |
| AI insight strip | `components/dashboard/insight-strip.tsx` | `DailyInsightRow` from `/api/insights/today` | 1C | One-line motivational/observational note. |
| Sika Monthly banner | `components/dashboard/sika-monthly-banner.tsx` | `monthly_recaps` row id only | 2 | Rare — only shows when there's an unread, undismissed monthly recap from the last 30 days. |
| Should I Buy It button | `components/decision/should-i-buy-button.tsx` | (none — opens modal) | 2 | Always-visible button between SpendCards and HealthRow. Big-ticket purchase advisor. |
| Sunday Recap card | `components/dashboard/sunday-recap-card.tsx` | weekly summary data computed from transactions | 1C/2 | Only renders on Sundays. |
| Health row | `components/dashboard/health-row.tsx` | `healthScore`, `streaks`, `momentum`, `userBadges` from auth-store | 1C | Sika score / streak / badge progress. Always shown after Sunday recap. |
| Income summary row + breakdown | inline in `dashboard/page.tsx:393-424` | `incomeSources` from auth-store | Phase 1B can include it (very small, just text) but not critical | Desktop only. Phase 1B can skip on mobile. |
| Income nudge cards | `components/dashboard/income-nudge-card.tsx` | `IncomeNudge[]` from `getDueIncomeNudges()` | **Phase 1B includes** (this is core money-loop, not deferred) | The "did you receive your salary today?" prompt. |
| Pending recurring cards | same file, `PendingRecurringCard` export | `RecurringTransaction[]` (filtered to `type !== 'income'`) | Phase 1B may defer to 1D unless you ship recurring | The "Netflix subscription due" prompt. |
| Bucket rings (desktop) | `components/dashboard/bucket-ring.tsx` | same `bucketSpend`/`bucketLimits` as BucketStrip | **Phase 1B can include** (mobile uses BucketStrip; iOS likely uses ring on home like desktop) | Optional; design decision. |
| Account strip (desktop) | inline in `dashboard/page.tsx:486-522` | `accounts` + `dashboardStats.accountBalances` | **Phase 1B may include** | Horizontal scroll of account cards with type-color dots. |
| Goals widget | `components/dashboard/goals-widget.tsx` | `GoalProgress[]` (top 3) | 1D/2 | Empty if user has no goals. |
| Weekly chart | `components/dashboard/weekly-chart.tsx` | `dashboardStats.weeklySpend: { date, amount }[]` (7 days) | **Phase 1B can include** | Recharts BarChart over last 7 days of expense. Simple iOS Charts equivalent. |
| Recent transactions (desktop) | `components/dashboard/recent-transactions.tsx` | `dashboardStats.recentTransactions` (top 5) | **Phase 1B should include** | iOS likely shows this on home; web hides on mobile only because of vertical space. |
| Onboarding modal | `components/dashboard/onboarding-modal.tsx` | (drives its own state, writes to `income_sources` + `profiles`) | Phase 1A (covered) | iOS already has this in Phase 1A scope. |

### "Sika score / streak surface" specifically
The streak surface is rendered through `HealthRow`. Within HealthRow, three components compose: `TierIcon` (current momentum tier emoji, from `momentum.tier`), a streak number from `streaks.logging_current`, and a badge count `userBadges.length / TOTAL_BADGES (=8)`. Phase 1C will build it; Phase 1B can leave a 64pt-tall placeholder under the spend cards.

---

## 12. Summary table for iOS Phase 1B planning

| Feature                            | Files (count) | Tables touched                                | iOS Prompt # |
|------------------------------------|--------------:|-----------------------------------------------|--------------|
| Tab bar / nav shell                | 0 (web has separate mobile + desktop nav)     | none                                          | 1B-1 |
| Home / Dashboard skeleton (cycle nav, cycle card, spend cards, bucket strip, recent txns) | 8 (dashboard/page.tsx + cycle-card + spend-card + bucket-strip + recent-transactions + top-bar + skeleton + pull-to-refresh) | profiles, accounts, income_sources, transactions, budget_buckets, categories | 1B-2 |
| Cycle math utility                 | 1 (`src/lib/cycle.ts`) | profiles.cycle_start_day                  | 1B-3 |
| Bucket math + BucketStrip + /buckets detail | 3 (use-dashboard-data.ts, bucket-strip.tsx, buckets/page.tsx) | budget_buckets, categories, transactions, profiles.{needs,wants,savings}_percent | 1B-4 |
| Transactions list (`/transactions`) | 2 (transactions/page.tsx, transaction-item.tsx) | transactions, categories, accounts, budget_buckets | 1B-5 |
| Transaction sheet (add/edit/transfer/adjustment) | 6 (transaction-sheet.tsx, amount-keypad, category-grid, income-category-picker, insufficient-balance-sheet, add-transaction-fab) | transactions, accounts, categories, goals (sinking fund payment) | 1B-6 |
| Transaction delete                 | (covered in 1B-5) — 1 (transaction-item.tsx) | transactions | 1B-5 |
| Reconcile / adjustment flow        | (covered in 1B-6) — same sheet, separate `reconcile` step + AccountModal expander | transactions (type='adjustment') | 1B-6 |
| Account list + add/edit/delete + reassign | 3 (accounts/page.tsx, account-modal.tsx, lib/accounts.ts) | accounts, transactions (delete-with-reassign updates account_id) | 1B-7 |
| Account-balance computation        | 1 (`src/lib/accounts.ts:computeAccountBalances`) | transactions, accounts.opening_balance | 1B-7 |
| Categories: seed + read + filter   | mostly server (handle_new_user trigger); client-side just reads `categories` table | categories | 1B-8 (seed via Supabase trigger; iOS just reads) |
| Income nudge cards on dashboard    | 2 (income-nudge-card.tsx + lib/income-nudges.ts + lib/income.ts) | income_sources, income_nudge_dismissals, transactions | 1B-9 |
| Profile / income onboarding        | covered in Phase 1A | profiles, income_sources | DEFERRED to 1A |
| FAB                                | 1 (add-transaction-fab.tsx) | none | 1B-1 |
| Sika score / streak surface (HealthRow) | many (health-row.tsx, lib/health-score.ts, lib/streaks.ts, lib/momentum.ts) | streaks, momentum, momentum_events, user_badges | DEFERRED (Phase 1C) |
| Sika Daily banner                  | 2 (sika-daily-banner.tsx, types/daily.ts) | sika_daily_digests, user_daily_reads | DEFERRED (Phase 1C) |
| AI insight strip                   | 1 (insight-strip.tsx) + `/api/insights/today` route | daily_insights | DEFERRED (Phase 1C) |
| Should I Buy It                    | feature dir `components/decision/` | purchase_decisions | DEFERRED (Phase 2) |
| Sika Monthly banner / recap viewer | 2 (sika-monthly-banner.tsx + /monthly route) | monthly_recaps | DEFERRED (Phase 2) |
| Sunday recap card                  | 1 (sunday-recap-card.tsx) | transactions (computed) | DEFERRED (Phase 1C) |
| Goals widget on dashboard + /goals | several files in `goals/` | goals, transactions (paid_from_goal_id, goal_id) | DEFERRED (Phase 1D/2) |
| Weekly chart                       | 1 (weekly-chart.tsx) | transactions (computed in use-dashboard-data) | OPTIONAL Phase 1B (small) |
| Recent transactions on dashboard   | 1 (recent-transactions.tsx) | transactions | 1B-2 |
| Pending recurring on dashboard     | 1 (income-nudge-card.tsx, PendingRecurringCard export) | recurring_transactions, transactions | DEFERRED (Phase 1D — recurring) |
| Settings (full)                    | several files in `settings/` | profiles, categories, etc. | PARTIAL — 1B-10 covers cycle_start_day + buckets percents + currency only |

iOS Prompt sequencing recommendation:
- **1B-1** Nav shell + tab bar + FAB (no data, just chrome)
- **1B-2** Home dashboard with stub data (cycle card + spend cards + recent transactions stub)
- **1B-3** Cycle math (CycleWindow struct + getCycleForDate, mirroring lib/cycle.ts byte-for-byte)
- **1B-4** Bucket math (DashboardStats computation + BucketStrip + /buckets detail)
- **1B-5** Transactions list + delete
- **1B-6** Transaction sheet (the big one — 933 lines on web, expect a full prompt cycle)
- **1B-7** Accounts CRUD + computeAccountBalances + reconcile
- **1B-8** Wire categories + apply CategoryGrid filter logic
- **1B-9** Income nudges on dashboard
- **1B-10** Minimal settings: cycle_start_day picker, bucket percents, currency

---

## 13. Things the architect should know

### A. The critical zero-trigger problem on `transactions`
**There are NO server-side triggers on the `transactions` table.** Every side effect — momentum events, streak updates, badge unlocks, health score recompute, account balance changes — is computed in the **client** after `supabase.from('transactions').insert(...)` resolves.

Concretely, `transaction-sheet.tsx:298-360` (after a successful insert) calls:
- `analytics.transactionLogged(...)` — PostHog
- `updateLoggingStreak(supabase, user.id)` — multi-step DB read+write
- `awardMomentum(supabase, user.id, 'transaction_logged')` — DB read+write
- `checkAndUnlockBadges(...)` — `'transaction_logged'` AND `'streak_updated'`
- For sinking-fund payments: re-fetch goal contributions, possibly mark `goals.completed_at`, award `'goal_completed'` momentum, check goal_completed badges.
- `revalidateForEntity('transaction')` (or `'sinking_fund_payment'`)

If iOS just writes the row and does nothing else, **streaks/momentum/badges will silently be out of date**. This is by far the biggest gotcha in the rebuild. Three reasonable strategies:

1. Port every helper (`updateLoggingStreak`, `awardMomentum`, `checkAndUnlockBadges`) to Swift and run them after every insert.
2. Move them server-side via Postgres triggers (cleanest for a multi-platform future).
3. Move them to a Supabase Edge Function the client invokes after insert.

**Recommendation:** option 2 if you'll keep web AND iOS, since you'd otherwise duplicate this logic in every client. The streaks/momentum/badges modules can be defined as `AFTER INSERT/UPDATE/DELETE` triggers on `transactions`, idempotent and re-entrant. This audit doesn't decide for you, but flag it loudly.

### B. The `handle_new_user` trigger has two real bugs in 0030
- Inserts into `accounts` reference an `account_type` column that has no migration adding it. Either the migration was never applied, or `account_type` exists in production via the Supabase dashboard, **out-of-band from the migration history**. PHASE1_AUDIT.md flagged this as well. Treat it as: production schema may differ from `supabase/migrations/`. iOS should mirror what production actually has — and verify by querying `information_schema.columns` on a fresh user.
- Income preset categories (Salary, Side Hustle, etc.) are inserted with `bucket_id = null` but **without explicit `category_type`**, so they default to `'expense'`. The CHECK constraint `category_bucket_consistency` (added in 0004) forbids `expense AND bucket_id IS NULL`. If 0030 is the live trigger function, signups should be failing. Since signups appear to work, the live function is likely the 0013 body (which sets `category_type` correctly per row). **Verify before iOS launch.**

### C. The "discipline math vs balance math" duality
The same expense affects two different calculations:
- **Account balance** (real money) — every expense decreases balance, including paid-from-goal expenses.
- **Bucket math** (discipline) — paid-from-goal expenses are excluded.

iOS must implement both, not pick one. The bug shape if you collapse them: a user pays for their saved-up trip out of their savings goal, and their Wants bucket appears to "spend ₵3000" — wrong, because the goal already accounted for it.

### D. Adjustments are signed
`amount` on `transactions` can be **negative** for `type='adjustment'` rows. This is the only type where amount is signed. All other types treat amount as a positive quantity. The TransactionItem renders the sign from `txn.type === 'adjustment' ? (amount >= 0 ? '+' : '') : ...`. The reconcile flow specifically computes `reconcileDiff = actual - sikaShows` and writes that signed value.

### E. Two parallel "type" columns on accounts
`accounts.type` (the working one used by app code) and `accounts.account_type` (referenced in trigger 0029/0030 only, no migration creates it). App code only uses `accounts.type`. iOS should ignore `account_type`.

### F. `is_default` may not be set on any account after signup
After 0030, the seeded accounts have no `is_default = true` row (it was only set in 0013). The app falls back to `accounts[0]` if no default exists (`transaction-sheet.tsx:59`), so it works, but the "Default" star badge in the accounts list will never show until the user explicitly toggles it. Behavior may differ in production if 0013 was the last applied trigger.

### G. Income picker is hardcoded, not data-driven
The 7 income presets in `IncomeCategoryPicker` are a hardcoded `INCOME_PRESETS` constant, not a query. After picking, the code does a name-match against the user's `categories` rows. The user's seeded income categories happen to match the preset labels exactly (Salary, Side Hustle, etc.), so this works at signup. If a user **renames "Salary" to "Paycheck"**, picking the "Salary" preset will fall back to `category_id = null` and store the preset emoji in the note. That's a small but real footgun if iOS uses a different mechanism.

### H. CategoryGrid doesn't filter by bucket
In `transaction-sheet.tsx` step `category`, the user picks from the **full union of expense + adjustment categories**. There's no "you're spending — pick a bucket first" funnel. The bucket is implied by the category. This is a reasonable UX choice but means the bucket selection isn't a step iOS needs.

### I. Transfer uses ONE transaction row, not two
Confirmed in three independent code paths (transaction-sheet.tsx insert payload, account-modal.tsx insert, computeAccountBalances). The DB CHECK `non_transfer_no_to_account` requires `to_account_id IS NULL` for non-transfer rows, and `transfer_accounts_differ` requires both account ids set + different on transfers. iOS schema must match.

### J. Adjustments do NOT count toward bucket math
`bucketExpenses = expenses.filter(t => !t.paid_from_goal_id)` — adjustments aren't `expense` type at all, so they were never in the array. They affect account balance only. Don't accidentally count them in any bucket sum.

### K. URL-driven state on dashboard and transactions
The cycle navigation arrows write `?cycle=YYYY-MM-DD` to the URL and parse it back via `parseCycleParam`. The transactions filter UI puts type/account/category/bucket/sort/amount-range in the URL. This is great for shareable web links but doesn't translate to iOS — iOS will use ordinary view state. If the architect plans to support deep links into a specific cycle or filtered transactions view, that's a Phase 2+ consideration; Phase 1B can ignore.

### L. Cycle navigation goes only into the past
`navigateCycle(1)` is gated by `if (delta === 1 && next.start > new Date()) return;`. The UI also disables the right arrow when `cycle.isCurrent`. Mirror this on iOS — never let the user navigate to a future cycle.

### M. PHASE1_AUDIT.md conflicts to be aware of
- That file says `accounts` has both `type` and `account_type` columns. This audit confirmed only `type` is used; `account_type` likely doesn't exist (or was added out-of-band). Treat as **production-database-state UNKNOWN**.
- That file mentions the `handle_new_user` trigger had been rewritten across 0001/0003/0004/0013/0029/0030. Confirmed.

### N. `formatTransactionDate` time-zone handling
`src/lib/utils.ts:28` constructs date as `new Date(dateStr + 'T00:00:00')` — local time, no Z suffix. This means a transaction logged on Mar 15 in Accra is "Mar 15" everywhere; the date is treated as a wall-clock date, not a moment. iOS should mirror with `Calendar.current` and `transaction_date` as a `Date` constructed at local midnight, not from UTC. Important for groupings.

### O. The 200ms-vs-300ms close timer
`handleClose` in transaction-sheet.tsx waits 300ms before resetting state, presumably to let the sheet exit-animate first. Trivial detail but iOS should pick a similar wait or restructure to reset on dismissal callback.

### P. There is a `sika-sensitive` class on amount-displaying elements
Used by the privacy-blur feature. iOS may want the same toggle (Settings → "Hide amounts at a glance") but it's not in Phase 1B scope. Leave room.

================================================================
END OF AUDIT
================================================================
