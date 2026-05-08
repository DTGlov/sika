# Cron-Fed Home Banners Audit — 2026-05-08

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Phase 5 implementation —
DailyDigest, DailyInsight, MonthlyRecap banners.

Source of truth: web repo at branch `feat/welcome-push-and-pwa-install-guide`.

---

## ⚠️ Important note up front — naming mismatch

The web codebase does **not** use the names `DailyDigest`, `DailyInsight`,
`MonthlyRecap` as banner-component names. The actual mapping is:

| iOS Phase 5 name | Web component file | Web table |
| --- | --- | --- |
| `DailyDigest` (morning) | `src/components/dashboard/sika-daily-banner.tsx` (`SikaDailyBanner`) | `sika_daily_digests` |
| `DailyInsight` (afternoon/personalized) | `src/components/dashboard/insight-strip.tsx` (`InsightStrip`) | `daily_insights` |
| `MonthlyRecap` (cycle-end) | `src/components/dashboard/sika-monthly-banner.tsx` (`SikaMonthlyBanner`) — banner only; full card grid is `src/components/monthly/monthly-recap.tsx` (`MonthlyRecap`) on the `/monthly` route | `monthly_recaps` |

There is also a TypeScript `DailyDigest` interface at `src/types/daily.ts` that
matches the data shape, and a TypeScript `MonthlyRecap` type at
`src/types/monthly.ts`. There is no shared `BannerCard` parent component —
each banner has bespoke chrome (described in §6 of each banner section).

A second important note: **`DailyDigest` is *not* a personalized financial
summary in web.** It is a 4-story news digest (Africa-rising / world-markets /
tech / young-money RSS feeds, summarized by Claude). One row per *date*
shared across *all* users. If iOS Phase 5 expects "yesterday_spent / top
category / streak" content, that maps to `DailyInsight`, not `DailyDigest`.

---

## 1. DailyDigest (a.k.a. SikaDailyBanner)

### Component
File: `src/components/dashboard/sika-daily-banner.tsx` (lines 1–33)

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
            {digest.stories.length} {digest.stories.length === 1 ? 'story' : 'stories'} · {digest.is_fallback ? 'Catch up' : 'Fresh picks'}
          </div>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}
```

### TypeScript shape
File: `src/types/daily.ts` (lines 1–42)

```ts
export type DailyCategory = 'world_markets' | 'africa_rising' | 'tech_trends' | 'young_money';

export interface DailyStory {
  id: string;
  category: DailyCategory;
  title: string;
  summary: string; // 2-3 sentences, AI-generated
  source_name: string;
  source_url: string; // stored but NOT shown to user in v1
  emoji: string;
  published_at: string;
  image_url: string | null; // full-width hero image, nullable
}

export interface DailyDigest {
  id: string;
  digest_date: string; // YYYY-MM-DD
  stories: DailyStory[];
  is_fallback: boolean;
  generated_at: string;
}

export interface UserDailyRead {
  user_id: string;
  digest_date: string;
  read_at: string;
}
```

### Backing Tables
File: `supabase/migrations/0018_sika_daily.sql` (lines 1–73)

```sql
-- One row per daily digest (shared across all users)
create table sika_daily_digests (
  id uuid primary key default uuid_generate_v4(),
  digest_date date not null unique,
  stories jsonb not null, -- array of story objects
  is_fallback boolean default false,
  generated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index idx_sika_daily_digests_date on sika_daily_digests(digest_date desc);

-- Per-user read tracking
create table user_daily_reads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  digest_date date not null,
  read_at timestamptz default now(),
  unique (user_id, digest_date)
);

alter table user_daily_reads enable row level security;
create policy "own daily reads" on user_daily_reads for all using (auth.uid() = user_id);

create index idx_user_daily_reads_user on user_daily_reads(user_id, digest_date desc);

-- RSS sources registry
create table sika_daily_sources (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  rss_url text not null,
  category text not null check (category in ('world_markets','africa_rising','tech_trends','young_money')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- (seed inserts elided)

-- Two-day cleanup function (run daily after new digest is generated)
create or replace function cleanup_old_digests()
returns void language plpgsql as $$
begin
  delete from sika_daily_digests
  where digest_date < (
    select digest_date
    from sika_daily_digests
    order by digest_date desc
    offset 2
    limit 1
  );
end;
$$;
```

> **Important:** `sika_daily_digests` has **no `user_id`** — one row per
> date is shared across all users. There is no RLS on `sika_daily_digests`
> itself; iOS reads it directly, and read state is tracked separately in
> `user_daily_reads`.

### Cron Job
File: `src/app/api/cron/generate-digest/route.ts` (lines 1–11)

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

Schedule: `0 6 * * *` (06:00 UTC daily) — see §4 cron coordination.

Generation logic — File: `src/lib/daily/generate-digest.ts` (lines 1–137):

```ts
import { createClient } from '@/lib/supabase/server';
import { fetchRssSources, fetchAllCandidates } from './fetch-rss';
import { filterStories } from './filter-stories';
import { summarizeStory } from './summarize';
import type { DailyDigest, DailyStory } from '@/types/daily';

const PLACEHOLDER_STORY: DailyStory = {
  id: crypto.randomUUID(),
  category: 'world_markets',
  title: 'Quiet day in the markets',
  summary: "The world took a breath today. We're back tomorrow with fresh picks. In the meantime — check your budget, maybe? 🌾",
  source_name: 'Sika Daily',
  source_url: '',
  emoji: '🌾',
  published_at: new Date().toISOString(),
  image_url: null,
};

export async function generateDigest(): Promise<{ success: boolean; digest_date: string; is_fallback: boolean; story_count: number }> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Skip if today's digest already exists
  const { data: existing } = await supabase
    .from('sika_daily_digests')
    .select('id')
    .eq('digest_date', today)
    .single();

  if (existing) {
    return { success: true, digest_date: today, is_fallback: false, story_count: 0 };
  }

  let stories: DailyStory[] = [];
  let isFallback = false;

  try {
    // 1. Fetch sources + candidates
    const sources = await fetchRssSources(supabase);
    const candidates = await fetchAllCandidates(sources);

    if (candidates.length > 0) {
      // 2. Filter: Claude picks 4 best stories
      const selected = await filterStories(candidates);

      if (selected.length > 0) {
        // 3. Summarize each selected story
        const candidateMap = new Map(candidates.map(c => [c.source_id, c]));

        const summarized = await Promise.allSettled(
          selected.map(async sel => {
            const candidate = candidateMap.get(sel.source_id);
            if (!candidate) return null;

            const { title, summary, emoji } = await summarizeStory(candidate);

            const story: DailyStory = {
              id: crypto.randomUUID(),
              category: sel.category,
              title,
              summary,
              emoji,
              source_name: candidate.source_name,
              source_url: candidate.source_url,
              published_at: candidate.published_at,
              image_url: candidate.image_url,
            };
            return story;
          })
        );

        stories = summarized
          .filter(r => r.status === 'fulfilled' && r.value !== null)
          .map(r => (r as PromiseFulfilledResult<DailyStory>).value);
      }
    }
  } catch {
    // Pipeline failed — fall through to fallback logic
  }

  // Fallback logic
  if (stories.length === 0) {
    isFallback = true;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { data: yesterdayDigest } = await supabase
      .from('sika_daily_digests')
      .select('stories')
      .eq('digest_date', yesterday)
      .single();

    if (yesterdayDigest?.stories) {
      stories = yesterdayDigest.stories as DailyStory[];
    } else {
      stories = [PLACEHOLDER_STORY];
    }
  }

  // 4. Store digest
  await supabase.from('sika_daily_digests').insert({
    digest_date: today,
    stories,
    is_fallback: isFallback,
    generated_at: new Date().toISOString(),
  });

  // 5. Cleanup old digests (keep only 2 most recent)
  await supabase.rpc('cleanup_old_digests');

  return { success: true, digest_date: today, is_fallback: isFallback, story_count: stories.length };
}

export async function getTodayDigest(): Promise<DailyDigest | null> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from('sika_daily_digests')
    .select('*')
    .eq('digest_date', today)
    .single();

  return data as DailyDigest | null;
}

