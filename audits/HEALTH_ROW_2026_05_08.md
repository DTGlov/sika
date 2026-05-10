# HealthRow Audit — 2026-05-08

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Phase 9 implementation — Sika score + streaks + momentum + badges with celebration sheets.

Source of truth: web repo (`feat/bearer-auth-decisions` branch, working tree clean for src).

## TL;DR for the iOS prompt author

- The dashboard's gamification surface is **a single component, `HealthRow`** (`src/components/dashboard/health-row.tsx`) — one tappable horizontal pill that summarizes Sika score, logging streak, momentum tier, and badge count. Tapping it routes to `/health`. There is no dashboard-level four-up grid; the four metrics share one row.
- **"Momentum" on web is NOT a trending up/flat/down indicator.** It's a 5-tier points-accumulation system (Bronze → Diamond at 0 / 500 / 2000 / 5000 / 10000). The HealthRow shows the **current tier name + icon**, not a direction arrow. iOS should not invent a "trending up" UX — port the tier system as-is.
- **Sika score is computed client-side every dashboard load**, not cached, no cron. `computeHealthScore()` runs 6 parallel Supabase queries and returns a 0-100 weighted total across 5 factors (emergency_coverage 25%, budget_discipline 25%, consistency 20%, goal_commitment 20%, diversification 10%). Recomputes when `mutationCount` (transaction store mutations) ticks.
- **8 badges total**, locked catalog in `src/types/badge.ts`. Unlock detection is **on-demand from client mutation handlers** (transaction-sheet, contribute-modal, dashboard cycle-load) calling `checkAndUnlockBadges(trigger)`. No server cron, no API route. Idempotent via DB unique constraint on `user_badges(user_id, badge_id)`.
- **Celebration is a queue-based modal** (`badgeCelebrationQueue` in auth store, `BadgeCelebrationHost` mounted in `AppShell`). Single modal at a time, auto-dismiss after 5s. Persistence via `user_badges.celebration_shown` boolean. **Pending unshown celebrations are picked up on profile load**, so a badge unlocked on iOS gets celebrated next time the user opens web (and vice versa).
- **iOS architectural recommendation: client-side compute**, mirroring web. All four surfaces' raw data already lives in tables iOS reads directly via Supabase Swift SDK. No new API routes needed — the Bearer auth work that just landed (`feat/bearer-auth-decisions`) is irrelevant to Phase 9, which can use direct table reads + RLS.

---

## 1. Slot on Dashboard

File: `src/app/(app)/dashboard/page.tsx`

Import (line 19):

```tsx
import { HealthRow } from '@/components/dashboard/health-row';
```

Render (line 390, in `DashboardContent` JSX):

```tsx
{/* Should I buy it? */}
{loading ? (
  <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border">
    {/* skeleton */}
  </div>
) : (
  <ShouldIBuyButton />
)}

{/* Sunday recap — only on Sundays */}
<SundayRecapCard />

{/* Financial health row */}
<HealthRow />

{/* Income summary row — desktop only ... */}
{monthlyIncome > 0 && (
  ...
)}
```

Position in dashboard render order (top → bottom):

