# DailyDigest /daily Detail Page Audit — 2026-05-08

Auditor: Claude Code (read-only)
Purpose: Lock visual + interaction spec for iOS Phase 5c implementation —
DailyDigest banner + 4-story detail page.

Source of truth: web repo at branch `feat/welcome-push-and-pwa-install-guide`.
Builds on: `/audits/CRON_BANNERS_2026_05_08.md` (section 1).

---

## TL;DR for the iOS prompt author

The /daily page is **smaller than you might assume**:

- **One file**, no sub-components: `src/app/(app)/daily/page.tsx` (206 lines).
- **Story cards do NOT link out.** No tap target. The `source_url` field
  is stored on each `DailyStory` but **never rendered or navigated to**.
  The detail page is a passive read.
- **No share button.** No bookmark. No story-detail modal.
- **Mark-read is per-digest, not per-story.** A single
  `user_daily_reads` row gates whether the banner returns tomorrow.
- **Auto-read fires at 10 s** if the user is on the page that long
  *and* the digest hasn't already been marked read. There's also a
  manual "Mark as read" button as a backup.
- Mutation is a **direct Supabase insert** from the client — no API
  route. RLS scopes it.
- No framer-motion entrance animations on the story list (despite
  MonthlyRecap having them — these are different).

---

## 1. Page Route + Top-Level Component

File: `src/app/(app)/daily/page.tsx` (whole file — lines 1–205)

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