export async function hasUserReadDigest(userId: string, digestDate: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('user_daily_reads')
    .select('id')
    .eq('user_id', userId)
    .eq('digest_date', digestDate)
    .single();

  return !!data;
}
```

### Fetch Hook
The dashboard fetches the digest **inline** (no dedicated hook). From
`src/app/(app)/dashboard/page.tsx` (lines 100–123):

```ts
// Fetch today's digest and read status
useEffect(() => {
  if (!user) return;
  const today = new Date().toISOString().slice(0, 10);
  supabase
    .from('sika_daily_digests')
    .select('*')
    .eq('digest_date', today)
    .single()
    .then(({ data: digest }) => {
      if (!digest) { setDigestLoading(false); return; }
      setTodayDigest(digest as DailyDigest);
      supabase
        .from('user_daily_reads')
        .select('id')
        .eq('user_id', user.id)
        .eq('digest_date', today)
        .single()
        .then(({ data: read }) => {
          setDigestRead(!!read);
          setDigestLoading(false);
        });
    });
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [user]);
```

The banner only renders when `todayDigest && !digestRead` — once read, the
banner is suppressed for the rest of the day.

### Dismiss Pattern
**There is no dismiss API.** The banner hides when the user is marked as
having "read" today's digest, and reading is implicit:

- Tapping the banner navigates to `/daily`.
- The `/daily` page sets a 10s auto-read timer and inserts into
  `user_daily_reads`.

From `src/app/(app)/daily/page.tsx` (lines 102–120):

```ts
// Auto-mark read after 10s
useEffect(() => {
  if (!user || !digest || isRead) return;
  autoReadTimer.current = setTimeout(() => markRead(), AUTO_READ_DELAY_MS);
  return () => {
    if (autoReadTimer.current) clearTimeout(autoReadTimer.current);
  };
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
```

So the dismiss is **per-day, scoped to today's digest, set automatically
on read**. No X button. No swipe.

### Content Fields (what the banner shows)
- `stories.length` → "N stories"
- `is_fallback: boolean` → "Catch up" (true) or "Fresh picks" (false)
- Static emoji 📰 + "Today's Sika Daily" title

The banner does **not** display individual story content — those render on
the `/daily` route. It only teases that today's digest exists.

### Visual Structure
- Card chrome: `rounded-xl`, `bg-card`, border `#D4A017/20` (Sika gold @ 20%
  opacity), green glow shadow `0 0 20px rgba(0,217,163,0.08)`
- Padding: `px-4 py-3`
- Layout: emoji icon (text-xl) + 2-line text block + chevron-right caret
- Dismiss control: **none** (auto-read on `/daily` visit)
- Animations: none on the banner itself

---

## 2. DailyInsight (a.k.a. InsightStrip)

### Component
File: `src/components/dashboard/insight-strip.tsx` (lines 1–69)

```tsx
'use client';

import { useState } from 'react';
import { X, TrendingUp, Flame, Eye, Target, Sparkles, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import type { DailyInsightRow } from '@/types/insight';

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, Flame, Eye, Target, Sparkles, ArrowRight, Zap, RefreshCw,
};

const ACCENT_STYLES: Record<string, { border: string; glow: string; text: string }> = {
  green:   { border: 'border-[#D4A017]/20', glow: 'shadow-[0_0_20px_rgba(0,217,163,0.06)]',   text: 'text-[#D4A017]' },
  amber:   { border: 'border-[#FBBF24]/20', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.06)]',  text: 'text-[#FBBF24]' },
  red:     { border: 'border-[#F87171]/20', glow: 'shadow-[0_0_20px_rgba(248,113,113,0.06)]', text: 'text-[#F87171]' },
  blue:    { border: 'border-[#60A5FA]/20', glow: 'shadow-[0_0_20px_rgba(96,165,250,0.06)]',  text: 'text-[#60A5FA]' },
  neutral: { border: 'border-border',       glow: '',                                           text: 'text-muted-foreground' },
};

interface InsightStripProps {
  row: DailyInsightRow;
  onDismiss: () => void;
}

export function InsightStrip({ row, onDismiss }: InsightStripProps) {
  const [dismissing, setDismissing] = useState(false);
  const { insight_data: insight } = row;
  const accent = ACCENT_STYLES[insight.accent] ?? ACCENT_STYLES.neutral;
  const IconComponent = insight.icon ? (ICON_MAP[insight.icon] ?? Sparkles) : Sparkles;

  async function handleDismiss() {
    setDismissing(true);
    try {
      await fetch('/api/insights/dismiss', { method: 'POST' });
    } finally {
      onDismiss();
    }
  }

  if (dismissing) return null;

  return (
    <div
      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-card border ${accent.border} ${accent.glow}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`shrink-0 mt-0.5 ${accent.text}`}>
          <IconComponent className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">{insight.headline}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{insight.body}</p>
          {insight.stat && (
            <p className={`text-xs font-semibold mt-1 tabular-nums ${accent.text}`}>
              {insight.stat.label}: {insight.stat.value}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-muted-foreground/70 hover:text-muted-foreground transition-colors p-1"
        aria-label="Dismiss insight"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
```

### TypeScript shape
File: `src/types/insight.ts` (lines 1–28)

```ts
export type InsightKind =
  | 'budget_pacing'
  | 'category_trend'
  | 'goal_nudge'
  | 'streak_boost'
  | 'subscription_alert'
  | 'reflection'
  | 'quick_win';

export type InsightAccent = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export type DailyInsight = {
  kind: InsightKind;
  headline: string;
  body: string;
  accent: InsightAccent;
  stat?: { label: string; value: string };
  icon?: string;
};

export type DailyInsightRow = {
  id: string;
  user_id: string;
  insight_date: string;
  insight_data: DailyInsight;
  generated_at: string;
  dismissed_at: string | null;
};
```

### Backing Table
File: `supabase/migrations/0023_daily_insights.sql` (lines 1–22)

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

CREATE INDEX idx_daily_insights_user_date
  ON daily_insights(user_id, insight_date DESC);

ALTER TABLE daily_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own insights"
  ON daily_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own insights"
  ON daily_insights FOR UPDATE
  USING (auth.uid() = user_id);
```

> Note: SELECT and UPDATE policies are present; **INSERT is server-only**
> via the cron's service-role client. iOS clients cannot insert into this
> table directly — they must hit the trigger endpoint.

### Cron Job
File: `src/app/api/cron/insights-generate/route.ts` (lines 1–67)

```ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeInsightContext } from '@/lib/insights/compute-insight-context';
import { generateInsight } from '@/lib/insights/generate-insight';
import { sendPushToUser } from '@/lib/push-sender';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const supabase = createServiceClient();

  const { data: profiles } = await supabase.from('profiles').select('id');

  const results = {
    total: (profiles ?? []).length,
    generated: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const profile of profiles ?? []) {
    try {
      const { data: existing } = await supabase
        .from('daily_insights')
        .select('id')
        .eq('user_id', profile.id)
        .eq('insight_date', today)
        .maybeSingle();

      if (existing) {
        results.skipped++;
        continue;
      }

      const ctx = await computeInsightContext(supabase, profile.id, now);
      const insight = await generateInsight(ctx);

      await supabase.from('daily_insights').insert({
        user_id: profile.id,
        insight_date: today,
        insight_data: insight,
      });

      results.generated++;

      await sendPushToUser(supabase, profile.id, {
        title: insight.headline || 'Sika has something for you today',
        body: insight.body || "Tap to see today's insight.",
        url: '/dashboard',
        tag: 'daily-insight',
      });
    } catch (err) {
      results.failed++;
      results.errors.push(`${profile.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json(results);
}
```

Schedule: `30 0 * * *` (00:30 UTC daily). Per-user iteration; each row is
generated by Claude Sonnet 4.6 from a per-user `InsightContext` (cycle
position, bucket spend, recent transactions, streak, goals, subscription
heuristic).

The generator (`src/lib/insights/generate-insight.ts`):

```ts
import Anthropic from '@anthropic-ai/sdk';
import { INSIGHT_VOICE_PROMPT } from '@/lib/ai/insight-voice-prompt';
import type { DailyInsight } from '@/types/insight';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function generateInsight(ctx: unknown): Promise<DailyInsight> {
  const userMessage = `Here's the user's current money picture:\n\n${JSON.stringify(ctx, null, 2)}\n\nWhat's today's insight?`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: INSIGHT_VOICE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed?.headline || !parsed?.body || !parsed?.kind) {
    throw new Error('Invalid insight: missing required fields');
  }
  if (parsed.headline.split(' ').length > 12) {
    throw new Error(`Headline exceeds 12 words: "${parsed.headline}"`);
  }

  return parsed as DailyInsight;
}
```

Error handling: per-user try/catch, failures land in `results.errors[]` —
the cron never aborts the whole batch on one user's failure. There is no
per-user retry; if the cron run fails for user X today, that user simply
has no insight today.

### Fetch Endpoint
File: `src/app/api/insights/today/route.ts` (lines 1–19)

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('daily_insights')
    .select('*')
    .eq('user_id', user.id)
    .eq('insight_date', today)
    .maybeSingle();

  return NextResponse.json({ insight: data ?? null });
}
```

Dashboard call site (`src/app/(app)/dashboard/page.tsx` lines 147–156):

```ts
// Fetch today's AI insight
useEffect(() => {
  if (!user) return;
  fetch('/api/insights/today')
    .then(r => r.json())
    .then(({ insight }) => {
      if (insight && !insight.dismissed_at) setTodayInsight(insight);
    })
    .catch(() => {});
}, [user]);
```

The "is there content to show" check is: `insight !== null && insight.dismissed_at == null`.

### Trigger-on-demand Endpoint
File: `src/app/api/insights/trigger-for-me/route.ts` (lines 1–26) — used
when the user wants to regenerate today's insight (e.g. dev/test):

```ts
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const service = createServiceClient();

  const ctx = await computeInsightContext(service, user.id, now);
  const insight = await generateInsight(ctx);

  await service.from('daily_insights').upsert({
    user_id: user.id,
    insight_date: today,
    insight_data: insight,
  }, { onConflict: 'user_id,insight_date' });

  return NextResponse.json({ success: true, insight });
}
```

### Dismiss Pattern
File: `src/app/api/insights/dismiss/route.ts` (lines 1–22)

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('daily_insights')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('insight_date', today)
    .is('dismissed_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

**Dismiss is per-day**: setting `dismissed_at` only affects today's row;
tomorrow's cron generates a fresh row that is un-dismissed by default. So
"skip until next one" semantics — not permanent.

### Content Fields (in `insight_data` JSONB)
- `kind: 'budget_pacing' | 'category_trend' | 'goal_nudge' | 'streak_boost' | 'subscription_alert' | 'reflection' | 'quick_win'` — categorical type
- `headline: string` — ≤12 words, validated server-side
- `body: string` — explanatory copy
- `accent: 'green' | 'amber' | 'red' | 'blue' | 'neutral'` — color treatment
- `stat?: { label: string; value: string }` — optional numeric callout (e.g. "Spent today: ₵42")
- `icon?: string` — Lucide icon name; falls back to `Sparkles`

The row wrapper additionally exposes `id`, `user_id`, `insight_date`,
`generated_at`, `dismissed_at`.

### Visual Structure
- Card chrome: `rounded-xl`, `bg-card`, accent-tinted border (varies by
  `insight.accent`), faint colored glow shadow
- Padding: `px-4 py-3`
- Layout: small accent-colored Lucide icon (top-aligned) + headline (sm
  semibold) + body (xs muted) + optional stat row (xs accent semibold)
- Dismiss control: **X button** (right-aligned, `w-3.5 h-3.5`) → POST
  `/api/insights/dismiss`
- Animations: none; relies on `dismissing` state to remove from tree
  after fetch completes

---

## 3. MonthlyRecap (a.k.a. SikaMonthlyBanner + MonthlyRecap detail)

The monthly recap has two surfaces:
1. **Banner** (`SikaMonthlyBanner`) on the dashboard — small entry point
2. **Detail page** (`MonthlyRecap` on `/monthly`) — full card grid

iOS Phase 5 is most likely the banner (matching the cadence of
`DailyDigest` / `DailyInsight`). Both are documented.

### Banner Component
File: `src/components/dashboard/sika-monthly-banner.tsx` (lines 1–56)

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, X } from 'lucide-react';

interface SikaMonthlyBannerProps {
  recapId: string;
}

export function SikaMonthlyBanner({ recapId }: SikaMonthlyBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    fetch('/api/monthly/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recap_id: recapId }),
    }).catch(() => {});
  }

  return (
    <div className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-card border border-[#FBBF24]/20 shadow-[0_0_20px_rgba(251,191,36,0.06)]">
      <button
        onClick={() => router.push('/monthly')}
        className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline-none"
      >
        <div className="text-xl shrink-0">🔥</div>
        <div>
          <div className="text-sm font-semibold text-foreground">Your month in money is ready</div>
          <div className="text-xs text-muted-foreground">5–7 takeaways from your last budget cycle →</div>
        </div>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => router.push('/monthly')}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="View recap"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground/70 hover:text-muted-foreground transition-colors p-1"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
```

### Detail-Page Component (`/monthly`)
File: `src/components/monthly/monthly-recap.tsx` (lines 1–177)

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Flame, Eye, Target, ArrowRight, Sparkles, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { shareMonthly } from '@/lib/share-monthly';
import { analytics } from '@/lib/analytics/identify';
import type { MonthlyCard, MonthlyAccent } from '@/types/monthly';

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, Flame, Eye, Target, ArrowRight, Sparkles,
};

const ACCENT_CLASS: Record<MonthlyAccent, string> = {
  green: 'text-[#D4A017]',
  amber: 'text-[#FBBF24]',
  red: 'text-[#F43F5E]',
  blue: 'text-[#60A5FA]',
  neutral: 'text-foreground',
};

const ACCENT_BG: Record<MonthlyAccent, string> = {
  green: 'bg-[#D4A017]/10 border-[#D4A017]/20',
  amber: 'bg-[#FBBF24]/10 border-[#FBBF24]/20',
  red: 'bg-[#F43F5E]/10 border-[#F43F5E]/20',
  blue: 'bg-[#60A5FA]/10 border-[#60A5FA]/20',
  neutral: 'bg-muted border-border',
};

interface MonthlyCardItemProps {
  card: MonthlyCard;
  index: number;
}

function MonthlyCardItem({ card, index }: MonthlyCardItemProps) {
  const accent: MonthlyAccent = card.accent_color ?? 'neutral';
  const Icon = card.icon ? (ICON_MAP[card.icon] ?? Sparkles) : Sparkles;
  const isHeadline = card.type === 'headline';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: index * 0.08 }}
      className={`rounded-3xl border p-6 ${ACCENT_BG[accent]}`}
    >
      {isHeadline ? (
        <div className="text-center space-y-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto ${ACCENT_BG[accent]}`}>
            <Icon className={`w-5 h-5 ${ACCENT_CLASS[accent]}`} />
          </div>
          <p className={`text-2xl font-bold leading-tight ${ACCENT_CLASS[accent]} amount`}>
            {card.headline}
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
          {card.stat && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border">
              <span className="text-muted-foreground text-xs">{card.stat.label}</span>
              <span className={`text-sm font-bold amount ${ACCENT_CLASS[accent]}`}>{card.stat.value}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${ACCENT_BG[accent]}`}>
              <Icon className={`w-4 h-4 ${ACCENT_CLASS[accent]}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-base font-bold leading-snug ${ACCENT_CLASS[accent]}`}>
                {card.headline}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
          {card.stat && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-muted-foreground text-xs">{card.stat.label}</span>
              <span className={`text-sm font-bold amount ${ACCENT_CLASS[accent]}`}>{card.stat.value}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

interface MonthlyRecapProps {
  cards: MonthlyCard[];
  recapId: string;
  monthStart: string;
  monthEnd: string;
}

export function MonthlyRecap({ cards, recapId, monthStart, monthEnd }: MonthlyRecapProps) {
  const [shared, setShared] = useState(false);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    analytics.monthlyRecapViewed();
    fetch('/api/monthly/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recap_id: recapId }),
    });
  }, [recapId]);

  const formatMonthRange = () => {
    const s = new Date(monthStart);
    const e = new Date(monthEnd);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${s.toLocaleDateString('en-GB', opts)} — ${e.toLocaleDateString('en-GB', opts)}`;
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/monthly-share/${recapId}`;
    const shareText = `My month in money 🔥 — tracked with Sika`;

    const result = await shareMonthly({
      recapId,
      title: 'My Sika Month',
      text: shareText,
      url: shareUrl,
    });

    if (result.success) {
      analytics.monthlyRecapShared();
      if (result.method === 'clipboard') {
        toast.success('Link copied');
      }
      await fetch('/api/monthly/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recap_id: recapId }),
      }).catch(() => {});
      setShared(true);
    } else if (result.reason === 'error') {
      toast.error('Share failed');
    }
  };

  return (
    <div className="space-y-3">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-muted-foreground text-xs text-center pb-1"
      >
        {formatMonthRange()}
      </motion.p>

      {cards.map((card, i) => (
        <MonthlyCardItem key={card.id} card={card} index={i} />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: cards.length * 0.08 + 0.1 }}
        className="pt-2"
      >
        <button
          onClick={handleShare}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-card border border-border text-muted-foreground hover:border-[#D4A017]/40 hover:text-[#D4A017] transition-colors text-sm font-medium"
        >
          <Share2 className="w-4 h-4" />
          {shared ? 'Shared ✓' : 'Share my month'}
        </button>
      </motion.div>
    </div>
  );
}
```

### TypeScript shape
File: `src/types/monthly.ts` (lines 1–26)

```ts
export type MonthlyCardType =
  | 'headline' | 'win' | 'side_eye' | 'trend'
  | 'goal_check' | 'next_move' | 'reflection';

export type MonthlyAccent = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export type MonthlyCard = {
  id: string;
  type: MonthlyCardType;
  headline: string;
  body: string;
  accent_color?: MonthlyAccent;
  stat?: { label: string; value: string };
  icon?: string;
};

export type MonthlyRecap = {
  id: string;
  user_id: string;
  month_start: string;
  month_end: string;
  recap_data: MonthlyCard[];
  generated_at: string;
  viewed_at: string | null;
  shared_at: string | null;
};
```

> Note: `dismissed_at` is on the live table (added by migration 0025) but
> is missing from this TS type as of the audit. iOS should include it.

### Backing Table
Originally `weekly_recaps` — renamed to `monthly_recaps` in 0022.

File: `supabase/migrations/0021_weekly_recaps.sql`:

```sql
CREATE TABLE weekly_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  recap_data jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  shared_at timestamptz,
  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_weekly_recaps_user_week
  ON weekly_recaps(user_id, week_start DESC);

ALTER TABLE weekly_recaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own recaps"
  ON weekly_recaps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own recaps (view/share tracking)"
  ON weekly_recaps FOR UPDATE
  USING (auth.uid() = user_id);
```

File: `supabase/migrations/0022_rename_weekly_to_monthly.sql`:

```sql
ALTER TABLE weekly_recaps RENAME TO monthly_recaps;
ALTER TABLE monthly_recaps RENAME COLUMN week_start TO month_start;
ALTER TABLE monthly_recaps RENAME COLUMN week_end TO month_end;

DROP INDEX IF EXISTS idx_weekly_recaps_user_week;
CREATE INDEX idx_monthly_recaps_user_month
  ON monthly_recaps(user_id, month_start DESC);

DROP POLICY IF EXISTS "Users can read their own recaps" ON monthly_recaps;
DROP POLICY IF EXISTS "Users can update their own recaps (view/share tracking)" ON monthly_recaps;

CREATE POLICY "Users can read their own monthly recaps"
  ON monthly_recaps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own monthly recaps"
  ON monthly_recaps FOR UPDATE
  USING (auth.uid() = user_id);

ALTER TABLE monthly_recaps DROP CONSTRAINT IF EXISTS weekly_recaps_user_id_week_start_key;
ALTER TABLE monthly_recaps ADD CONSTRAINT monthly_recaps_user_id_month_start_key
  UNIQUE(user_id, month_start);
```

File: `supabase/migrations/0025_monthly_banner_dismiss.sql`:

```sql
ALTER TABLE monthly_recaps
ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
```

### Cron Job
File: `src/app/api/cron/monthly-generate/route.ts` (lines 1–81)

```ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeMonthContext } from '@/lib/monthly/compute-month-context';
import { generateRecapCards } from '@/lib/monthly/generate-recap';
import { getCycleMonthBounds, isCycleEndDate } from '@/lib/monthly/dates';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const supabase = createServiceClient();

  // Find all users whose cycle ends today
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, cycle_start_day');

  const eligibleProfiles = (profiles ?? []).filter(
    (p) => p.cycle_start_day && isCycleEndDate(today, p.cycle_start_day),
  );

  const results = {
    eligible: eligibleProfiles.length,
    generated: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  // isCycleEndDate detects today as the cycle's last day (e.g., Apr 27 when
  // cycle_start_day=28), but getCycleMonthBounds expects today to be the
  // first day of the new cycle (Apr 28). Pass tomorrow so they align.
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  for (const profile of eligibleProfiles) {
    try {
      const { start: monthStart, end: monthEnd } = getCycleMonthBounds(tomorrow, profile.cycle_start_day);

      const { data: existing } = await supabase
        .from('monthly_recaps')
        .select('id')
        .eq('user_id', profile.id)
        .eq('month_start', monthStart.toISOString().split('T')[0])
        .maybeSingle();

      if (existing) {
        results.skipped++;
        continue;
      }

      const ctx = await computeMonthContext(supabase, profile.id, monthStart, monthEnd);

      if (ctx.month.transaction_count === 0) {
        results.skipped++;
        continue;
      }

      const cards = await generateRecapCards(ctx);

      await supabase.from('monthly_recaps').insert({
        user_id: profile.id,
        month_start: monthStart.toISOString().split('T')[0],
        month_end: monthEnd.toISOString().split('T')[0],
        recap_data: cards,
      });

      results.generated++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${profile.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json(results);
}
```

Schedule: `5 6 * * *` (06:05 UTC daily — 5 min after Sika Daily). Only runs
for users whose **cycle ends today** (cycle is per-user via
`profile.cycle_start_day`). Users with zero transactions in the cycle are
skipped.

The generator (`src/lib/monthly/generate-recap.ts`) calls Claude Sonnet
4.6 to produce 5–7 `MonthlyCard` objects (validated for length).

### Fetch Endpoints
**Banner-discovery** (no dedicated hook — inline in dashboard at lines
126–144):

```ts
useEffect(() => {
  if (!user) return;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  supabase
    .from('monthly_recaps')
    .select('id, viewed_at, dismissed_at, generated_at')
    .eq('user_id', user.id)
    .is('viewed_at', null)
    .is('dismissed_at', null)
    .gte('generated_at', thirtyDaysAgo.toISOString())
    .order('month_start', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(({ data }) => {
      if (data) setMonthlyRecapId(data.id);
    });
}, [user]);
```

So banner shows when: `viewed_at IS NULL AND dismissed_at IS NULL AND generated_at >= now() - 30d`, taking the most recent.

**Latest-recap-full** — File: `src/app/api/monthly/latest/route.ts`:

```ts
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('monthly_recaps')
    .select('*')
    .eq('user_id', user.id)
    .order('month_start', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json(data);
}
```

**Detail-page fetch** (`/monthly` route): the route handler (server-rendered)
fetches the latest recap directly from the table and passes it to the
`MonthlyRecap` component.

**View tracking** — File: `src/app/api/monthly/view/route.ts`:

```ts
export async function POST(request: Request) {
  const { recap_id } = await request.json();
  // ... auth ...
  await supabase
    .from('monthly_recaps')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', recap_id)
    .eq('user_id', user.id);
  return NextResponse.json({ success: true });
}
```

**Share tracking** — File: `src/app/api/monthly/share/route.ts` (same shape, sets `shared_at`).

### Dismiss Pattern
File: `src/app/api/monthly/dismiss/route.ts` (lines 1–17)

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const { recap_id } = await request.json();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await supabase
    .from('monthly_recaps')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', recap_id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
```

**Dismiss is per-recap-row.** Setting `dismissed_at` on this cycle's row
hides this banner; next cycle's row will be a different `recap_id` and
will surface again. Banner additionally hides when `viewed_at` is set
(opening the recap implicitly suppresses the banner forever).

### Trigger-on-demand Endpoint
File: `src/app/api/monthly/trigger-for-me/route.ts` (lines 1–45) — same
shape as insights' trigger-for-me; useful for testing.

### Content Fields

**`monthly_recaps` row columns:**
- `id`, `user_id`, `month_start`, `month_end` (date)
- `recap_data: MonthlyCard[]` (JSONB)
- `generated_at`, `viewed_at?`, `shared_at?`, `dismissed_at?` (timestamptz)

**Each `MonthlyCard` (5–7 per recap):**
- `id: string`
- `type: 'headline' | 'win' | 'side_eye' | 'trend' | 'goal_check' | 'next_move' | 'reflection'`
- `headline: string`
- `body: string`
- `accent_color?: 'green' | 'amber' | 'red' | 'blue' | 'neutral'`
- `stat?: { label, value }`
- `icon?: string` (Lucide name)

**Banner (`SikaMonthlyBanner`) only displays:**
- Static title "Your month in money is ready"
- Static subtitle "5–7 takeaways from your last budget cycle →"
- Static emoji 🔥
- Hidden: the `recapId` is the only data prop, used to dispatch to the
  detail page or to set `dismissed_at`

### Visual Structure (banner)
- Card chrome: `rounded-xl`, `bg-card`, border `#FBBF24/20` (amber @ 20%),
  amber glow shadow `0 0 20px rgba(251,191,36,0.06)`
- Padding: `px-4 py-3`
- Layout: emoji 🔥 (text-xl) + 2-line text + chevron-right + X
- Dismiss control: **X button** on the right, separate from chevron-right
  navigation
- Animations: none on banner (detail page uses framer-motion stagger)

### Visual Structure (detail page card grid)
- Each card: `rounded-3xl border p-6` with accent-tinted bg/border
- Headline card (first): centered icon, bold 2xl headline, body, optional
  stat pill
- Other cards: left icon (rounded-xl 8x8), bold base headline, body,
  inline stat
- Stagger entrance: `motion.div` with `opacity 0→1`, `y 20→0`,
  `delay: index * 0.08`
- Share button at bottom

---

## 4. Render Slot on Home (`/dashboard`)

File: `src/app/(app)/dashboard/page.tsx` (lines 289–315)

```tsx
{/* Sika Daily banner — skeleton while loading, banner/nothing once resolved */}
{digestLoading ? (
  <div className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-card border border-[#D4A017]/10">
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-full bg-muted animate-pulse" />
      <div className="space-y-1.5">
        <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      </div>
    </div>
    <div className="w-4 h-4 rounded bg-muted animate-pulse" />
  </div>
) : todayDigest && !digestRead ? (
  <SikaDailyBanner digest={todayDigest} />
) : null}

{/* AI insight strip */}
{todayInsight && (
  <InsightStrip row={todayInsight} onDismiss={() => setTodayInsight(null)} />
)}

{/* Sika Monthly banner */}
{monthlyRecapId && (
  <div className="mt-4 md:mt-6">
    <SikaMonthlyBanner recapId={monthlyRecapId} />
  </div>
)}
```

The block sits **directly below the cycle navigation chevrons and above
the cycle card** (the virtual-card element). All three banners are direct
siblings inside `space-y-4`.

**Order (top → bottom):**
1. `SikaDailyBanner` (with skeleton placeholder while loading)
2. `InsightStrip`
3. `SikaMonthlyBanner` (with extra `mt-4 md:mt-6` margin)

**"Only one at a time" logic: NO.** All three can co-exist on the same
day (and frequently will, since insights generate at 00:30 UTC, daily at
06:00 UTC, and monthly at 06:05 UTC for cycle-end users). Each
independently checks its own visibility predicate:
- Daily: `todayDigest && !digestRead`
- Insight: `todayInsight && !todayInsight.dismissed_at`
- Monthly: `monthlyRecapId` (which is only set when the row matches the
  unviewed/undismissed/<30d filter)

There is no priority queueing — all visible banners stack vertically.

---

## 5. Shared Patterns

- **Shared base component?** **No.** Each banner has its own JSX. They
  share *visual conventions* (rounded-xl, bg-card, accent border at 20%
  opacity, faint colored glow shadow, px-4 py-3) but no extracted parent
  like `BannerCard`. Common shape: emoji/icon → 2-line text block →
  optional caret/X on the right.

- **Shared dismiss tracking with HintCard?** **No.** Each surface owns its
  own dismiss state:
  - `HintCard` (Phase 4): `dismissed_hints` table (per-user, per-`hintId`)
  - `SikaDailyBanner`: `user_daily_reads` (read marker, not a dismiss)
  - `InsightStrip`: `daily_insights.dismissed_at` (column on the row)
  - `SikaMonthlyBanner`: `monthly_recaps.dismissed_at` (column on the row)

- **Common visual chrome:**
  - `rounded-xl` (banners) vs `rounded-3xl` (monthly detail cards)
  - `bg-card` background
  - 20%-opacity colored borders (`#D4A017` gold for daily, accent-driven
    for insight, `#FBBF24` amber for monthly)
  - Faint colored glow shadow (`shadow-[0_0_20px_rgba(...,0.06)]`-ish)
  - `px-4 py-3` padding
  - 14sp/12sp text pair (sm semibold + xs muted)

---

## 6. Cron Job Coordination

File: `.github/workflows/crons.yml` (GitHub Actions, **not** Vercel Cron)

| Schedule (UTC) | Job | Endpoint |
| --- | --- | --- |
| `0 6 * * *` (06:00) | Sika Daily | `/api/cron/generate-digest` |
| `5 6 * * *` (06:05) | Sika Monthly | `/api/cron/monthly-generate` |
| `30 0 * * *` (00:30) | Dashboard Insights | `/api/cron/insights-generate` |
| `0 8 * * *` (08:00) | Income Reminders | `/api/cron/income-reminders` |

All four crons run daily; Sika Monthly is gated per-user by
`isCycleEndDate(today, profile.cycle_start_day)`.

**Order of generation in a UTC day:**
1. 00:30 — DailyInsight (per user)
2. 06:00 — DailyDigest (single shared row)
3. 06:05 — MonthlyRecap (per eligible user)
4. 08:00 — Income reminders (push only, not a banner)

**Dependencies between jobs: none.** Sika Monthly runs 5 minutes after
Sika Daily as a courtesy stagger (per the comment in the workflow), not a
real dependency. Each job calls Vercel via curl with the `CRON_SECRET`
bearer token; they don't share state at the job level.

**Error handling:**
- Each cron route validates `Authorization: Bearer $CRON_SECRET`; 401 on
  mismatch.
- Insights & Monthly: `for (const profile)` loop with per-user try/catch.
  Failures land in `results.errors[]`; the whole batch never aborts.
  `results.failed` is reported in the response body.
- Daily: try/catch around the RSS+filter+summarize pipeline. On any
  failure, falls back to yesterday's digest (or a placeholder). Always
  inserts a row.
- The GitHub Actions step asserts HTTP 200 from the curl and emits
  `::error::` on failure (which bubbles up as a workflow failure, but
  the user-facing data has already been written or fallen back at this
  point).
- No retry. If a cron run misses (e.g., GHA outage), the missing day's
  row simply doesn't exist — banners show nothing for that user/day.

**Important constraint for iOS:** because `daily_insights` and
`monthly_recaps` are inserted by a **service-role** Supabase client (RLS
bypass), iOS *must not* try to insert into these tables. iOS reads only.
The trigger-for-me endpoints (`/api/insights/trigger-for-me`,
`/api/monthly/trigger-for-me`) provide a server-mediated path if iOS ever
needs on-demand generation.

---

## iOS Implementation Notes (Phase 5)

### Models

```swift
// Mirror src/types/daily.ts
struct DailyStory: Codable, Identifiable {
  let id: String
  let category: DailyCategory  // .worldMarkets, .africaRising, .techTrends, .youngMoney
  let title: String
  let summary: String
  let sourceName: String
  let sourceURL: String
  let emoji: String
  let publishedAt: Date
  let imageURL: String?
}

struct DailyDigest: Codable, Identifiable {
  let id: String
  let digestDate: String   // YYYY-MM-DD
  let stories: [DailyStory]
  let isFallback: Bool
  let generatedAt: Date
}

struct UserDailyRead: Codable {
  let userID: String
  let digestDate: String
  let readAt: Date
}

// Mirror src/types/insight.ts
enum InsightKind: String, Codable {
  case budgetPacing = "budget_pacing"
  case categoryTrend = "category_trend"
  case goalNudge = "goal_nudge"
  case streakBoost = "streak_boost"
  case subscriptionAlert = "subscription_alert"
  case reflection
  case quickWin = "quick_win"
}

enum InsightAccent: String, Codable { case green, amber, red, blue, neutral }

struct InsightStat: Codable { let label: String; let value: String }

struct DailyInsight: Codable {
  let kind: InsightKind
  let headline: String
  let body: String
  let accent: InsightAccent
  let stat: InsightStat?
  let icon: String?
}

struct DailyInsightRow: Codable, Identifiable {
  let id: String
  let userID: String
  let insightDate: String
  let insightData: DailyInsight  // decoded from JSONB
  let generatedAt: Date
  let dismissedAt: Date?
}

// Mirror src/types/monthly.ts
enum MonthlyCardType: String, Codable {
  case headline, win, sideEye = "side_eye", trend
  case goalCheck = "goal_check", nextMove = "next_move", reflection
}

enum MonthlyAccent: String, Codable { case green, amber, red, blue, neutral }

struct MonthlyCard: Codable, Identifiable {
  let id: String
  let type: MonthlyCardType
  let headline: String
  let body: String
  let accentColor: MonthlyAccent?
  let stat: InsightStat?
  let icon: String?
}

struct MonthlyRecap: Codable, Identifiable {
  let id: String
  let userID: String
  let monthStart: String
  let monthEnd: String
  let recapData: [MonthlyCard]
  let generatedAt: Date
  let viewedAt: Date?
  let sharedAt: Date?
  let dismissedAt: Date?  // 0025 column missing from web's TS type — include on iOS
}
```

No shared `BannerCard` parent on web; iOS can either match (3 distinct
view types) or extract a `Phase5BannerCard` view if helpful — the visual
chrome is consistent enough to factor.

### Services

```swift
// SikaDailyService
//   fetchTodayDigest() -> sika_daily_digests where digest_date = today
//   markRead() -> insert into user_daily_reads (user_id, digest_date)
//   hasReadToday() -> select from user_daily_reads
//   No insert into sika_daily_digests — server cron owns it

// DailyInsightService
//   fetchToday() -> GET /api/insights/today returning { insight: DailyInsightRow? }
//   dismiss() -> POST /api/insights/dismiss (no body; auth-derived)
//   triggerForMe() -> POST /api/insights/trigger-for-me (dev only)
//   No insert into daily_insights — server cron owns it

// MonthlyRecapService
//   fetchLatestUnviewedUndismissed() -> select from monthly_recaps
//     .eq(user_id).is(viewed_at, null).is(dismissed_at, null)
//     .gte(generated_at, now-30d).order(month_start desc).limit(1)
//   fetchLatest() -> GET /api/monthly/latest
//   markViewed(recapId) -> POST /api/monthly/view {recap_id}
//   markShared(recapId) -> POST /api/monthly/share {recap_id}
//   dismiss(recapId) -> POST /api/monthly/dismiss {recap_id}
//   triggerForMe() -> POST /api/monthly/trigger-for-me (dev only)
//   No insert into monthly_recaps — server cron owns it
```

iOS can hit Supabase directly (RLS allows SELECT and UPDATE on
`daily_insights` / `monthly_recaps`), or hit the Next.js routes for the
mutations. **Direct table SELECT is fine** and faster — only mutations
need to go through the Next.js API if you want to centralize tracking.
The trigger-for-me endpoints are server-only because they call the
service-role client + Anthropic.

### AppState integration

```swift
@MainActor
final class HomeBannersState: ObservableObject {
  @Published var todayDigest: DailyDigest?
  @Published var digestRead: Bool = false
  @Published var todayInsight: DailyInsightRow?
  @Published var monthlyRecap: MonthlyRecap?    // banner-trigger row (id+timestamps only is enough)

  func loadAll(userID: String) async {
    async let digestT = sikaDailyService.fetchTodayDigest()
    async let readT = sikaDailyService.hasReadToday(userID: userID)
    async let insightT = dailyInsightService.fetchToday()
    async let recapT = monthlyRecapService.fetchLatestUnviewedUndismissed(userID: userID)

    todayDigest = try? await digestT
    digestRead = (try? await readT) ?? false
    let insight = try? await insightT
    todayInsight = (insight?.dismissedAt == nil) ? insight : nil
    monthlyRecap = try? await recapT
  }

  func dismissInsight() async { /* POST /api/insights/dismiss; clear local */ }
  func dismissMonthly() async { /* POST /api/monthly/dismiss; clear local */ }
  // No dismissDigest — daily uses read tracking, set automatically
}
```

Three parallel fetches map directly to the three independent useEffects
on web's dashboard.

### Components

- **`DailyDigestBanner`** — props: `digest: DailyDigest`, `onTap: () -> Void`.
  Tapping navigates to a `DailyDigestDetailView` that auto-marks read
  after 10s (mirror web's `AUTO_READ_DELAY_MS` constant).
- **`DailyInsightBanner`** — props: `row: DailyInsightRow`,
  `onDismiss: () -> Void`. Renders headline, body, optional stat,
  accent-tinted border + glow, X button.
- **`MonthlyRecapBanner`** — props: `recap: MonthlyRecap`,
  `onTap: () -> Void`, `onDismiss: () -> Void`. Static copy ("Your month
  in money is ready", "5–7 takeaways…"). Two right-aligned controls:
  chevron + X.
- **`MonthlyRecapDetailView`** — renders `recap.recapData: [MonthlyCard]`
  with stagger animation; first `headline`-type card is centered + larger.
  Calls `markViewed(recap.id)` once on first appear.
- **No shared parent required.** If iOS wants one, extract
  `BannerCardChrome` taking `accent: Color`, `glow: Bool`, content slot.

### Slot on AuthenticatedHomeView

Insert directly below cycle navigation, above the cycle card. Order
(top → bottom):

```swift
if let digest = state.todayDigest, !state.digestRead {
  DailyDigestBanner(digest: digest) { router.push(.dailyDetail) }
}
if let insight = state.todayInsight {
  DailyInsightBanner(row: insight) {
    Task { await state.dismissInsight() }
  }
}
if let recap = state.monthlyRecap {
  MonthlyRecapBanner(recap: recap,
                     onTap: { router.push(.monthlyDetail(recap.id)) },
                     onDismiss: { Task { await state.dismissMonthly() } })
    .padding(.top, 8)  // matches web's mt-4 md:mt-6
}
```

All three may render simultaneously; do NOT add "only one at a time"
logic — that's not what web does.

### Cron coordination on iOS

- iOS does **not** generate any of this content client-side.
- No cron logic in the iOS app.
- Server-side GitHub Actions cron jobs already write rows; iOS reads only.
- For testing, iOS can hit `/api/insights/trigger-for-me` and
  `/api/monthly/trigger-for-me` (POST, auth-required) to force generation
  for the current user.

### Schema considerations

**Tables needed for iOS to read** (all already exist on Supabase, shipped
by web migrations):

| Table | Source migration | Required for |
| --- | --- | --- |
| `sika_daily_digests` | `0018_sika_daily.sql` | DailyDigest banner |
| `user_daily_reads` | `0018_sika_daily.sql` | DailyDigest dismiss-equivalent |
| `daily_insights` | `0023_daily_insights.sql` | DailyInsight banner |
| `monthly_recaps` | `0021` + `0022` + `0025` | MonthlyRecap banner |
| `profiles` | initial schema | already used by iOS |

**No new migrations required for Phase 5** — web has already shipped
everything iOS needs. Confirm by running `select count(*)` on each table
against staging.

**RLS recap (matters for direct iOS Supabase access):**
- `sika_daily_digests`: no RLS — public read, service-role write only
- `user_daily_reads`: RLS policy "own daily reads" — full CRUD on own
- `daily_insights`: SELECT + UPDATE on own; INSERT is server-only
- `monthly_recaps`: SELECT + UPDATE on own; INSERT is server-only

### Naming alignment

If Phase 5 prompt names `DailyDigest`/`DailyInsight`/`MonthlyRecap`,
those names are accurate in iOS. The web banner files are named
`SikaDailyBanner` / `InsightStrip` / `SikaMonthlyBanner`. iOS does not
need to mirror the file names — match the conceptual names.