1. TopBar (greeting + month/year + Settings gear)
2. Cycle navigation (left/right arrows + label)
3. SikaDailyBanner (skeleton → banner → null when no unread digest)
4. InsightStrip (when there's an undismissed daily insight)
5. SikaMonthlyBanner (when monthly recap unread + undismissed in last 30d)
6. CycleCard (virtual credit card) + `HintCard("dashboard_card_intro")` below
7. Section divider (`<div className="my-6 border-t border-border/40" />`)
8. Spend summary cards (Today / This Month grid)
9. Bucket ring + bucket strip
10. Goals widget
11. Weekly chart
12. Recent transactions
13. ShouldIBuyButton
14. SundayRecapCard
15. **HealthRow** ← this audit's subject
16. Income summary row (desktop only)
17. Income nudges + pending recurring
18. Recent badges (only when there are recent unlocks)
19. Onboarding modal (conditional)

The dashboard also wires a `cycle_ended` badge check in a separate `useEffect` (lines 158-168):

```tsx
useEffect(() => {
  if (!user) return;
  checkAndUnlockBadges(supabase, user.id, 'cycle_ended').then(({ newlyUnlocked }) => {
    if (newlyUnlocked.length > 0) {
      enqueueBadgeCelebrations(newlyUnlocked);
      revalidateForEntity('badge_unlocked');
    }
  });
}, [user]);
```

`HealthRow` is **one component containing 4 logical surfaces** (score, streak, momentum, badges count) — not a parent grid of four child components. The four surfaces are inline children of one button.

---

## 2. Sika Score

### Computation

File: `src/lib/health-score.ts` (lines 17-115). Top-level orchestrator:

```ts
export async function computeHealthScore(
  supabase: SupabaseClient,
  userId: string
): Promise<HealthScore> {
  // ── Parallel base fetch ──────────────────────────────────────────
  const [profileRes, streaksRes, activeGoalsRes, accountsRes, incomeSourcesRes] = await Promise.all([
    supabase.from('profiles').select('cycle_start_day, monthly_income, needs_percent, wants_percent, savings_percent').eq('id', userId).single(),
    supabase.from('streaks').select('logging_current, savings_current, logging_last_date').eq('user_id', userId).single(),
    supabase.from('goals').select('id, name, target_amount, deadline, created_at').eq('user_id', userId).eq('is_active', true).eq('is_archived', false).eq('goal_type', 'target').is('completed_at', null).not('deadline', 'is', null),
    supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
    supabase.from('income_sources').select('id, amount, frequency, is_active').eq('user_id', userId).eq('is_active', true),
  ]);

  // ... derive cycleStartDay / needsPct / wantsPct / futurePct / monthlyIncome ...

  // Last 3 completed cycles + single transactions query for them
  const { data: cycleExpenses } = await supabase
    .from('transactions')
    .select('amount, transaction_date, category:categories!category_id(bucket:budget_buckets(name))')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('transaction_date', oldestStart)
    .lte('transaction_date', newestEnd);

  // ── Factor 1: Emergency Coverage (25%) ──────────────────────────
  const emergencyCoverage = await computeEmergencyCoverage(...);
  // ── Factor 2: Budget Discipline (25%) ────────────────────────────
  const budgetDiscipline = computeBudgetDiscipline(...);
  // ── Factor 3: Consistency (20%) ──────────────────────────────────
  const consistency = computeConsistency(streaksData);
  // ── Factor 4: Goal Commitment (20%) ──────────────────────────────
  const goalCommitment = await computeGoalCommitment(supabase, activeGoals as GoalRow[]);
  // ── Factor 5: Diversification (10%) ──────────────────────────────
  const diversification = computeDiversification(accountCount, incomeSources.length);

  const total = Math.round(
    emergencyCoverage.score * 0.25 +
    budgetDiscipline.score  * 0.25 +
    consistency.score       * 0.20 +
    goalCommitment.score    * 0.20 +
    diversification.score   * 0.10
  );

  return { total, label: getLabelConfig(total).label, factors };
}
```

Range: **0-100** (integer, `Math.round` of weighted sum).
Update frequency: **client-side, on dashboard mount + on transaction-store `mutationCount` change**. No caching, no cron, no DB-stored value.
Pure: yes — no writes, no side effects.

### Per-factor formulas (verbatim helpers from `health-score.ts`)

**Emergency Coverage** (lines 121-179) — finds the user's "Life Savings" perpetual goal, divides its net balance by the average monthly Needs spending (last 3 cycles), and scales: `score = min(100, round((coverageRatio / 3) * 100))`. So 3+ months of Needs covered = 100. Returns neutral 50 with description if no Life Savings goal or no Needs data.

**Budget Discipline** (lines 181-241) — for each of (3 cycles × 3 buckets), checks whether bucket spend ≤ `monthlyIncome * pct/100`. Score = `round(withinCount / totalChecks * 100)`. Tip surfaces the most-blown bucket if score < 60.

**Consistency** (lines 243-266):

```ts
const loggingScore = Math.min(100, Math.round((logging_current / 30) * 100));
const savingsScore = Math.min(100, Math.round((savings_current / 4)  * 100));
const score = Math.round(loggingScore * 0.6 + savingsScore * 0.4);
```

(30-day logging streak = 100, 4-week savings streak = 100, weighted 60/40.)

**Goal Commitment** (lines 276-328) — for each active deadline-bound target goal, computes "expected by now" (linear pace from `created_at` to `deadline`), counts `onPace` if `net >= expectedByNow`. Score = `round(onPace / total * 100)`, neutral 50 if zero such goals.

**Diversification** (lines 330-345):

```ts
const accountScore = Math.min(100, (accountCount / 3) * 100);
const incomeScore  = Math.min(100, (incomeSourceCount / 2) * 100);
const score = Math.round(accountScore * 0.5 + incomeScore * 0.5);
```

(3 accounts = 100, 2 income sources = 100, weighted 50/50.)

### Label thresholds

File: `src/types/health.ts` (lines 25-31):

```ts
export const LABEL_THRESHOLDS: Array<{ min: number; label: HealthLabel; displayName: string; color: string }> = [
  { min: 80, label: 'excellent',       displayName: 'Excellent',       color: '#00D9A3' },
  { min: 60, label: 'good',            displayName: 'Good',            color: '#10B981' },
  { min: 40, label: 'fair',            displayName: 'Fair',            color: '#FBBF24' },
  { min: 20, label: 'needs_attention', displayName: 'Needs attention', color: '#F97316' },
  { min: 0,  label: 'critical',        displayName: 'Critical',        color: '#F43F5E' },
];
```

| Score | Label | Display | Color |
|------:|-------|---------|-------|
| 80-100 | excellent | Excellent | `#00D9A3` |
| 60-79 | good | Good | `#10B981` |
| 40-59 | fair | Fair | `#FBBF24` |
| 20-39 | needs_attention | Needs attention | `#F97316` |
| 0-19 | critical | Critical | `#F43F5E` |

`getLabelConfig(total)` returns the first entry where `total >= t.min` (`types/health.ts:49-51`).

### Visual treatment in HealthRow

Sika score appears as: `Your Sika score: 87 · Excellent` where the number is `text-foreground font-bold tabular-nums` and the label is `text-sm font-semibold` colored by `labelCfg.color`. No background fill in the row chrome; the color only tints the label text.

### Visual treatment in /health page

The dedicated page renders the score as a 7xl black tabular-nums number on a soft gradient panel tinted by label color (`linear-gradient(135deg, var(--background) 0%, ${labelCfg.color}12 100%)` with border `${labelCfg.color}30`). Spring entrance: `initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}`. Each factor renders as an animated bar (width 0 → score% over 0.6s) plus description and optional tip card.

---

## 3. Streaks

### Logic

File: `src/lib/streaks.ts` (full source). Two **independent** streaks:

- **logging_current** — incremented daily by `updateLoggingStreak` (called from `transaction-sheet.tsx:309` on user-initiated transaction insert; auto-generated recurring transactions do NOT count).
- **savings_current** — incremented weekly by `updateSavingsStreak` (called from `contribute-modal.tsx:80` on goal contribution).

Verbatim — `updateLoggingStreak` (lines 80-171):

```ts
export async function updateLoggingStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<StreakUpdateResult> {
  const streaks = await fetchOrCreateStreaks(supabase, userId);
  const today = todayStr();

  // Already logged today — no-op
  if (streaks.logging_last_date === today) return result;

  if (!streaks.logging_last_date) {
    // First ever log
    newCurrent = 1;
  } else {
    const gap = daysBetween(streaks.logging_last_date, today);
    if (gap === 1) {
      newCurrent += 1;                                    // consecutive
    } else {
      const freezesNeeded = gap - 1;
      if (streaks.freezes_banked >= freezesNeeded) {
        newFreezesBanked -= freezesNeeded;
        newCurrent += 1;                                  // freeze used
      } else {
        newCurrent = 1;                                   // BROKEN — restart at 1
        newFreezesBanked = 0;
      }
    }
  }

  // Earn freeze at every 10-day milestone (max 2 banked)
  if (newCurrent > 0 && newCurrent % 10 === 0 && newFreezesBanked < MAX_FREEZES) {
    newFreezesBanked = Math.min(MAX_FREEZES, newFreezesBanked + 1);
    newFreezesEarned += 1;
  }

  // Check milestones (one-shot — recorded in logging_milestones_shown)
  const hitMilestone = LOGGING_MILESTONES.find(
    m => newCurrent === m && !newMilestonesShown.includes(m)
  );
  // ...write row, return result
}
```

`updateSavingsStreak` (lines 176-253) is structurally identical but works in **ISO weeks** (Monday-anchored): keys on `getMondayStr()`, gap is in weeks via `weeksBetween`, freezes consumed per missed week, milestones at 4/12/26/52.

### Passive break detection

`checkStreakHealth` (lines 260-313) runs from `useStreakHealth` hook on every dashboard load. If `daysBetween(logging_last_date, today) > 1` and freezes don't cover, it zeroes `logging_current` and `logging_last_date`, banking_freezes = 0 — and surfaces `logging_just_broken: true` (UI uses this to fire a one-time compassionate toast). Same pattern for savings.

### What counts as a "day"

- **Logging streak**: a user-initiated transaction insert (any type — expense / income / transfer / adjustment). Auto-generated recurring transactions DO NOT trip the streak. Multiple transactions on the same day = no extra increment (the `logging_last_date === today` guard).
- **Savings streak**: a goal contribution insert (via `contribute-modal`). Multiple in the same Mon-Sun ISO week = no extra increment.

### Reset rule

Gap ≥ 2 (days for logging, weeks for savings) WITHOUT enough freezes in `freezes_banked` → `newCurrent = 1` (broken-but-restarted). With sufficient freezes → freeze count decremented, current incremented.

### Persistence

DB table `streaks` (one row per user). Schema from `src/types/streak.ts`:

```ts
export interface Streaks {
  user_id: string;
  logging_current: number;
  logging_longest: number;
  logging_last_date: string | null;
  savings_current: number;
  savings_longest: number;
  savings_last_week: string | null;
  freezes_banked: number;
  freezes_earned_total: number;
  logging_milestones_shown: number[];
  savings_milestones_shown: number[];
  created_at: string;
  updated_at: string;
}
```

### Display

In **HealthRow** (`health-row.tsx:60-72`):

```tsx
{loggingStreak > 0 && (
  <>
    <motion.div
      animate={shouldPulse ? { scale: [1, 1.08, 1] } : {}}
      transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
    >
      <Flame className="w-3.5 h-3.5 text-[#F97316]" />
    </motion.div>
    <span className="text-muted-foreground text-xs tabular-nums">{loggingStreak}d</span>
  </>
)}
```

Where `shouldPulse = loggingStreak > 0 && !loggedToday`.

The HealthRow only shows the **logging** streak (savings streak omitted from the dashboard chip). `StreakStrip` (`src/components/dashboard/streak-strip.tsx`) is a separate component that shows both streaks side-by-side with emoji glyphs (🔥 / 💰 / ❄️) and a nudge line — but it's NOT rendered on the dashboard currently (no callers in the app shell). It exists, presumably for use on `/streaks`.

### Milestones

```ts
const LOGGING_MILESTONES = [7, 14, 30, 60, 100];
const SAVINGS_MILESTONES = [4, 12, 26, 52];
```

When `newCurrent` first hits one of these AND it's not in `logging_milestones_shown` / `savings_milestones_shown`, a toast fires with:

```ts
function loggingMilestoneMessage(days: number): string {
  if (days >= 100) return `💎 100-day streak. You're a Seeker through and through.`;
  if (days >= 60)  return `🌟 60 days! You're on fire.`;
  if (days >= 30)  return `🏆 30-day logging streak! Rare air.`;
  if (days >= 14)  return `💪 14-day streak! Two weeks strong.`;
  return                  `🔥 7-day logging streak! You're building a habit.`;
}