function ImageWithFallback({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { revalidateForEntity } from '@/lib/revalidation';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/daily';
import type { DailyDigest, DailyStory } from '@/types/daily';

const AUTO_READ_DELAY_MS = 10_000;

function StoryCard({ story }: { story: DailyStory }) {
  const color = CATEGORY_COLORS[story.category];
  const label = CATEGORY_LABELS[story.category];

  return (
    <article className="bg-card border border-border rounded-2xl overflow-hidden">
      {story.image_url && (
        <ImageWithFallback
          src={story.image_url}
          alt={story.title}
          className="w-full h-48 md:h-56 object-cover"
        />
      )}
      <div className="px-4 py-4 space-y-2">
        <p
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </p>
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5 shrink-0">{story.emoji}</span>
          <h3 className="text-foreground font-semibold text-sm leading-snug">{story.title}</h3>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{story.summary}</p>
        <p class<!-- linter doesn't matter --> className="text-muted-foreground/70 text-xs">— {story.source_name}</p>
      </div>
    </article>
  );
}

export default function DailyPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuthStore();
  useProfile();

  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRead, setIsRead] = useState(false);
  const autoReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from('sika_daily_digests')
      .select('*')
      .eq('digest_date', today)
      .single()
      .then(({ data }) => {
        if (data) setDigest(data as DailyDigest);
        setIsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check existing read status once we have user + digest
  useEffect(() => {
    if (!user || !digest) return;
    supabase
      .from('user_daily_reads')
      .select('id')
      .eq('user_id', user.id)
      .eq('digest_date', digest.digest_date)
      .single()
      .then(({ data }) => {
        if (data) setIsRead(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, digest]);

  // Auto-mark read after 10s
  useEffect(() => {
    if (!user || !digest || isRead) return;
    autoReadTimer.current = setTimeout(() => markRead(), AUTO_READ_DELAY_MS);
    return () => {
      if (autoReadTimer.current) clearTimeout(autoReadTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, digest, isRead]);

  async function markRead() {
    if (!user || !digest || isRead) return;
    await supabase
      .from('user_daily_reads')
      .insert({ user_id: user.id, digest_date: digest.digest_date })
      .select()
      .single();
    setIsRead(true);
    revalidateForEntity('digest_read');
  }

  const dateLabel = digest
    ? format(new Date(digest.digest_date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')
    : '';

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-card">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-foreground font-semibold text-base">Sika Daily</h1>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {/* Header skeleton */}
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-card animate-pulse" />
            </div>

            {/* Story card skeletons */}
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl bg-card border border-border px-4 py-4 space-y-3">
                <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-muted animate-pulse" />
                  <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-2.5 w-24 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Date + fallback badge */}
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">{dateLabel}</p>
              {digest?.is_fallback && (
                <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FBBF24]/10 text-[#FBBF24] uppercase tracking-wider">
                  Catch up from yesterday
                </span>
              )}
            </div>

            {/* Stories */}
            {digest && (
              <div className="space-y-3">
                {digest.stories.map((story: DailyStory) => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Mark as read button */}
        {!isLoading && digest && !isRead && (
          <button
            onClick={markRead}
            className="w-full py-3 rounded-2xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            Mark as read
          </button>
        )}

        {!isLoading && digest && isRead && (
          <p className="text-center text-xs text-muted-foreground/60 py-2">
            ✓ Read
          </p>
        )}
      </div>
    </div>
  );
}
```

> The strikethrough-looking line `class<!-- linter doesn't matter -->Name=...` above is an artifact of escaping in this audit doc. The actual file uses plain `className` (line 55). The verbatim file has no JSX comments inside the `StoryCard` body.

---

## 2. Story Card Component

File: `src/app/(app)/daily/page.tsx` lines 30–59 (defined inside the page module — there is no separate `story-card.tsx`).

### Verbatim source
```tsx
function StoryCard({ story }: { story: DailyStory }) {
  const color = CATEGORY_COLORS[story.category];
  const label = CATEGORY_LABELS[story.category];

  return (
    <article className="bg-card border border-border rounded-2xl overflow-hidden">
      {story.image_url && (
        <ImageWithFallback
          src={story.image_url}
          alt={story.title}
          className="w-full h-48 md:h-56 object-cover"
        />
      )}
      <div className="px-4 py-4 space-y-2">
        <p
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </p>
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5 shrink-0">{story.emoji}</span>
          <h3 className="text-foreground font-semibold text-sm leading-snug">{story.title}</h3>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{story.summary}</p>
        <p className="text-muted-foreground/70 text-xs">— {story.source_name}</p>
      </div>
    </article>
  );
}
```

### Props
The card takes a single `story: DailyStory`. Shape (from `src/types/daily.ts`, lines 3–13):

```ts
export interface DailyStory {
  id: string;
  category: DailyCategory;          // 'world_markets'|'africa_rising'|'tech_trends'|'young_money'
  title: string;
  summary: string;                  // 2–3 sentences
  source_name: string;
  source_url: string;               // stored but NOT rendered or navigated
  emoji: string;
  published_at: string;
  image_url: string | null;         // hero image, nullable
}
```

### Layout structure
- Outer `<article>` with `bg-card`, 1px `border-border`, `rounded-2xl`,
  and `overflow-hidden` (so the hero image's corners are clipped).
- **Hero image at the top**, full-width, fixed height `h-48` (192 px)
  on mobile / `h-56` (224 px) on `md:` and up, `object-cover`. Lazy-loaded.
  Hidden entirely on `onError`.
- **Body padded `px-4 py-4`** with `space-y-2` between rows.
- **Category label** (uppercase, 10 px font, bold, letter-spaced) inline-
  styled with the category's brand color from `CATEGORY_COLORS`:
  - `world_markets` → `#60A5FA` (blue)
  - `africa_rising` → `#00D9A3` (Sika green)
  - `tech_trends` → `#A78BFA` (purple)
  - `young_money` → `#FBBF24` (amber/gold)
  Labels from `CATEGORY_LABELS`: "World Markets", "Africa Rising",
  "Tech & Trends", "Young Money".
- **Title row**: emoji (text-xl, top-aligned) + title (foreground,
  semibold, sm). Gap-2 between.
- **Summary**: muted, sm, relaxed leading.
- **Source**: muted/70, xs, prefixed with em-dash and a leading space ("— Source Name").

### Image rendering — present vs null
```tsx
{story.image_url && (
  <ImageWithFallback ... />
)}
```
If `image_url` is `null`, the image block is omitted entirely; the body
sits flush with the top of the card. If the image URL fails to load,
the inner `ImageWithFallback` returns `null` (its `failed` state hides
it), so the body sits flush in that case too. **There is no
placeholder image, no skeleton retained, and no aspect-ratio spacer
when the image is missing.**

### Source attribution
- Placement: **bottom of the card body**, after the summary.
- Format: `— {source_name}` (em-dash + space + name).
- Styling: `text-muted-foreground/70 text-xs`.
- The `source_url` is **not rendered** — no anchor, no domain hint, no
  external-link icon. The user cannot navigate to the source from web.

### Category badge
Plain inline text label (no pill / chip background). Color comes from
the `CATEGORY_COLORS` map, applied via inline `style={{ color }}`.
Tracking-wider + uppercase + 10 px font + bold. There is **no
background or border on the category line** — it's a colored caption.

### Emoji placement
Inline with the title (left of the title), top-aligned (`mt-0.5`),
`shrink-0`, `text-xl` (≈20 px). Not in the image, not in the body — in
the heading row.

### Story-level dismiss/read tracking
**None.** Stories have no per-story state. The only "read" signal is at
the digest level (one row in `user_daily_reads` covers all 4 stories
for that date).

---

## 3. Auto-Mark-Read Behavior

### Timeout
- Constant: `AUTO_READ_DELAY_MS = 10_000` (10 000 ms = 10 s) at line 28.

### Trigger
The timer is **page-mount-driven**, not scroll-driven or interaction-driven.

```tsx
// Auto-mark read after 10s
useEffect(() => {
  if (!user || !digest || isRead) return;
  autoReadTimer.current = setTimeout(() => markRead(), AUTO_READ_DELAY_MS);
  return () => {
    if (autoReadTimer.current) clearTimeout(autoReadTimer.current);
  };
}, [user, digest, isRead]);
```

The effect runs when **all three** are truthy/false: user authed,
digest fetched, not yet read. So the 10 s clock starts the moment the
digest loads (after the user is known and the existing-read check has
not flipped `isRead` to true).

There is **no dwell or visibility check** — the timer fires even if
the user backgrounds the tab. There is **no scroll-to-bottom check**.

### Cleanup
- The effect's cleanup function (`return () => clearTimeout(...)`)
  cancels the timer on:
  - Unmount (navigation away)
  - Any of `[user, digest, isRead]` changing
- Specifically: when `isRead` flips to `true` (either via auto-read
  or manual button), the cleanup clears the timer (and the new
  effect run early-returns due to `isRead === true`).

### Mutation
The same `markRead` function is called by both the timer and the
manual button (line 190). See §4 for the payload.

### Analytics
`revalidateForEntity('digest_read')` is called after a successful
insert (line 119). This is an internal cache-invalidation signal, **not
a PostHog/analytics event** — there is no `analytics.captureXxx` call
in this file. The dashboard's read-state effect re-runs as a result.

---

## 4. Mark-As-Read Mutation

### Route
**Direct Supabase mutation from the client.** No `/api/...` route.

### Code
File: `src/app/(app)/daily/page.tsx` lines 111–120

```tsx
async function markRead() {
  if (!user || !digest || isRead) return;
  await supabase
    .from('user_daily_reads')
    .insert({ user_id: user.id, digest_date: digest.digest_date })
    .select()
    .single();
  setIsRead(true);
  revalidateForEntity('digest_read');
}
```

### Payload (insert columns)
```jsonc
{
  "user_id":      "<auth.uid()>",   // uuid
  "digest_date":  "YYYY-MM-DD"      // matches sika_daily_digests.digest_date
}
```

The `read_at` column is filled by the table default (`now()`), and
`id` is the table default (`uuid_generate_v4()`).

### Per-story or per-digest
**Per-digest.** A single row covers all 4 stories for that day.

### Idempotency / re-marking
The table has a uniqueness constraint `unique (user_id, digest_date)`
(see `0018_sika_daily.sql:19`). The client guards against duplicate
inserts with the `if (...isRead) return;` check, so a second insert
with the same key would otherwise raise a 23505. If iOS races (e.g.
manual button + auto-timer fire near-simultaneously), the second
insert will fail at the DB level — fine to silently swallow on iOS.

### RLS check
File: `supabase/migrations/0018_sika_daily.sql:23`

```sql
alter table user_daily_reads enable row level security;
create policy "own daily reads" on user_daily_reads for all using (auth.uid() = user_id);
```

`FOR ALL` — covers SELECT, INSERT, UPDATE, DELETE. iOS authed clients
can insert directly. No service-role hop required.

---

## 5. Page Layout

### Header (lines 129–140)
- Sticky (`sticky top-0 z-10`) with bg matching `bg-background` and a
  bottom border `border-b border-card`.
- Single row, height `h-14` (56 px), padded `px-4`.
- Left: chevron-left back button (`router.back()`), 32×32, hover
  effects, aria-label "Go back".
- Right of button: title `<h1>Sika Daily</h1>` (semibold base size).
- **No date in header** — the date renders below the header in the
  scrollable area.
- **No close (X) button.** Back-only navigation.
- **No share button.**

### Scroll body
Outer container: `max-w-2xl mx-auto pb-24` (constrained width, large
bottom padding to clear potential bottom nav).

Inside: `px-4 md:px-8 pt-6 space-y-4` — 16 px (24 px on md) horizontal
padding, 24 px top padding, vertical rhythm of 16 px between groups.

### Story list
Stories render in a **vertical stack** (no grid, no carousel):

```tsx
<div className="space-y-3">
  {digest.stories.map((story) => <StoryCard ... />)}
</div>
```

`space-y-3` = 12 px gap between cards. Always 4 cards (per the cron
filter in `src/lib/daily/filter-stories.ts`), but the page renders
whatever the array contains.

Above the list: a compact date + (optional) fallback badge block:
```tsx
<div className="space-y-1">
  <p className="text-muted-foreground text-sm">{dateLabel}</p>
  {digest?.is_fallback && (
    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FBBF24]/10 text-[#FBBF24] uppercase tracking-wider">
      Catch up from yesterday
    </span>
  )}
</div>
```
- `dateLabel` format: `"EEEE, MMMM d, yyyy"` → e.g. "Thursday, May 8, 2026".

### Footer (after stories)
Conditional, outside the loading branch:
- If `!isRead`: full-width "Mark as read" button (`w-full py-3 rounded-2xl border border-border`, muted text, hover lifts to foreground).
- If `isRead`: centered tiny "✓ Read" caption (muted/60, xs).

These are the **only post-list elements**. No "back to dashboard" CTA,
no share button, no related-content section.

### Loading state (lines 143–163)
- One header-line skeleton (h-4 w-48).
- Four card skeletons:
  - `rounded-2xl bg-card border border-border px-4 py-4`
  - h-2.5 w-20 (category line)
  - h-4 w-3/4 (title)
  - h-3 lines (full / 5/6 / 2/3) for summary
  - h-2.5 w-24 (source)
- **No image skeleton** in the loading state — the image slot is
  collapsed during loading.
- Skeletons use `animate-pulse`.

### Empty state
There is **no explicit empty state.** If the GET returns no row for
today, `setDigest` is never called (the `if (data)` guard skips), so
`digest` stays `null`, `setIsLoading(false)` runs, and the render
hits:
- `!isLoading` → falls into the `<>...</>` branch
- `digest` is null → date block renders with empty `dateLabel`
  (because `dateLabel` ternary returns `''`), the fallback badge is
  not rendered, and the `digest && (<div>...)` story list is skipped
- Footer button block (`!isLoading && digest && !isRead`) is skipped
  because `digest` is null.

Net effect: **a near-blank page with just the back arrow + header
title and a thin top-padding gap.** No "no digest yet" copy. iOS
should add an empty-state at minimum (the cron should always have
written by 06:00 UTC, but races happen).

---

## 6. Animations

- **None on the story list itself.** No framer-motion, no stagger, no
  transitions. The cards just appear when the loading branch flips.
  This is a notable contrast with `MonthlyRecap` (which uses framer-
  motion stagger on its card grid — see prior CRON_BANNERS audit).
- **Image lazy-load** uses the native browser `loading="lazy"`
  attribute on `<img>`. No fade-in; the image just appears when
  decoded.
- **Skeleton** uses Tailwind's `animate-pulse` (the standard 1.5 s
  fade-pulse).
- **Hover** transitions on the back button and "Mark as read" button
  are `transition-colors` (default 150 ms ease).
- **Sticky header** does not animate on scroll.

iOS can add subtle entrance animations if desired but they would be
*new behavior* — web has none.

---

## 7. Story Tap Interaction

**Stories are NOT tappable.** The `<article>` element has:
- No `onClick`
- No anchor wrapper
- No `role="button"` / `tabIndex`
- No `cursor-pointer` class

The component is a passive read. Users cannot:
- Open the source URL
- Open a story-detail modal
- Bookmark / save
- Share an individual story

The only interactive elements on the page are:
1. Back chevron (header)
2. "Mark as read" button (footer, before read)

This is a **deliberate v1 simplification** — `source_url` is captured
on the row and exists in the data shape, but the comment on
`src/types/daily.ts:9` reads:

```ts
source_url: string; // stored but NOT shown to user in v1
```

> Implication for iOS: the cleanest mirror is to make story cards
> non-tappable. If product wants story-tap → in-app browser, that's a
> *new feature* that the web hasn't shipped, and should be flagged
> rather than silently added.

---

## 8. Share / Other Actions

**None.**

Concretely, on `/daily`:
- No share button
- No bookmark / save
- No "open original" link
- No "next day / previous day" navigation
- No comments / reactions
- No "copy link" affordance

Compare to `MonthlyRecap` (which has a "Share my month" button at the
bottom — see CRON_BANNERS_2026_05_08.md §3). The daily page is
intentionally lighter.

---

## 9. Fallback Story Rendering

### Banner-side label
The banner (`SikaDailyBanner`) uses the wording **"Catch up"** vs
**"Fresh picks"** depending on `is_fallback`. See
CRON_BANNERS_2026_05_08.md §1.

### Detail page treatment
The /daily page renders the **`is_fallback`** flag as a small pill
badge directly under the date, only when true:

```tsx
{digest?.is_fallback && (
  <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FBBF24]/10 text-[#FBBF24] uppercase tracking-wider">
    Catch up from yesterday
  </span>
)}
```

- 10 px font, semibold, uppercase, letter-spaced
- Pill chrome: `bg-[#FBBF24]/10` (amber @ 10%), text `#FBBF24`,
  rounded-full, px-2 py-0.5
- Copy: **"Catch up from yesterday"** (different from the banner's
  "Catch up" — slightly more descriptive on the detail page)

### Story rendering — no special treatment
The `StoryCard` component renders whatever stories are in
`digest.stories` with **no branching on `is_fallback`**. The
`PLACEHOLDER_STORY` ("Quiet day in the markets", emoji 🌾) flows
through the same `StoryCard` template like any other story.

There is **no special "fallback" card chrome**, no warning copy
inside the card, no muted styling. The badge above the list is the
*only* visual cue.

> Note: the fallback-recovery path in `generate-digest.ts` (lines
> 82–97) actually re-uses **yesterday's stories array** when the
> pipeline fails — so on a fallback day the user sees *4 real stories
> from yesterday*, not the single 🌾 placeholder. The placeholder only
> appears if both today and yesterday have no successful generation.

---

## iOS Implementation Notes (Phase 5c)

### Models
Already speced in `CRON_BANNERS_2026_05_08.md` §1 / iOS Implementation
Notes. Reuse those. Specifically:

```swift
struct DailyStory: Codable, Identifiable {
  let id: String
  let category: DailyCategory  // .worldMarkets, .africaRising, .techTrends, .youngMoney
  let title: String
  let summary: String
  let sourceName: String
  let sourceURL: String        // stored, NOT shown in v1
  let emoji: String
  let publishedAt: Date
  let imageURL: String?        // hero image, nullable
}

struct DailyDigest: Codable, Identifiable {
  let id: String
  let digestDate: String       // YYYY-MM-DD
  let stories: [DailyStory]
  let isFallback: Bool
  let generatedAt: Date
}

struct UserDailyRead: Codable {
  let userID: UUID
  let digestDate: String
  let readAt: Date
}
```

Plus the iOS-side category color/label map:

```swift
enum DailyCategory: String, Codable, CaseIterable {
  case worldMarkets = "world_markets"
  case africaRising = "africa_rising"
  case techTrends   = "tech_trends"
  case youngMoney   = "young_money"

  var label: String {
    switch self {
    case .worldMarkets: return "World Markets"
    case .africaRising: return "Africa Rising"
    case .techTrends:   return "Tech & Trends"
    case .youngMoney:   return "Young Money"
    }
  }
  var brandColor: Color {
    switch self {
    case .worldMarkets: return Color(hex: 0x60A5FA)  // blue
    case .africaRising: return Color(hex: 0x00D9A3)  // Sika green
    case .techTrends:   return Color(hex: 0xA78BFA)  // purple
    case .youngMoney:   return Color(hex: 0xFBBF24)  // amber
    }
  }
}
```

### Service

```swift
@MainActor
final class SikaDailyService {
  let supabase: SupabaseClient

  /// Direct table read — no API route.
  func fetchTodayDigest() async throws -> DailyDigest? {
    let today = Date.todayYYYYMMDD()
    return try await supabase
      .from("sika_daily_digests")
      .select("*")
      .eq("digest_date", value: today)
      .maybeSingle()
      .execute()
      .value
  }

  /// Direct table read against user_daily_reads.
  func hasReadToday(userID: UUID, digestDate: String) async throws -> Bool {
    let row: UserDailyRead? = try await supabase
      .from("user_daily_reads")
      .select("id")
      .eq("user_id", value: userID)
      .eq("digest_date", value: digestDate)
      .maybeSingle()
      .execute()
      .value
    return row != nil
  }

  /// Direct table insert. RLS scopes by auth.uid(). Idempotent —
  /// duplicate inserts will violate the (user_id, digest_date) unique
  /// key and can be silently swallowed.
  func markRead(userID: UUID, digestDate: String) async {
    do {
      _ = try await supabase
        .from("user_daily_reads")
        .insert(["user_id": userID.uuidString,
                 "digest_date": digestDate])
        .execute()
    } catch {
      // 23505 unique violation = already marked, fine.
      // Other errors: log but don't surface.
    }
  }
}
```

> No story-tap behavior on web. iOS Phase 5c should match: story cards
> are passive. **Do not** wire `SFSafariViewController` or
> `openURL(sourceURL)` unless product explicitly upgrades the spec.

### AppState integration

```swift
@MainActor
final class HomeBannersState: ObservableObject {
  @Published var todayDigest: DailyDigest?
  @Published var digestRead: Bool = false
  // ... other Phase 5 banners

  /// Parallel-fetch in loadProfile / Home appear.
  func loadDailyDigest(userID: UUID) async {
    async let digest = sikaDailyService.fetchTodayDigest()
    todayDigest = (try? await digest) ?? nil
    if let d = todayDigest {
      digestRead = (try? await sikaDailyService.hasReadToday(
        userID: userID, digestDate: d.digestDate)) ?? false
    }
  }

  /// Banner trigger predicate — used by the banner slot on Home.
  var shouldShowDailyBanner: Bool {
    todayDigest != nil && !digestRead
  }

  func markDigestRead() async {
    guard let d = todayDigest, let uid = currentUserID, !digestRead else { return }
    await sikaDailyService.markRead(userID: uid, digestDate: d.digestDate)
    digestRead = true
  }
}
```

### Components

#### `DailyDigestBanner` (already covered in CRON_BANNERS audit)
No visual changes from this audit. The banner text on web reads:
- Title: "Today's Sika Daily"
- Subtitle: `"{N} {story|stories} · {Catch up | Fresh picks}"` —
  branches on `digest.isFallback`.

#### `DailyDigestDetailView`
This is the page. Skeleton:

```swift
struct DailyDigestDetailView: View {
  @EnvironmentObject var state: HomeBannersState
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        if let digest = state.todayDigest {
          dateHeader(digest: digest)
          VStack(spacing: 12) {
            ForEach(digest.stories) { DailyStoryCard(story: $0) }
          }
          markReadFooter
        } else {
          // Empty-state copy iOS adds — web has none. Recommended:
          Text("No digest yet — check back later")
            .foregroundStyle(.secondary)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 24)
      .padding(.bottom, 96)   // pb-24 equivalent
    }
    .navigationTitle("Sika Daily")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .navigationBarLeading) {
        Button { dismiss() } label: { Image(systemName: "chevron.left") }
      }
    }
    .task { await startAutoReadTimer() }
  }

  // ... auto-read timer (see below)
}
```

#### `DailyStoryCard`
```swift
struct DailyStoryCard: View {
  let story: DailyStory

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let urlStr = story.imageURL, let url = URL(string: urlStr) {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let img):
            img.resizable()
               .aspectRatio(contentMode: .fill)
          case .failure: EmptyView()  // matches web's onError → null
          default:       Color.clear
          }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 192)   // h-48; bump to 224 (h-56) on regular size class if desired
        .clipped()
      }

      VStack(alignment: .leading, spacing: 8) {
        Text(story.category.label)
          .font(.system(size: 10, weight: .bold))
          .tracking(1.5)
          .textCase(.uppercase)
          .foregroundStyle(story.category.brandColor)

        HStack(alignment: .top, spacing: 8) {
          Text(story.emoji).font(.system(size: 20))
          Text(story.title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.primary)
        }

        Text(story.summary)
          .font(.system(size: 14))
          .foregroundStyle(.secondary)

        Text("— \(story.sourceName)")
          .font(.system(size: 12))
          .foregroundStyle(.secondary.opacity(0.7))
      }
      .padding(16)
    }
    .background(.thickMaterial)            // bg-card analogue
    .overlay(RoundedRectangle(cornerRadius: 16).stroke(.separator))
    .clipShape(RoundedRectangle(cornerRadius: 16))   // rounded-2xl + overflow-hidden
    // NO onTapGesture — stories are not tappable on web v1.
  }
}
```

### Slot on `AuthenticatedHomeView`
Same as previously documented in CRON_BANNERS audit:

```
1. DailyDigestBanner (top of banner stack, above InsightStrip + MonthlyRecap)
2. DailyInsightBanner
3. MonthlyRecapBanner
```

Banner trigger: `state.todayDigest != nil && !state.digestRead`.

### Auto-mark-read timer (SwiftUI pattern)

```swift
private func startAutoReadTimer() async {
  guard !state.digestRead, state.todayDigest != nil else { return }
  do {
    try await Task.sleep(for: .seconds(10))   // matches AUTO_READ_DELAY_MS = 10_000
    await state.markDigestRead()
  } catch {
    // Task cancelled (view disappeared) — do nothing.
  }
}
```

Attach via `.task { await startAutoReadTimer() }` on the detail view.
SwiftUI cancels the underlying `Task` automatically when the view
disappears (matches web's `clearTimeout` cleanup).

The "Mark as read" manual button is also a good idea for parity:

```swift
private var markReadFooter: some View {
  Group {
    if !state.digestRead {
      Button { Task { await state.markDigestRead() } } label: {
        Text("Mark as read")
          .frame(maxWidth: .infinity, minHeight: 44)
      }
      .buttonStyle(.bordered)
      .clipShape(RoundedRectangle(cornerRadius: 16))
    } else {
      Text("✓ Read")
        .font(.caption)
        .foregroundStyle(.tertiary)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
  }
}
```

### Story tap (URL handling)
**Skip.** Web v1 has no story-tap. iOS v1 should match. The
`sourceURL` is captured on the model so a later spec bump can wire
`SFSafariViewController` without a model migration.

If iOS product later opts to ship story-tap → in-app browser:

```swift
.onTapGesture {
  // Optional v2 — flag to product that web doesn't have this.
  guard let url = URL(string: story.sourceURL), !story.sourceURL.isEmpty else { return }
  // Present SFSafariViewController via a Coordinator wrapper.
}
```

Recommended `SFSafariViewController` over plain `openURL` for the
in-app feel.

### Schema considerations
Already covered in CRON_BANNERS audit §6. Recap:

| Table | Operation | RLS |
| --- | --- | --- |
| `sika_daily_digests` | SELECT (read today's row) | No RLS — table is shared across users; the cron service-role inserts. |
| `user_daily_reads` | SELECT + INSERT (per user, per date) | RLS `for all using auth.uid() = user_id`. |

No new migrations. No new endpoints. iOS uses the authed Supabase
client for both tables.

### Source-of-truth file for iOS Phase 5c prompt
A single file holds the entire detail page:
**`src/app/(app)/daily/page.tsx`** (206 lines).

Plus the previously-shared types file: **`src/types/daily.ts`** (42
lines, including `CATEGORY_LABELS` and `CATEGORY_COLORS` maps that iOS
needs to mirror).