function savingsMilestoneMessage(weeks: number): string {
  if (weeks >= 52) return `💎 52-week saving streak! An entire year of consistency.`;
  if (weeks >= 26) return `🌟 Half a year of saving every week!`;
  if (weeks >= 12) return `🎯 12-week saving streak! Three months strong.`;
  return                  `💰 4-week saving streak! One month strong.`;
}
```

The 7-day logging milestone *also* fires `awardMomentum('logging_streak_7_days')` for +50 points (`transaction-sheet.tsx:313-315`).

---

## 4. Momentum

**This is NOT a "trending up/down" indicator.** It's a points-accumulation tier ladder.

### Calculation

File: `src/lib/momentum.ts` (full source).

```ts
export async function awardMomentum(
  supabase: SupabaseClient,
  userId: string,
  eventType: MomentumEventType
): Promise<MomentumUpdateResult> {
  const points = MOMENTUM_AMOUNTS[eventType];

  // Fetch or create momentum row
  let { data: existing } = await supabase
    .from('momentum')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!existing) {
    const { data: created } = await supabase
      .from('momentum')
      .insert({ user_id: userId, total_points: 0, tier: 'bronze' })
      .select('*')
      .single();
    existing = created;
  }

  const previousTotal = existing?.total_points ?? 0;
  const previousTier = calculateTier(previousTotal);
  const newTotal = previousTotal + points;
  const newTier = calculateTier(newTotal);
  const tierChanged = newTier.id !== previousTier.id;

  const [momentumRes] = await Promise.all([
    supabase
      .from('momentum')
      .upsert({ user_id: userId, total_points: newTotal, tier: newTier.id, updated_at: new Date().toISOString() })
      .select('*').single(),
    supabase
      .from('momentum_events')
      .insert({ user_id: userId, event_type: eventType, points }),
  ]);

  return { momentum, points_awarded: points, previous_total: previousTotal, tier_changed: tierChanged, new_tier: newTier, previous_tier: previousTier };
}
```

### Tiers (`src/types/momentum.ts:12-18`)

| ID | Name | Threshold | Color | Glow | Lucide icon |
|---|---|---:|---|---|---|
| bronze   | Bronze   |     0 | `#CD7F32` | `rgba(205,127,50,0.30)`  | Medal  |
| silver   | Silver   |   500 | `#C0C0C0` | `rgba(192,192,192,0.30)` | Award  |
| gold     | Gold     |  2000 | `#D4AF37` | `rgba(212,175,55,0.35)`  | Trophy |
| platinum | Platinum |  5000 | `#E5E4E2` | `rgba(229,228,226,0.40)` | Crown  |
| diamond  | Diamond  | 10000 | `#B9F2FF` | `rgba(185,242,255,0.40)` | Gem    |

### Event point amounts (`src/types/momentum.ts:31-39`)

| Event | Points | Fired from |
|---|---:|---|
| `transaction_logged`               |   2 | `transaction-sheet.tsx:323` |
| `transaction_logged_via_nudge`     |   5 | (defined; not searched for callers in this audit) |
| `goal_contribution`                |  10 | `contribute-modal.tsx:92` |
| `account_reconciled`               |   3 | `transaction-sheet.tsx:405` |
| `logging_streak_7_days`            |  50 | `transaction-sheet.tsx:314` (only on 7-day milestone) |
| `goal_completed`                   | 100 | `transaction-sheet.tsx:346` (sinking-fund completion) |
| `bucket_within_limit_full_month`   |  75 | (defined; not searched for callers in this audit) |

### Time window

**No time window.** It's a lifetime accumulation. `total_points` only ever grows. No decay, no rolling window.

### Direction signal

There isn't one. The HealthRow displays the **current tier name + icon** only:

```tsx
{tier && (
  <>
    {loggingStreak > 0 && <span className="text-muted-foreground/60 text-xs">·</span>}
    <TierIcon tier={tier.id} size={14} />
    <span className="text-muted-foreground text-xs">{tier.name}</span>
  </>
)}
```

`TierIcon` (`src/components/momentum-float.tsx:13-17`) maps `iconName` → Lucide component (Medal/Award/Trophy/Crown/Gem) styled with `cfg.color`.

### Visual: tier-up celebration

`TierUpModal` (`momentum-float.tsx:50-99`) — confetti via `canvas-confetti` (`particleCount: 120, spread: 80, origin: { y: 0.6 }`, colors derived from tier + accents), spring-entry tier icon, "Tier Up!" eyebrow, tier name H2, "Let's go!" CTA. Fires when `awardMomentum().tier_changed === true` — caller responsibility, e.g. `contribute-modal.tsx:96` sets `setTierUpTier(result.new_tier)`.

`MomentumFloat` — small `+N pts` floating chip rises 60px and fades over 1.6s after every award, fixed `bottom-28 right-4`, gold accent color (`#D4A017`).

### Whether iOS should ship this

**Yes, port the tier system.** It's well-defined, lifetime-accumulation, single source of truth (`momentum` table). What iOS should NOT ship: a "trending up/flat/down" momentum metric — that doesn't exist on web. iOS' Phase 9 prompt should refer to this surface as "Momentum tier" rather than "momentum direction."

---

## 5. Badges

### Taxonomy table

Locked catalog from `src/types/badge.ts:26-35`:

| ID | Name | Unlock criteria | Lucide icon | Rarity | Sort |
|---|---|---|---|---|---:|
| `first_steps`          | First Steps          | Log your first transaction                       | `Footprints`    | common | 1 |
| `week_warrior`         | Week Warrior         | Maintain a 7-day logging streak                  | `Flame`         | common | 2 |
| `goal_getter`          | Goal Getter          | Complete your first target goal                  | `Target`        | common | 3 |
| `consistent_saver`     | Consistent Saver     | Maintain a 4-week savings streak                 | `PiggyBank`     | common | 4 |
| `century_club`         | Century Club         | Log 100 total transactions                       | `Hash`          | rare   | 5 |
| `month_of_discipline`  | Month of Discipline  | Maintain a 30-day logging streak                 | `CalendarCheck` | rare   | 6 |
| `seeker`               | Seeker               | Complete 5 target goals                          | `Compass`       | rare   | 7 |
| `safety_net`           | Safety Net           | Life Savings reaches 3× your monthly Needs       | `Shield`        | rare   | 8 |

Rarity visual config (`src/types/badge.ts:40-51`):

| Rarity | Frame color | Frame gradient | Glow intensity |
|---|---|---|---:|
| common | `#00D9A3` | `radial-gradient(circle, rgba(0,217,163,0.15) 0%, rgba(0,217,163,0) 70%)` | 0.20 |
| rare   | `#D4AF37` | `radial-gradient(circle, rgba(212,175,55,0.25) 0%, rgba(212,175,55,0) 70%)` | 0.35 |

### Unlock detection

File: `src/lib/badges.ts`. Trigger map (lines 15-22):

```ts
const TRIGGER_BADGES: Record<BadgeTrigger, BadgeId[]> = {
  transaction_logged:  ['first_steps', 'century_club'],
  streak_updated:      ['week_warrior', 'consistent_saver', 'month_of_discipline'],
  goal_completed:      ['goal_getter', 'seeker'],
  contribution_made:   ['safety_net'],
  account_reconciled:  [],
  cycle_ended:         ['safety_net'],
};
```

`checkAndUnlockBadges(supabase, userId, trigger)` (lines 160-196):

```ts
export async function checkAndUnlockBadges(
  supabase: SupabaseClient,
  userId: string,
  trigger: BadgeTrigger
): Promise<{ newlyUnlocked: UserBadge[] }> {
  const badgesToCheck = TRIGGER_BADGES[trigger];
  if (badgesToCheck.length === 0) return { newlyUnlocked: [] };

  // Fetch already-unlocked badge IDs
  const { data: existing } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', userId);
  const unlockedIds = new Set((existing ?? []).map(r => r.badge_id));

  // Check conditions for not-yet-unlocked badges
  const candidates = badgesToCheck.filter(id => !unlockedIds.has(id));
  if (candidates.length === 0) return { newlyUnlocked: [] };

  const results = await Promise.all(
    candidates.map(async badgeId => ({
      badgeId,
      earned: await checkBadgeCondition(supabase, userId, badgeId),
    }))
  );

  const toUnlock = results.filter(r => r.earned).map(r => r.badgeId);
  if (toUnlock.length === 0) return { newlyUnlocked: [] };

  const { data: inserted } = await supabase
    .from('user_badges')
    .insert(toUnlock.map(badge_id => ({ user_id: userId, badge_id })))
    .select('*');

  return { newlyUnlocked: (inserted as UserBadge[]) ?? [] };
}
```

Per-badge condition (lines 24-99) — counts/queries the relevant fact and returns `boolean`. Examples:

```ts
case 'first_steps': {
  const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  return (count ?? 0) >= 1;
}
case 'week_warrior': {
  const { data } = await supabase.from('streaks').select('logging_current').eq('user_id', userId).single();
  return (data?.logging_current ?? 0) >= 7;
}
case 'safety_net':
  return checkSafetyNet(supabase, userId);
```

`checkSafetyNet` (lines 101-154) finds the "Life Savings" perpetual goal, fetches its net, computes average Needs spend over up to 3 prior cycles, returns `lifeSavingsBalance >= 3 * avgNeeds`.

### Where unlock checks fire

| Trigger | Caller | File:line |
|---|---|---|
| `transaction_logged` | After user-initiated transaction insert | `transaction-sheet.tsx:324` |
| `streak_updated`     | After `updateLoggingStreak` resolves    | `transaction-sheet.tsx:319` |
| `streak_updated`     | After `updateSavingsStreak` resolves    | `contribute-modal.tsx:87` |
| `goal_completed`     | When sinking-fund payment completes a goal | `transaction-sheet.tsx:347` |
| `contribution_made`  | After goal contribution                  | `contribute-modal.tsx:99` |
| `account_reconciled` | After reconcile save (currently no badges in trigger map) | `transaction-sheet.tsx:406` |
| `cycle_ended`        | Dashboard `useEffect` on user mount     | `dashboard/page.tsx:161` |

**Server / client / cron:** ALL on-demand client-side from mutation handlers. **No cron**, no API route, no server-side scheduler. Idempotency comes from a DB unique constraint on `user_badges(user_id, badge_id)` (the audit infers this from the "Idempotent — already-unlocked badges are ignored via DB unique constraint" docstring at `badges.ts:158-159`).

### Persistence

Tables:
- `user_badges(id, user_id, badge_id, unlocked_at, celebration_shown)` — one row per (user, badge) unlocked.

Type from `src/types/badge.ts:12-18`:

```ts
export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  unlocked_at: string;
  celebration_shown: boolean;
}
```

---

## 6. Badge Unlock Celebration

### UI pattern

Centered modal via shadcn `Dialog`. Single modal at a time via auth-store queue. Auto-dismiss after **5000ms** (`AUTO_DISMISS_MS` in `badge-unlock-modal.tsx:17`).

### Persistence of "user has seen this"

Column: `user_badges.celebration_shown` (boolean). Set to `true` by `markCelebrationShown()` (`lib/badges.ts:213-220`) when the user dismisses the modal:

```ts
export async function markCelebrationShown(
  supabase: SupabaseClient,
  userBadgeId: string
): Promise<void> {
  await supabase
    .from('user_badges')
    .update({ celebration_shown: true })
    .eq('id', userBadgeId);
}
```

`fetchPendingCelebrations` (`badges.ts:199-210`) returns `user_badges` rows where `celebration_shown = false`, ordered by `unlocked_at ASC` — so backlog is FIFO. Currently called inside `useProfile()` (see Section 9).

### Source verbatim

`src/components/badges/badge-celebration-host.tsx`:

```tsx
'use client';

import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { markCelebrationShown } from '@/lib/badges';
import { BadgeUnlockModal } from './badge-unlock-modal';
import type { BadgeId } from '@/types/badge';

/**
 * Renders in AppShell. Watches the badge celebration queue in auth store
 * and shows one modal at a time. Marks celebration_shown = true on dismiss.
 */
export function BadgeCelebrationHost() {
  const supabase = createClient();
  const { badgeCelebrationQueue, shiftBadgeCelebration } = useAuthStore();

  const current = badgeCelebrationQueue[0];

  const handleClose = useCallback(async () => {
    if (!current) return;
    shiftBadgeCelebration();
    await markCelebrationShown(supabase, current.userBadgeId);
  }, [current, shiftBadgeCelebration]);

  if (!current) return null;

  return (
    <BadgeUnlockModal
      key={current.userBadgeId}
      open={true}
      badgeId={current.badgeId as BadgeId}
      onClose={handleClose}
    />
  );
}
```

`src/components/badges/badge-unlock-modal.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useHaptics } from '@/hooks/use-haptics';
import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BADGES_CATALOG, RARITY_CONFIG } from '@/types/badge';
import type { BadgeId } from '@/types/badge';

const AUTO_DISMISS_MS = 5000;

export function BadgeUnlockModal({ open, badgeId, onClose }: BadgeUnlockModalProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { celebration } = useHaptics();
  const badge = BADGES_CATALOG[badgeId];
  const config = RARITY_CONFIG[badge.rarity];
  const Icon = (LucideIcons as any)[badge.iconName] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

  useEffect(() => {
    if (open) {
      celebration();
      timerRef.current = setTimeout(onClose, AUTO_DISMISS_MS);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [open, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton
        className="max-w-[calc(100vw-32px)] sm:max-w-sm bg-card p-6 text-center"
        style={{
          borderColor: `${config.frameColor}40`,
          boxShadow: `0 0 60px ${config.frameColor}30, 0 0 20px ${config.frameColor}15`,
        }}
      >
        <DialogTitle className="sr-only">Badge Unlocked</DialogTitle>

        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex justify-center mb-4"
        >
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center"
            style={{
              background: config.frameGradient,
              border: `3px solid ${config.frameColor}`,
              boxShadow: `0 0 30px ${config.frameColor}40`,
            }}
          >
            {Icon && <Icon className="w-12 h-12" style={{ color: config.frameColor }} />}
          </div>
        </motion.div>

        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-muted-foreground">
          Badge Unlocked
        </p>
        <h2 className="text-2xl font-bold mb-1" style={{ color: config.frameColor }}>
          {badge.name}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">{badge.description}</p>

        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl font-semibold text-sm transition-colors hover:opacity-90"
          style={{ background: config.frameColor, color: '#0E1A2E' }}
        >
          Continue
        </button>
      </DialogContent>
    </Dialog>
  );
}
```

### Animation / haptics / sound

- Spring entrance on the icon medallion (`stiffness: 300, damping: 20`).
- Haptics: `useHaptics().celebration()` on open.
- Confetti: **NO** — confetti is reserved for `TierUpModal`, not badge unlock.
- Sound: NO sound-effects module in the audit'd files.
- Auto-dismiss after 5s.

### Copy structure

```
[icon medallion in rarity color]
BADGE UNLOCKED          ← eyebrow, uppercase, tracking-widest
{badge.name}            ← H2, color = rarity frame color
{badge.description}     ← muted body text
[Continue]              ← single CTA button, rarity-colored bg, dark text
```

No "share" CTA.

### One-time-only logic

`celebration_shown` boolean on `user_badges`. Once `true`, the badge never re-fires. `BadgeCelebrationHost` only reads from the queue; the queue is filled by:

1. `useProfile`'s initial fetch (any `user_badges` row with `celebration_shown=false` is enqueued — see Section 9).
2. Direct call sites — `enqueueBadgeCelebrations(newlyUnlocked)` after every `checkAndUnlockBadges` call.

### Dismissal flow

- Auto-dismiss after 5000ms via `setTimeout` in the modal.
- Manual dismiss: tap the "Continue" button or the Dialog backdrop close.
- Either way: `BadgeCelebrationHost.handleClose()` runs `shiftBadgeCelebration()` (pop head of queue) THEN `await markCelebrationShown(supabase, current.userBadgeId)`. Next queue item then auto-renders.

---

## 7. Badge List View

Yes — full grid page exists at `src/app/(app)/badges/page.tsx`.

Layout (verbatim):

```tsx
export default function BadgesPage() {
  const router = useRouter();
  const { userBadges } = useAuthStore();
  useProfile();

  const unlockedMap = new Map(userBadges.map(ub => [ub.badge_id, ub.unlocked_at]));

  const allBadges: BadgeWithUnlockStatus[] = BADGE_IDS
    .map(id => {
      const catalog = BADGES_CATALOG[id];
      return {
        id, name: catalog.name, description: catalog.description,
        icon_name: catalog.iconName, rarity: catalog.rarity, sort_order: catalog.sortOrder,
        unlocked: unlockedMap.has(id),
        unlocked_at: unlockedMap.get(id) ?? null,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  const earned = allBadges.filter(b => b.unlocked);
  const locked = allBadges.filter(b => !b.unlocked);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="sticky top-0 ... h-14"> {/* back chevron + "Your Badges" title */} </div>
      <div className="px-4 md:px-8 pt-6 space-y-8">
        <p className="text-sm text-muted-foreground">
          Earned: <span className="text-foreground font-semibold">{earned.length}</span> of <span className="text-foreground font-semibold">{allBadges.length}</span>
        </p>
        {earned.length > 0 && (
          <div className="space-y-4">
            <h2 className="...">Earned</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-6">
              {earned.map(badge => <BadgeCard key={badge.id} badge={badge} size="md" />)}
            </div>
          </div>
        )}
        {locked.length > 0 && (
          <div className="space-y-4">
            <h2 className="...">Locked</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-6">
              {locked.map(badge => <BadgeCard key={badge.id} badge={badge} size="md" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

Sections in order: progress count ("Earned: 3 of 8") → "Earned" header + 3-col grid (4-col on sm+) → "Locked" header + same grid.

Locked vs unlocked treatment in `BadgeCard` (`src/components/badges/badge-card.tsx`):

```tsx
className={cn(
  'relative rounded-full flex items-center justify-center transition-transform',
  frameSizeClass,
  badge.unlocked ? 'hover:scale-105' : 'opacity-60 grayscale'
)}
style={{
  background: badge.unlocked ? config.frameGradient : 'var(--muted)',
  border: `2px solid ${badge.unlocked ? config.frameColor : 'var(--muted-foreground)'}`,
  boxShadow: badge.unlocked ? `0 0 20px ${config.frameColor}${glowHex}` : 'none',
}}
```

Locked badges get `opacity-60 grayscale` + a small `Lock` icon overlay on the bottom-right of the medallion. Description text below stays visible (gives the user the unlock criteria).

Tap behavior on locked badges: **none**. The card is a static `<div>`, not a button. Description text is the unlock-criteria reveal — there's no expanded "how to unlock" sheet.

`RecentBadges` (`src/components/dashboard/recent-badges.tsx`) — separate component that shows up-to-3 badges unlocked in the last 30 days as a horizontally-scrolling small-size strip with a "View all →" link. Renders only when there's something recent to show.

---

## 8. HealthRow Component

File: `src/components/dashboard/health-row.tsx` (full source — 92 lines):

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

export function HealthRow() {
  const router = useRouter();
  const supabase = createClient();
  const { user, streaks, momentum, userBadges, healthScore, setHealthScore } = useAuthStore();
  const { mutationCount } = useTransactionStore();

  useEffect(() => {
    if (!user) return;
    computeHealthScore(supabase, user.id).then(setHealthScore);
  }, [user, mutationCount]);

  const tier = momentum ? getTierProgress(momentum.total_points).tier : null;
  const loggingStreak = streaks?.logging_current ?? 0;
  const loggedToday = streaks ? hasLoggedToday(streaks) : true;
  const shouldPulse = loggingStreak > 0 && !loggedToday;
  const earnedBadges = userBadges.length;

  if (!healthScore) {
    return (
      <div className="w-full bg-card border border-border rounded-2xl px-4 py-3 h-[62px] animate-pulse" />
    );
  }

  const labelCfg = getLabelConfig(healthScore.total);

  return (
    <button
      onClick={() => router.push('/health')}
      className="w-full text-left bg-card border border-border rounded-2xl px-4 py-3 hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted-foreground text-sm">Your Sika score:</span>
            <span className="text-foreground text-sm font-bold tabular-nums">{healthScore.total}</span>
            <span className="text-muted-foreground/60 text-sm">·</span>
            <span className="text-sm font-semibold" style={{ color: labelCfg.color }}>
              {labelCfg.displayName}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {loggingStreak > 0 && (
              <>
                <motion.div
                  animate={shouldPulse ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                  className="flex items-center"
                >
                  <Flame className="w-3.5 h-3.5 text-[#F97316]" />
                </motion.div>
                <span className="text-muted-foreground text-xs tabular-nums">{loggingStreak}d</span>
              </>
            )}
            {tier && (
              <>
                {loggingStreak > 0 && <span className="text-muted-foreground/60 text-xs">·</span>}
                <TierIcon tier={tier.id} size={14} />
                <span className="text-muted-foreground text-xs">{tier.name}</span>
              </>
            )}
            {earnedBadges > 0 && (
              <>
                <span className="text-muted-foreground/60 text-xs">·</span>
                <span className="text-muted-foreground text-xs">{earnedBadges}/{TOTAL_BADGES} badges</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/70 shrink-0 ml-2" />
      </div>
    </button>
  );
}
```

### Layout

A single button (`<button>`) — full-width pill (`rounded-2xl`, `bg-card`, `border-border`, `px-4 py-3`).
- **Top row** (always present): `Your Sika score: {N} · {Label}` — N is bold tabular-nums foreground; Label is colored per `LABEL_THRESHOLDS`.
- **Bottom row** (`mt-0.5`, conditional segments separated by `·` dividers):
  - `🔥 {N}d` (only if `loggingStreak > 0`; pulses when not yet logged today)
  - `{TierIcon} {tier.name}` (only if momentum row exists)
  - `{earnedBadges}/8 badges` (only if `earnedBadges > 0`)
- **Trailing**: small `ChevronRight` icon (right-aligned).

The whole pill height is **62px** (matches the skeleton state's `h-[62px]`).

### Tap behaviors

The whole button taps to `/health`. There are **no per-sub-element tap targets** (the chevron, streak chip, tier chip, badges chip are NOT individually interactive on the dashboard surface). The `/health` page itself contains a "Related links" panel with separate cards for Streaks / Momentum / Goals / Badges, so per-surface drill-down lives there.

### Skeleton state

```tsx
<div className="w-full bg-card border border-border rounded-2xl px-4 py-3 h-[62px] animate-pulse" />
```

(Empty pulsing pill matching the loaded height.)

### Loading data flow

`HealthRow` is dependent on three store slices already populated by `useProfile`:
- `streaks` → from `streaks` table
- `momentum` → from `momentum` table
- `userBadges` → from `user_badges` table

The HealthRow itself runs `computeHealthScore` on mount and re-runs whenever `mutationCount` changes (transaction-store mutation tally). Until `healthScore` lands in the store, the skeleton renders. The streak/tier/badges fields are taken from already-populated `useAuthStore` slices, so they appear before the score does on a hot mount.

---

## 9. Data Dependencies

| Surface | Tables read | Computed where |
|---|---|---|
| Sika score | `profiles`, `streaks`, `goals`, `accounts`, `income_sources`, `transactions`, `goal_contributions` (via `fetchGoalAmounts`), `categories`, `budget_buckets` (via category join) | **Client-side** in `lib/health-score.ts`, called from `HealthRow` and `/health` page on mount + on `mutationCount` change. No cron, no API route. Not stored in DB. |
| Streaks | `streaks` (one row per user) | **Mutations** in `lib/streaks.ts` `updateLoggingStreak` / `updateSavingsStreak` called from `transaction-sheet.tsx:309` and `contribute-modal.tsx:80`. **Passive break detection** in `useStreakHealth` hook on dashboard load. **Read** in `useProfile()` and consumed everywhere from store. |
| Momentum | `momentum` (one row per user), `momentum_events` (event log, append-only) | **Mutations** in `lib/momentum.ts` `awardMomentum` called from transaction-sheet, contribute-modal, milestone hits. **Read** in `useProfile()`. |
| Badges | `user_badges` (rows for unlocked badges only); `BADGES_CATALOG` is a TS constant (no DB table for the catalog) | **Mutations** via `checkAndUnlockBadges` called from mutation handlers + dashboard `cycle_ended` effect. **Reads** in `useProfile()`. **Catalog** is hardcoded in `src/types/badge.ts`. |

### How profile load wires it all

`src/hooks/use-profile.ts` (verbatim):

```ts
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
    // Enqueue any that haven't had their celebration shown yet
    const pending = allBadges.filter(b => !b.celebration_shown);
    if (pending.length > 0) enqueueBadgeCelebrations(pending);
  }
}, [...]);
```

7 parallel reads on profile load. **Critical observation for iOS**: badges with `celebration_shown=false` are enqueued *during the initial profile load*, so a badge unlocked elsewhere (e.g. iOS) will fire its celebration on the next web load — and conversely, web unlocks will fire on iOS if iOS implements the same enqueue-on-load pattern.

### Store

`src/stores/auth-store.ts` exposes:
```ts
{
  streaks: Streaks | null,
  momentum: Momentum | null,
  userBadges: UserBadge[],
  badgeCelebrationQueue: BadgeCelebrationItem[],
  healthScore: HealthScore | null,
  // setters + enqueueBadgeCelebrations + shiftBadgeCelebration + reset
}
```

Note `enqueueBadgeCelebrations` deduplicates by `userBadgeId` so concurrent unlocks don't double-enqueue.

### No cron jobs touch any of these surfaces

The audit's grep for cron paths returns `/api/cron/generate-digest`, `/api/cron/income-reminders`, `/api/cron/insights-generate`, `/api/cron/monthly-generate` — none of which touch streaks/momentum/badges/health-score. All four surfaces are **fully on-demand**.

---

## 10. Hint Cards

HintIds defined in `src/lib/hints.ts:3-16`:

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

Of these, only **`streaks_intro`** is HealthRow-adjacent. There is **NO** `score_intro`, `health_score_intro`, `badge_intro`, `momentum_intro`, or anything similar. The HealthRow ships without an introductory hint card on the dashboard.

`streaks_intro` is not searched-for in this audit's source pass; it's likely shown on the `/streaks` page (which exists at `src/app/(app)/streaks/page.tsx` per the directory listing).

---

## 11. Animations

| Location | Animation | Trigger | Library |
|---|---|---|---|
| HealthRow flame icon | `scale: [1, 1.08, 1]` infinite, 1.5s easeInOut | `loggingStreak > 0 && !loggedToday` | framer-motion |
| HealthRow on first load | None — skeleton fades through `animate-pulse` then content swap (no transition between states) | mount | Tailwind |
| Sika score (number on /health page) | `initial={{ scale: 0.8, opacity: 0 }} → animate={{ scale: 1, opacity: 1 }}`, spring stiffness 200 damping 20 | mount when score lands | framer-motion |
| Factor bars (/health) | `initial={{ width: 0 }} animate={{ width: '${factor.score}%' }}` over 0.6s easeOut | mount | framer-motion |
| Badge unlock modal | Spring icon entry: stiffness 300, damping 20, scale 0.5→1, opacity 0→1; haptic celebration; auto-dismiss 5s | `open=true` | framer-motion + useHaptics |
| Tier-up modal | Same spring entry on tier icon + canvas-confetti burst (120 particles, spread 80) | `open=true` | framer-motion + canvas-confetti |
| Momentum float (`+N pts` chip) | `initial={{ opacity: 0, y: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 1, 0], y: -60, scale: 1 }}` over 1.6s, then `onDone` removes | `awardMomentum` resolves with non-zero points | framer-motion |
| StreakStrip flame/💰 emojis | `scale: [1, 1.15, 1]` infinite, 1.4s easeInOut | `!loggedToday` / `!savedThisWeek` | framer-motion |
| Score change animation (count-up) | **NOT IMPLEMENTED** — dashboard chip swaps the integer instantly | — | — |
| Streak increment animation (e.g. +1 fly-in) | **NOT IMPLEMENTED** — only the milestone toast and the existing always-on flame pulse | — | — |
| Badge entry on /badges page | **NOT IMPLEMENTED** — static grid, only the medallion's `hover:scale-105` |  | Tailwind |

**Sound**: no sound module appears in any of the inspected files. Haptic-only celebration via `useHaptics()`.

---

## iOS Implementation Notes (Phase 9)

### Models

```swift
// Sika score
struct HealthScore: Codable, Equatable {
    let total: Int                      // 0-100
    let label: HealthLabel              // enum: excellent / good / fair / needsAttention / critical
    let factors: [HealthFactor]
}
struct HealthFactor: Codable, Equatable, Identifiable {
    let id: FactorId                    // enum
    let name: String
    let weight: Int                     // % weight
    let score: Int                      // 0-100
    let description: String
    let tip: String?
}
enum FactorId: String, Codable { case emergencyCoverage, budgetDiscipline, consistency, goalCommitment, diversification }

// Streaks
struct Streaks: Codable, Equatable {
    let userId: String
    var loggingCurrent: Int
    var loggingLongest: Int
    var loggingLastDate: String?        // YYYY-MM-DD
    var savingsCurrent: Int
    var savingsLongest: Int
    var savingsLastWeek: String?        // YYYY-MM-DD (Monday of ISO week)
    var freezesBanked: Int              // 0..2
    var freezesEarnedTotal: Int
    var loggingMilestonesShown: [Int]
    var savingsMilestonesShown: [Int]
}

// Momentum (tier ladder, NOT direction signal)
struct Momentum: Codable, Equatable {
    let userId: String
    let totalPoints: Int                // lifetime accumulation
    let tier: Tier
}
enum Tier: String, Codable { case bronze, silver, gold, platinum, diamond }

// Badges
struct Badge: Codable, Equatable, Identifiable {
    let id: String                      // BadgeId
    let name: String
    let description: String
    let iconName: String                // SF Symbol mapped from web's Lucide name (see below)
    let rarity: BadgeRarity
    let sortOrder: Int
}
enum BadgeRarity: String, Codable { case common, rare }
struct UserBadge: Codable, Equatable, Identifiable {
    let id: String
    let userId: String
    let badgeId: String
    let unlockedAt: Date
    var celebrationShown: Bool
}

// Composed snapshot for HealthRow
struct HealthSnapshot: Equatable {
    let score: HealthScore?
    let streaks: Streaks?
    let momentum: Momentum?
    let userBadges: [UserBadge]
}
```

### SF Symbol mapping for badge icons

Web uses Lucide. iOS should map per badge:

| Lucide | SF Symbol candidate |
|---|---|
| Footprints     | `figure.walk` |
| Flame          | `flame.fill` |
| Target         | `target` |
| PiggyBank      | `dollarsign.circle.fill` (no native piggy bank — or custom asset) |
| Hash           | `number` |
| CalendarCheck  | `calendar.badge.checkmark` |
| Compass        | `safari` (or custom) |
| Shield         | `shield.fill` |

For tier icons (Medal/Award/Trophy/Crown/Gem): SF Symbols `medal.fill`, `rosette`, `trophy.fill`, `crown.fill`, `diamond.fill`. Phase 9 prompt should lock these.

### Service

```swift
final class HealthService {
    func fetchSnapshot(userId: String) async throws -> HealthSnapshot {
        async let streaksRow   = supabase.from("streaks").select("*").eq("user_id", userId).single()
        async let momentumRow  = supabase.from("momentum").select("*").eq("user_id", userId).single()
        async let userBadges   = supabase.from("user_badges").select("*").eq("user_id", userId).order("unlocked_at", ascending: false)
        async let score        = computeHealthScore(userId: userId)  // local
        return HealthSnapshot(
            score: try await score,
            streaks: try? await streaksRow.value,
            momentum: try? await momentumRow.value,
            userBadges: (try? await userBadges.value) ?? []
        )
    }

    func computeHealthScore(userId: String) async throws -> HealthScore { /* port lib/health-score.ts */ }

    func updateLoggingStreak(userId: String) async throws -> StreakUpdateResult { /* port */ }
    func updateSavingsStreak(userId: String) async throws -> StreakUpdateResult { /* port */ }
    func checkStreakHealth(userId: String) async throws -> (Streaks, loggingJustBroken: Bool, savingsJustBroken: Bool) { /* port */ }

    func awardMomentum(userId: String, event: MomentumEventType) async throws -> MomentumUpdateResult { /* port */ }

    func checkAndUnlockBadges(userId: String, trigger: BadgeTrigger) async throws -> [UserBadge] { /* port */ }
    func markCelebrationShown(userBadgeId: String) async throws { /* port */ }
}
```

### AppState integration

```swift
final class AppState: ObservableObject {
    @Published var healthSnapshot: HealthSnapshot?
    @Published var unviewedBadgeUnlocks: [UserBadge] = []   // queue (FIFO by unlockedAt asc)

    func loadProfile() async {
        // existing parallel fetch — add HealthService.fetchSnapshot in the same async let group
        let snap = try? await healthService.fetchSnapshot(userId: userId)
        await MainActor.run {
            self.healthSnapshot = snap
            // Enqueue any badge with celebration_shown == false
            let pending = (snap?.userBadges ?? []).filter { !$0.celebrationShown }
                .sorted { $0.unlockedAt < $1.unlockedAt }
            self.unviewedBadgeUnlocks = pending
        }
    }

    func markBadgeViewed(_ badge: UserBadge) async {
        // dequeue then persist celebrationShown = true
        await MainActor.run { unviewedBadgeUnlocks.removeAll { $0.id == badge.id } }
        try? await healthService.markCelebrationShown(userBadgeId: badge.id)
    }
}
```

The "enqueue on load" mirrors `useProfile.ts:36-37` — this is what makes web/iOS celebration handoff work.

### Components

- **`HealthRow`** — single horizontal pill, mirrors web 1:1. Tap → `HealthDetailView`.
- **`SikaScoreView`** — large number + label (the /health page hero card). Used inside `HealthDetailView`.
- **`StreakView`** — `🔥 5-day` chip; only renders when `loggingCurrent > 0`. The HealthRow embeds an inline mini-version of this.
- **`MomentumView`** — `<TierIcon> Bronze` chip. Same pattern.
- **`BadgeStrip`** — `3/8 badges` chip on HealthRow; separate horizontal scrolling strip for `RecentBadges`.
- **`BadgeCelebrationSheet`** — modal mirroring `badge-unlock-modal.tsx`. Auto-dismiss 5s, haptic on appear, no confetti, single-action "Continue" CTA. Driven by `unviewedBadgeUnlocks.first` from `AppState`.
- **`BadgeListView`** — `/badges` equivalent. Earned + Locked sections, 3- or 4-col grid, locked items grayscaled with lock overlay, no per-item tap.
- **`TierUpSheet`** (separate from BadgeCelebrationSheet) — confetti + tier icon. Fired from mutation handlers when `awardMomentum.tierChanged == true`.

### Slot on AuthenticatedHomeView

iOS Phase 9 should mirror web's render order: place `HealthRow` directly **between SundayRecap and the income summary section**. (After ShouldIBuy, after SundayRecap, before income.)

### Schema considerations

iOS does NOT need new tables. Existing tables on Supabase: `streaks`, `momentum`, `momentum_events`, `user_badges`, plus all the read sources for health-score (`profiles`, `goals`, `accounts`, `income_sources`, `transactions`, `categories`, `budget_buckets`, `goal_contributions`).

RLS posture is unchanged — these tables are already accessed by web's anon-client/cookie-session reads. The iOS Swift SDK will read them under the user's Supabase session via `auth.uid()`. No service-role usage.

Catalog: `BADGES_CATALOG` is a TypeScript constant on web with no DB table. iOS should ship the **same hardcoded catalog** (translated to Swift) and accept that adding a badge requires a coordinated client release on both platforms.

### Architecture decision: client-side vs server-side compute

**Recommend: client-side, mirroring web.**

Reasoning:

1. **Web is already client-side.** All four surfaces compute on the client (`computeHealthScore`, `updateLoggingStreak`, `awardMomentum`, `checkAndUnlockBadges`). There is no server endpoint to call, and adding one risks divergence.
2. **The shared truth is the database, not the formula.** Streaks, momentum, badge unlocks all persist to DB. The score doesn't persist — it's a pure function of DB state. Both platforms reading the same DB and computing locally produces identical results when the formula is identical.
3. **The Bearer auth helper from `feat/bearer-auth-decisions` is unrelated.** Phase 9 doesn't introduce iOS → web HTTP — iOS reads tables directly via Swift SDK with the user's JWT.
4. **Trade-off accepted: formula duplication.** TypeScript and Swift versions of `computeHealthScore` will need to be kept in lockstep when factor weights or thresholds change. This is acceptable because the formula is small (~150 LOC), well-tested in production on web, and the alternative (server endpoint) means an extra HTTP round trip for every dashboard load.
5. **Mutation handlers are a different question.** `updateLoggingStreak` / `awardMomentum` / `checkAndUnlockBadges` write to DB. iOS must port these too, otherwise an iOS-logged transaction won't tick the streak or unlock badges. Acceptable for the same reason — small, well-defined functions.

If the team wants to revisit later: a single `/api/health/snapshot` route that returns `{score, streaks, momentum, userBadges}` is plausible (one place to maintain the formula), but it's NOT required for Phase 9.

### Out of scope for Phase 9

- **The all-badges grid view** (`/badges` equivalent on iOS) — split into Phase 9.5 if scope is too large. The HealthRow + celebration sheet is the gamification minimum-viable surface.
- **Share-badge social flow** — does not exist on web.
- **Badge tier upgrades** — web doesn't do badge tiers (rarity is a styling axis, not a leveling axis). Don't invent tiered badge levels.
- **Custom badge artwork** — web uses Lucide; iOS should use SF Symbols (mapping table above) until a designer ships custom assets.
- **Trending up/down "momentum" indicator** — does NOT exist on web. Web's "momentum" is a tier ladder. Do not build a direction-signal UI.
- **Score count-up animation on dashboard** — not on web. Spring-in on the /health page detail is the only animated treatment of the number.
- **Server-side cron for badge checks** — web has none; iOS shouldn't introduce one for parity.
- **`streaks_intro` HintCard on iOS** — web has the HintId but the audit didn't verify its placement. If iOS wants a streaks intro, it's a Phase 9.x scope decision.
