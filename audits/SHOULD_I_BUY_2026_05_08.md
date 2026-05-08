# Should I Buy Audit — 2026-05-08

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Phase 8 implementation —
Should I Buy decision sheet + LLM-powered purchase analysis.

Source of truth: web repo at branch `feat/welcome-push-and-pwa-install-guide`.

---

## TL;DR for the iOS prompt author

- **Server-mediated, not direct LLM.** The Anthropic API is called from a Next.js route (`/api/decisions/ask`), not from the client. The API key (`ANTHROPIC_API_KEY`) lives in server env. The client never sees it. **iOS must call the existing Vercel-hosted endpoint** — do not embed the Anthropic SDK or the API key in the iOS app.
- **Math is computed server-side** (`computeDecisionContext`) before the LLM call. The LLM is given the pre-computed numbers as JSON context — it doesn't crunch the math itself, it interprets it. iOS doesn't need to port the math; it sends a 4-field request and receives a structured JSON decision back.
- **Model: `claude-sonnet-4-6`**, max 1024 tokens, no temperature override (uses Anthropic default), **no `tool_use` / structured-output mode** — the prompt instructs the model to return raw JSON, which the server then strips of code fences and `JSON.parse`s.
- **4 verdicts**: `go_ahead`, `not_now`, `only_if`, `think_about_it`. Plus an `accent` field (`green`/`amber`/`red`/`blue`) that the prompt maps to verdicts.
- **Decision rows are persisted** in `purchase_decisions` (one row per analysis, regardless of outcome). The outcome ("bought" / "skipped") is patched in via `/api/decisions/outcome` after the user picks a final CTA.
- **"I bought it" navigates to `/transactions`** — it does NOT auto-create a transaction or pre-fill the wizard. iOS Phase 8 should match unless explicitly upgraded.
- **⚠️ Schema drift to flag:** the migration `0024_purchase_decisions.sql` has `CHECK (bucket IN ('needs', 'wants', 'future'))` but the API now sends `'savings'`. There's no follow-up migration relaxing this. Either prod has a hand-applied fix or inserts with `bucket='savings'` are failing silently. iOS should send `'savings'` to match the API contract; if inserts fail, the upstream bug is web's, not iOS's.

---

## 1. Entry Point on Home

### Slot
File: `src/app/(app)/dashboard/page.tsx` (lines 373–384)

```tsx
{/* Should I buy it? */}
{loading ? (
  <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border">
    <div className="w-9 h-9 rounded-xl bg-muted animate-pulse shrink-0" />
    <div className="space-y-1.5 flex-1">
      <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
      <div className="h-3 w-36 rounded bg-muted animate-pulse" />
    </div>
  </div>
) : (
  <ShouldIBuyButton />
)}
```

Position in the dashboard render order (top → bottom):
1. Cycle navigation chevrons + label
2. Phase 5 banners (Daily / Insight / Monthly)
3. Cycle/virtual card + card-intro hint
4. Section divider
5. Spend summary cards (Today / This Month)
6. **Should-I-buy button** ← this slot
7. Sunday recap card
8. Health row
9. Income summary (desktop only)
10. Income nudges + pending recurring
... etc.

So iOS Phase 8 places the button between the "This Month / Today" spend cards and the SundayRecapCard / health row.

### Button component
File: `src/components/decision/should-i-buy-button.tsx` (whole file — lines 1–28)

```tsx
'use client';

import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { DecisionSheet } from './decision-sheet';

export function ShouldIBuyButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-muted hover:border-border transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-[#D4A017]/10 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-4 h-4 text-[#D4A017]" />
        </div>
        <div className="flex-1">
          <p className="text-foreground text-sm font-semibold">Should I buy it?</p>
          <p className="text-muted-foreground text-xs leading-relaxed">Got a purchase in mind? Sika tells you if it&apos;s the right time to buy it</p>
        </div>
      </button>
      {open && <DecisionSheet onClose={() => setOpen(false)} />}
    </>
  );
}
```

### Button chrome
- Full-width row card: `bg-card`, `border-border`, `rounded-2xl`, `px-4 py-3`
- Left: 36×36 px gold-tinted (`bg-[#D4A017]/10`) rounded square (`rounded-xl`) holding a `ShoppingBag` 16 px Lucide icon at `#D4A017`
- Right: title `"Should I buy it?"` (sm semibold) + subtitle `"Got a purchase in mind? Sika tells you if it's the right time to buy it"` (xs muted)
- Hover: `hover:bg-muted` background swap, `transition-colors`

The sheet is **only mounted while `open` is true** (`{open && <DecisionSheet ... />}`) — no SSR cost, no animation seam.

---

## 2. Entry Sheet

### Component
File: `src/components/decision/decision-sheet.tsx` (whole file — lines 1–335)

The sheet is a single component handling **four phases** via internal `Phase` state: `'input' | 'loading' | 'result' | 'error'`.

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useHaptics } from '@/hooks/use-haptics';
import { analytics } from '@/lib/analytics/identify';
import { useRouter } from 'next/navigation';
import { Loader2, X, TrendingUp, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrency } from '@/hooks/use-currency';
import type { DecisionData, PurchaseDecisionBucket, PurchaseUrgency } from '@/types/decision';

type Phase = 'input' | 'loading' | 'result' | 'error';

const BUCKET_CONFIG: Record<PurchaseDecisionBucket, { label: string; color: string; bg: string }> = {
  needs:   { label: 'Needs',   color: '#00D9A3', bg: '#00D9A318' },
  wants:   { label: 'Wants',   color: '#FBBF24', bg: '#FBBF2418' },
  savings: { label: 'Savings', color: '#60A5FA', bg: '#60A5FA18' },
};

const URGENCY_CONFIG: Record<PurchaseUrgency, { label: string }> = {
  now:      { label: 'Need it now' },
  can_wait: { label: 'Can wait' },
  not_sure: { label: 'Not sure' },
};

const ACCENT_CONFIG: Record<string, { border: string; bg: string; text: string; icon: React.ElementType }> = {
  green: { border: '#00D9A3', bg: '#00D9A318', text: '#00D9A3', icon: CheckCircle },
  amber: { border: '#FBBF24', bg: '#FBBF2418', text: '#FBBF24', icon: HelpCircle },
  red:   { border: '#F43F5E', bg: '#F43F5E18', text: '#F43F5E', icon: AlertTriangle },
  blue:  { border: '#60A5FA', bg: '#60A5FA18', text: '#60A5FA', icon: TrendingUp },
};
```

(Full source — already shown verbatim in the original file. The audit doc preserves its body in §3 / §4 / §7 below.)

### Sheet container
- Type: shadcn `<Sheet>` mounted with `side="bottom"`, presented over the rest of the dashboard
- `<SheetContent>` chrome: `bg-card border-t border-border rounded-t-3xl px-4 pb-8 pt-4 max-h-[92svh] overflow-y-auto`
- Top decoration: a small grab-handle bar `<div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />`
- Custom close `X` (top-right of the header row), 5 px Lucide icon
- Header `<h2>` reads "Here's the read" **only during the result phase** — input/loading/error phases hide the title

### Form fields (input phase)
4 fields stacked vertically with `space-y-5`:

1. **`itemName`** (Input, autoFocused after 100 ms)
   - Label: "What is it?"
   - Placeholder: "e.g. New headphones, Dinner at Kofe..."
   - `<Input>` height 48 px (`h-12`)
   - Submits on Enter when `canSubmit` is true

2. **`amount`** (Input, type="number", inputMode="decimal", min=0, step=0.01)
   - Label: `"How much? ({symbol})"` — `symbol` from the user's currency
   - Placeholder: "0.00"
   - Same Enter-to-submit behavior

3. **`bucket`** (3-button selector, default `'wants'`)
   - Label: "Which bucket?"
   - 3 buttons in a row (`flex gap-2`), each `flex-1`, `py-2.5 rounded-xl text-sm`
   - **Always exactly one selected** (no toggle-off; defaults to `wants`)
   - Active styling: `borderColor`, `backgroundColor`, `color` set inline from `BUCKET_CONFIG[b]`
   - Inactive: theme `border` / `input` / `muted-foreground`
   - Bucket configs (defined at the top of the file):
     | Bucket | Label | Color | Bg (12% alpha) |
     | --- | --- | --- | --- |
     | `needs` | "Needs" | `#00D9A3` | `#00D9A318` |
     | `wants` | "Wants" | `#FBBF24` | `#FBBF2418` |
     | `savings` | "Savings" | `#60A5FA` | `#60A5FA318` |

4. **`urgency`** (3-button selector, optional — initial state `''`)
   - Label: "Urgency?"
   - 3 buttons, `text-xs` (smaller than bucket buttons), `py-2.5`
   - **Toggle behavior:** clicking the active option deselects it (sets back to `''`). Clicking another swaps.
   - Active color: hard-coded green `#00D9A3` (not driven by per-urgency colors)
   - Urgency configs:
     | Urgency | Label |
     | --- | --- |
     | `now` | "Need it now" |
     | `can_wait` | "Can wait" |
     | `not_sure` | "Not sure" |

### CTA: "Let Sika decide"
```tsx
<Button
  onClick={handleAsk}
  disabled={!canSubmit}
  className="w-full h-13 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold text-base rounded-xl
             disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed"
>
  Let Sika decide
</Button>
```

`canSubmit` rule (line 60):

```ts
const canSubmit = itemName.trim().length > 0 && parseFloat(amount) > 0;
```

So **bucket is required-but-defaulted, urgency is optional, item name + positive amount are the gating fields.** No min length on item name beyond non-empty trim.

### Validation (server-side)
Mirrored in the API route's Zod schema — `src/app/api/decisions/ask/route.ts` (lines 8–13):

```ts
const askSchema = z.object({
  item_name: z.string().min(1).max(120),
  amount:    z.number().positive().max(10_000_000),
  bucket:    z.enum(['needs', 'wants', 'savings']),
  urgency:   z.enum(['now', 'can_wait', 'not_sure']).optional(),
});
```

So the server enforces `item_name ≤ 120 chars`, `amount > 0 && ≤ 10M`, and the same bucket/urgency enums. iOS should mirror these limits client-side.

### Cancel / close
`<X>` button in the header → `onClose()` (the prop from `ShouldIBuyButton`). The close button is visible in **all 4 phases**, including loading — but there is no explicit "cancel the in-flight request" logic. If the user closes during loading, the fetch keeps running in the background, but `setPhase`/`setDecision` calls become orphaned (the component has unmounted). React strict-mode warnings aside, this is fine.

### Auto-focus
`useEffect` after 100 ms timeout (line 54–58):

```ts
useEffect(() => {
  if (phase === 'input') {
    setTimeout(() => itemRef.current?.focus(), 100);
  }
}, [phase]);
```

The 100 ms delay lets the sheet animate in before stealing focus.

### Analytics on open
`analytics.decisionOpened()` fires on mount (line 40). Verdict reception fires `decisionVerdictReceived({ verdict })` after a successful response (line 82).

---

## 3. Loading State

```tsx
{/* LOADING PHASE */}
{phase === 'loading' && (
  <div className="flex flex-col items-center justify-center py-16 gap-4">
    <Loader2 className="w-8 h-8 text-[#D4A017] animate-spin" />
    <p className="text-muted-foreground text-sm">Sika is thinking...</p>
  </div>
)}
```

- Centered column, 64 px vertical padding, 16 px gap
- 32 px gold (`#D4A017`) `Loader2` icon spinning via Tailwind `animate-spin`
- Caption: muted sm text "Sika is thinking..."
- **The form is replaced, not overlaid.** The input fields are unmounted while loading; the sheet's height collapses to fit the spinner.
- **No cancel button while loading.** The header `X` is still there but, as noted, doesn't actually cancel the in-flight Anthropic call.
- **No timeout on the client.** It waits indefinitely for the fetch to resolve. Server-side latency on Anthropic is the practical limit.

---

## 4. LLM Call (CRITICAL SECTION)

### Endpoint

| Field | Value |
| --- | --- |
| Type | Next.js App-Router API route (`POST` handler) |
| Path | `POST /api/decisions/ask` |
| Auth | Cookie session via `createClient()` from `@/lib/supabase/server` — Supabase auth-helpers reads the user's auth cookie, returns `user` or 401 |
| Service-role usage | Yes — once the user is verified, the actual Supabase reads/writes use `createServiceClient()` (bypasses RLS). This is needed because `computeDecisionContext` reads several tables and inserts into `purchase_decisions`. |

Full route — File: `src/app/api/decisions/ask/route.ts` (whole file — lines 1–48):

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeDecisionContext } from '@/lib/decisions/compute-decision-context';
import { generateDecision } from '@/lib/decisions/generate-decision';
import { z } from 'zod';

const askSchema = z.object({
  item_name: z.string().min(1).max(120),
  amount: z.number().positive().max(10_000_000),
  bucket: z.enum(['needs', 'wants', 'savings']),
  urgency: z.enum(['now', 'can_wait', 'not_sure']).optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parseResult = askSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid input', details: parseResult.error }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const ctx = await computeDecisionContext(service, user.id, parseResult.data);
  const decision = await generateDecision(ctx);

  const { data: saved, error } = await service
    .from('purchase_decisions')
    .insert({
      user_id: user.id,
      item_name: parseResult.data.item_name,
      amount: parseResult.data.amount,
      bucket: parseResult.data.bucket,
      urgency: parseResult.data.urgency ?? null,
      decision_data: decision,
    })
    .select()
    .single();

  if (error || !saved) {
    return NextResponse.json({ error: 'Failed to save decision' }, { status: 500 });
  }

  return NextResponse.json({ id: saved.id, decision });
}
```

Sequence: validate → auth → compute context → call LLM → persist row → return `{id, decision}`.

### Request shape (from client)
File: `src/components/decision/decision-sheet.tsx` (lines 66–74):

```ts
const res = await fetch('/api/decisions/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    item_name: itemName.trim(),
    amount: parseFloat(amount),
    bucket,
    urgency: urgency || undefined,
  }),
});
```

Body schema:

```ts
{
  item_name: string;        // 1–120 chars
  amount: number;           // > 0, ≤ 10_000_000
  bucket: 'needs' | 'wants' | 'savings';
  urgency?: 'now' | 'can_wait' | 'not_sure';
}
```

### Anthropic SDK call
File: `src/lib/decisions/generate-decision.ts` (whole file — lines 1–35):

```ts
import Anthropic from '@anthropic-ai/sdk';
import { DECISION_VOICE_PROMPT } from '@/lib/ai/decision-voice-prompt';
import type { DecisionData } from '@/types/decision';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function generateDecision(ctx: unknown): Promise<DecisionData> {
  const userMessage = `Here's the context:\n\n${JSON.stringify(ctx, null, 2)}\n\nShould they buy it?`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: DECISION_VOICE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed?.verdict || !parsed?.verdict_line || !parsed?.reasoning) {
    throw new Error('Invalid decision: missing required fields');
  }
  if (parsed.verdict_line.split(' ').length > 12) {
    throw new Error(`Verdict line too long: "${parsed.verdict_line}"`);
  }

  return parsed as DecisionData;
}
```

#### Config summary
| Setting | Value |
| --- | --- |
| Model | `claude-sonnet-4-6` |
| Max tokens | `1024` |
| Temperature | (not set — uses Anthropic default) |
| System prompt | `DECISION_VOICE_PROMPT` (full text below) |
| User message | JSON-stringified `ctx` + literal trailer `"Should they buy it?"` |
| Tool use / structured output | **No.** The model is instructed via prompt to return raw JSON; the route strips ```json fences and `JSON.parse`s. |
| Streaming | No — `messages.create` (non-streaming) |
| Validation post-call | `verdict`, `verdict_line`, `reasoning` must exist; `verdict_line` must be ≤ 12 words. Otherwise throws. |

> No retry on parse failure. A bad JSON response surfaces to the user as the generic "Failed to get decision" 500 in the route, which becomes the error phase in the sheet.

### System prompt (full text, verbatim)

File: `src/lib/ai/decision-voice-prompt.ts` (whole file — lines 1–62):

````
You are Sika — a sharp, playful personal finance coach for Ghanaian users. A user is deciding whether to make a specific purchase right now. They're asking for your read.

## Voice rules

- Ghanaian speech patterns welcome. Pidgin is fine ("chale", "boss", "small small", "e dey").
- Specific. Reference actual numbers, category names, goal names, day counts.
- Playful roasts allowed when the purchase is clearly reckless. Never for necessities, health, or emergencies.
- Celebrate responsible decisions with real warmth.
- No moralizing. You're a friend giving a read, not a parent.
- No corporate speak.

## Analysis rules

Base your analysis on the user's current context provided. Consider:
- Is there room in the relevant bucket?
- Does it push any bucket into overspend?
- Does it delay any active goals?
- Is the urgency signal genuine or FOMO?
- What's the realistic opportunity cost?

Be honest. If they can afford it, say "go for it." If they can't, say "not this month, chale." Don't water it down.

## Verdict types

Pick ONE:
- "go_ahead" — they can absorb it, no harm done
- "not_now" — budget or goals would take a real hit
- "only_if" — conditional go (e.g., "only if you skip eating out this week")
- "think_about_it" — genuinely borderline, let user decide with full info

## Output schema

Return ONE JSON object:

{
  "verdict": "go_ahead" | "not_now" | "only_if" | "think_about_it",
  "verdict_line": "single sentence, max 12 words, direct and in Sika voice",
  "reasoning": "1-2 short paragraphs of analysis in Sika voice. Keep each paragraph 2-3 sentences max. Reference actual numbers.",
  "impact": {
    "bucket_after": {
      "bucket": "needs" | "wants" | "savings",
      "pct_after": <number>,
      "over_budget": <boolean>
    },
    "goal_impact": {
      "goal_name": "string",
      "pct_of_goal": <number>,
      "comment": "short one-liner"
    },
    "opportunity_cost": "short punchy comparison e.g. '9 Uber rides or 3 weeks of chop money'"
  },
  "accent": "green" | "amber" | "red" | "blue"
}

Accent mapping:
- green = go_ahead
- amber = only_if or think_about_it with caveats
- red = not_now or genuine concern
- blue = neutral or reflective

Return ONLY the JSON object. No preamble, no markdown fences.
````

### User message construction
The user message is a single string built in `generateDecision`:

```ts
const userMessage = `Here's the context:\n\n${JSON.stringify(ctx, null, 2)}\n\nShould they buy it?`;
```

Where `ctx: DecisionContext` is the precomputed object from
`computeDecisionContext`. Its full shape (from
`src/lib/decisions/compute-decision-context.ts:12–52`):

```ts
type DecisionContext = {
  user: { name: string };
  purchase: {
    item_name: string;
    amount: number;
    bucket: 'needs' | 'wants' | 'savings';
    urgency: 'now' | 'can_wait' | 'not_sure' | null;
  };
  current_cycle: {
    day_of_cycle: number;
    days_remaining: number;
    cycle_length: number;        // hard-coded to 30
  };
  buckets: {
    needs:   { spent: number; budget: number;     pct: number; pct_time: number; remaining: number };
    wants:   { spent: number; budget: number;     pct: number; pct_time: number; remaining: number };
    savings: { spent: number; commitment: number; pct: number;                   remaining: number };
  };
  after_purchase: {
    target_bucket_spent: number;
    target_bucket_pct: number;
    over_budget: boolean;
    over_by: number;
  };
  active_goals: Array<{
    name: string;
    target: number;
    saved: number;
    pct: number;
    days_to_deadline: number | null;
    pct_of_this_purchase: number;
  }>;
  recent_activity: {
    last_7d_spend: number;
    typical_daily_spend: number;
  };
  upcoming_recurring_7d: {
    count: number;
    total: number;
  };
};
```

> The LLM sees the **full pre-computed financial picture** — bucket
> spend, time-pct of cycle, after-purchase math, top 3 goals,
> 7d/30d spending, upcoming recurring totals. It does NOT recompute
> any of these. iOS does not need to port this math; the API does it.

### Response shape (sent back to the client)

The API returns `{ id: string; decision: DecisionData }`, where
`DecisionData` is (from `src/types/decision.ts:1–13`):

```ts
export type Verdict = 'go_ahead' | 'not_now' | 'only_if' | 'think_about_it';

export type DecisionData = {
  verdict: Verdict;
  verdict_line: string;
  reasoning: string;
  impact: {
    bucket_after: {
      bucket: 'needs' | 'wants' | 'savings';
      pct_after: number;
      over_budget: boolean;
    };
    goal_impact?: {
      goal_name: string;
      pct_of_goal: number;
      comment: string;
    };
    opportunity_cost?: string;
  };
  accent: 'green' | 'amber' | 'red' | 'blue';
};
```

> Note: `goal_impact` and `opportunity_cost` are *optional*. The
> server's post-validation only enforces `verdict`, `verdict_line`,
> `reasoning`. The model may omit either or both based on context
> (e.g., user has no active goals → no `goal_impact`).

---

## 5. Math Projection Logic

### Where computed
**Server-side**, inside `computeDecisionContext` (file:
`src/lib/decisions/compute-decision-context.ts`, 254 lines). The
client never computes any of this; it only renders what the API
returns inside `decision.impact` (which the LLM produces from the
pre-computed JSON context).

This means iOS **does not** need to port `computeDecisionContext` —
it sends `{item_name, amount, bucket, urgency}` and gets a fully-
formed `DecisionData` back.

### Formulas (verbatim, from `compute-decision-context.ts`)

#### Cycle position (lines 130–140)
```ts
const todayDay = now.getUTCDate();
let dayOfCycle: number;
if (todayDay >= cycleStartDay) {
  dayOfCycle = todayDay - cycleStartDay + 1;
} else {
  const daysInPrevMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0).getUTCDate();
  dayOfCycle = daysInPrevMonth - cycleStartDay + todayDay + 1;
}
const cycleLength = 30;                              // ⚠️ hard-coded approximation
const daysRemaining = Math.max(0, cycleLength - dayOfCycle);
const pctTime = Math.round((dayOfCycle / cycleLength) * 100);
```

#### Bucket budgets (lines 161–163)
```ts
const needsBudget = monthlyIncome * needsPct;
const wantsBudget = monthlyIncome * wantsPct;
const savingsCommitment = monthlyIncome * futurePct;   // var name preserved from rename
```

#### After-purchase math (lines 180–191)
```ts
const targetBudget = purchase.bucket === 'needs'
  ? needsBudget
  : purchase.bucket === 'wants'
  ? wantsBudget
  : savingsCommitment;

const currentSpent = bucketSpend[purchase.bucket] ?? 0;
const targetBucketSpent = currentSpent + purchase.amount;
const targetBucketPct = targetBudget > 0
  ? Math.round((targetBucketSpent / targetBudget) * 100)
  : 0;
const overBudget = targetBucketSpent > targetBudget;
const overBy = Math.max(0, targetBucketSpent - targetBudget);
```

#### Recent activity (lines 165–168)
```ts
const last7dSpend = recentTxns.reduce((s, t) => s + t.amount, 0);
const last30dSpend = thirtyDTxns.reduce((s, t) => s + t.amount, 0);
const typicalDailySpend = Math.round(last30dSpend / 30);
```

#### Upcoming recurring next 7d (lines 171–178)
```ts
let recCount = 0, recTotal = 0;
for (const r of recurring as RecurringTransaction[]) {
  const next = getNextDueDate(r, now);
  if (next && next <= sevenDaysFromNow) {
    recCount++;
    recTotal += r.amount;
  }
}
```

#### Per-goal pct of purchase (lines 240–246)
```ts
pct_of_this_purchase: g.target_amount > 0
  ? Math.round((purchase.amount / g.target_amount) * 100)
  : 0,
```

### "Alternative framings" (e.g. "9 Uber rides or 3 weeks of chop money")

These are **LLM-generated**, not formula-driven. The system prompt's
output schema includes:

```
"opportunity_cost": "short punchy comparison e.g. '9 Uber rides or 3 weeks of chop money'"
```

The model invents these from context (typical daily spend, recent
categories, etc.). There is no deterministic algorithm. iOS
displays whatever string the API returns in
`decision.impact.opportunity_cost`.

This is a **conscious creative-output choice**: opportunity cost
framing is voice-driven, not arithmetic.

---

## 6. Verdict System

### Enum
File: `src/types/decision.ts:1`

```ts
export type Verdict = 'go_ahead' | 'not_now' | 'only_if' | 'think_about_it';
```

4 values. Generated by the LLM per the system prompt rules.

### Severity-to-color (accent) mapping

The model itself decides the `accent` per the system prompt's
explicit table:

```
Accent mapping:
- green = go_ahead
- amber = only_if or think_about_it with caveats
- red = not_now or genuine concern
- blue = neutral or reflective
```

Note that **the verdict-to-accent mapping isn't strictly enforced
client-side** — the LLM picks `accent` independently. So you might
get `verdict: 'think_about_it', accent: 'blue'` if the model judges
the situation as more reflective than caveat-laden. iOS should
trust the `accent` field as authoritative for color, **not** derive
it from verdict.

The client uses `ACCENT_CONFIG` (decision-sheet.tsx:28–33):

```ts
const ACCENT_CONFIG: Record<string, { border: string; bg: string; text: string; icon: React.ElementType }> = {
  green: { border: '#00D9A3', bg: '#00D9A318', text: '#00D9A3', icon: CheckCircle },
  amber: { border: '#FBBF24', bg: '#FBBF2418', text: '#FBBF24', icon: HelpCircle },
  red:   { border: '#F43F5E', bg: '#F43F5E18', text: '#F43F5E', icon: AlertTriangle },
  blue:  { border: '#60A5FA', bg: '#60A5FA18', text: '#60A5FA', icon: TrendingUp },
};
```

| Accent | Border | Bg (hex + 0x18 alpha ≈ 9%) | Text | Lucide Icon |
| --- | --- | --- | --- | --- |
| `green` | `#00D9A3` | `#00D9A318` | `#00D9A3` | `CheckCircle` |
| `amber` | `#FBBF24` | `#FBBF2418` | `#FBBF24` | `HelpCircle` |
| `red`   | `#F43F5E` | `#F43F5E18` | `#F43F5E` | `AlertTriangle` |
| `blue`  | `#60A5FA` | `#60A5FA18` | `#60A5FA` | `TrendingUp` |

### Verdict label copy

The "Chale, this one go bury you alive"-style line is the
**`verdict_line`** field — a single sentence the LLM generates per
context (max 12 words, validated server-side). It's NOT a canned
per-verdict string.

The verdict pill also shows the **enum value** stylized
(uppercased, underscore replaced with space):

```tsx
<p
  className="text-xs font-semibold mt-1 uppercase tracking-wider"
  style={{ color: accent.text }}
>
  {decision.verdict.replace('_', ' ')}
</p>
```

So `not_now` renders as `"NOT NOW"`, `go_ahead` as `"GO AHEAD"`, etc.

### Page header

`"Here's the read"` (h2 base bold, foreground color) — only shown in
the result phase header row. Hard-coded; not LLM-generated.

---

## 7. Result UI

Source — File: `src/components/decision/decision-sheet.tsx` (lines 233–317):

```tsx
{phase === 'result' && decision && (
  <div className="space-y-4">
    {/* Verdict banner */}
    <div
      className="rounded-2xl px-4 py-4 border"
      style={{ backgroundColor: accent.bg, borderColor: accent.border + '40' }}
    >
      <div className="flex items-start gap-3">
        <AccentIcon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent.text }} />
        <div>
          <p className="text-foreground font-bold text-base leading-snug">{decision.verdict_line}</p>
          <p
            className="text-xs font-semibold mt-1 uppercase tracking-wider"
            style={{ color: accent.text }}
          >
            {decision.verdict.replace('_', ' ')}
          </p>
        </div>
      </div>
    </div>

    {/* The math */}
    <div className="bg-muted rounded-2xl px-4 py-4 space-y-3">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">The math</p>

      <div className="flex justify-between items-center">
        <span className="text-muted-foreground text-sm capitalize">{decision.impact.bucket_after.bucket} after</span>
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: decision.impact.bucket_after.over_budget ? '#F43F5E' : 'var(--foreground)' }}
        >
          {decision.impact.bucket_after.pct_after}%
          {decision.impact.bucket_after.over_budget && (
            <span className="text-[#F43F5E] ml-1 text-xs">over budget</span>
          )}
        </span>
      </div>

      {decision.impact.goal_impact && (
        <div className="border-t border-border pt-3">
          <div className="flex justify-between items-start gap-2">
            <span className="text-muted-foreground text-sm">{decision.impact.goal_impact.goal_name}</span>
            <span className="text-foreground text-sm font-semibold tabular-nums shrink-0">
              {decision.impact.goal_impact.pct_of_goal}% of goal
            </span>
          </div>
          <p className="text-muted-foreground text-xs mt-1">{decision.impact.goal_impact.comment}</p>
        </div>
      )}

      {decision.impact.opportunity_cost && (
        <div className="border-t border-border pt-3">
          <p className="text-muted-foreground text-xs">
            <span className="text-muted-foreground">Alternatively: </span>
            {decision.impact.opportunity_cost}
          </p>
        </div>
      )}
    </div>

    {/* Reasoning */}
    <div className="bg-card border border-border rounded-2xl px-4 py-4">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Sika says</p>
      <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">{decision.reasoning}</p>
    </div>

    {/* Action buttons */}
    <div className="flex gap-2 pt-1">
      <Button variant="outline" onClick={() => handleOutcome('skipped')} className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted rounded-xl">
        Nah, skip
      </Button>
      <Button onClick={() => handleOutcome('bought')} className="flex-1 h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl">
        I bought it
      </Button>
    </div>
  </div>
)}
```

### Verdict banner (pill)
- Outer: `rounded-2xl border px-4 py-4`
- `backgroundColor: accent.bg` (hex with `18` alpha)
- `borderColor: accent.border + '40'` (i.e. accent at ≈25% alpha — concatenated as 8-digit hex)
- Inner row: 20 px Lucide icon (CheckCircle/HelpCircle/AlertTriangle/TrendingUp depending on accent) | text block
- Text block:
  - `verdict_line` — base, bold, foreground color (NOT accent), tight leading
  - Verdict enum (uppercased) — xs, semibold, accent color, letter-spaced

### "The math" card
- Outer: `bg-muted rounded-2xl px-4 py-4`
- Header: xs muted uppercase "The math"
- 3 content blocks separated by `border-t border-border`:
  1. **Bucket after** — `"<Bucket> after"` (capitalized) | `<pct>%` (with `"over budget"` rose suffix if `over_budget`). Color: rose if over, else foreground.
  2. **Goal impact** (conditional on `decision.impact.goal_impact !== undefined`):
     - Top row: goal name (sm muted) | `"<pct>% of goal"` (sm semibold foreground)
     - Below: comment (xs muted)
  3. **Opportunity cost** (conditional on `decision.impact.opportunity_cost`):
     - `"Alternatively: <opportunity_cost string>"` (xs muted, single line)

### "Sika says" card
- `bg-card border border-border rounded-2xl px-4 py-4`
- Header: xs muted uppercase "Sika says"
- Body: `text-muted-foreground text-sm leading-relaxed whitespace-pre-line`
- `whitespace-pre-line` preserves newlines from the LLM (the prompt allows 1–2 paragraphs)
- No max length enforced client-side beyond the 1024-token total response limit

### Final CTAs

```tsx
<Button variant="outline" onClick={() => handleOutcome('skipped')} className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted rounded-xl">
  Nah, skip
</Button>
<Button onClick={() => handleOutcome('bought')} className="flex-1 h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl">
  I bought it
</Button>
```

| Button | Style | Action |
| --- | --- | --- |
| **"Nah, skip"** (left, secondary) | outline border, muted text | `handleOutcome('skipped')` |
| **"I bought it"** (right, primary) | solid gold `#D4A017` bg, dark text | `handleOutcome('bought')` |

`handleOutcome` (lines 89–105):

```ts
async function handleOutcome(outcome: 'bought' | 'skipped') {
  if (decisionId) {
    try {
      await fetch('/api/decisions/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision_id: decisionId, outcome }),
      });
    } catch {
      // silent fail — outcome is best-effort
    }
  }
  if (outcome === 'bought') {
    router.push('/transactions');
  }
  onClose();
}
```

So:
- **Both paths** PATCH the `purchase_decisions` row's `outcome` column (best-effort, swallowed errors).
- **"I bought it"** additionally pushes `/transactions` (the user can manually log the purchase there).
- **"Nah, skip"** just closes the sheet.
- Neither auto-creates a transaction. Neither pre-fills the Add Transaction wizard.

---

## 8. Decision Tracking Schema

### Table
File: `supabase/migrations/0024_purchase_decisions.sql` (whole file — lines 1–29):

```sql
CREATE TABLE purchase_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('needs', 'wants', 'future')),
  urgency text CHECK (urgency IN ('now', 'can_wait', 'not_sure')),
  decision_data jsonb NOT NULL,
  outcome text CHECK (outcome IN ('bought', 'skipped', 'undecided')) DEFAULT 'undecided',
  outcome_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_decisions_user_created
  ON purchase_decisions(user_id, created_at DESC);

ALTER TABLE purchase_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own decisions"
  ON purchase_decisions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own decisions"
  ON purchase_decisions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decisions"
  ON purchase_decisions FOR UPDATE
  USING (auth.uid() = user_id);
```

### ⚠️ Schema drift

The CHECK constraint on `bucket` allows `('needs', 'wants', 'future')` — the legacy third bucket name. Migration `0029_savings_bucket_rename.sql` renamed `profiles.future_percent → savings_percent` and updated the `handle_new_user` trigger, **but did not update `purchase_decisions.bucket`**.

Meanwhile:
- The TypeScript type `PurchaseDecisionBucket = 'needs' | 'wants' | 'savings'` (decision.ts:15)
- The Zod `askSchema` uses `z.enum(['needs', 'wants', 'savings'])` (ask/route.ts:11)
- The API insert sends `bucket: 'savings'` (ask/route.ts:36)

So inserts with `bucket='savings'` should fail at the DB CHECK. Either prod has a hand-applied fix, or this code path is broken. iOS doesn't need to do anything special — sending `'savings'` matches the documented API contract; if the constraint hasn't been fixed yet, that's a web-side bug.

### Insert pattern
- **One row per analysis** — the API route inserts before returning (ask/route.ts:30–41). Even if the user never picks an outcome, the row exists with `outcome='undecided'`.
- Stored: `user_id`, `item_name`, `amount`, `bucket`, `urgency`, full `decision_data` (the entire `DecisionData` JSON), `outcome` (default 'undecided'), `outcome_transaction_id` (nullable).
- The outcome PATCH route — File: `src/app/api/decisions/outcome/route.ts` (lines 1–29):

```ts
const outcomeSchema = z.object({
  decision_id: z.string().uuid(),
  outcome: z.enum(['bought', 'skipped']),
  transaction_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = outcomeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const update: Record<string, unknown> = { outcome: parsed.data.outcome };
  if (parsed.data.transaction_id) update.outcome_transaction_id = parsed.data.transaction_id;

  await supabase
    .from('purchase_decisions')
    .update(update)
    .eq('id', parsed.data.decision_id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
```

Note: the route accepts an optional `transaction_id` to link the row to the actually-logged transaction (`outcome_transaction_id`). The current client doesn't send it (the client doesn't know which transaction the user logs after navigating to `/transactions`). Future enhancement candidate; iOS Phase 8 can leave it unset.

### RLS
3 policies, all `auth.uid() = user_id`:
- SELECT — read own decisions
- INSERT — insert own (server uses service role anyway; this protects future direct-client writes)
- UPDATE — update own (used by the outcome route)

No DELETE policy — decisions persist permanently (until the user is deleted, in which case CASCADE kicks in).

---

## 9. Anthropic API Integration

### Approach: server-mediated

```
iOS app  →  POST https://sika-dlrl.vercel.app/api/decisions/ask
               ↓ (validates auth, computes ctx)
              Anthropic SDK call (server-side, with ANTHROPIC_API_KEY)
               ↓
              persist purchase_decisions row
               ↓
            { id, decision } back to client
```

The Anthropic SDK is **only ever instantiated server-side**:
`src/lib/decisions/generate-decision.ts:5–7`. The API key reads
from `process.env.ANTHROPIC_API_KEY`.

### Auth path
- Client → API route via cookie session (Supabase auth-helpers).
- API route validates user, then uses **service-role** Supabase client for downstream reads (`computeDecisionContext`) + the insert (`purchase_decisions`).
- Anthropic call is invoked once auth is verified.

### iOS implication: don't ship the API key

The Anthropic API key must not be embedded in any iOS binary. Options:
- **iOS calls the existing `/api/decisions/ask` endpoint** (recommended — see iOS notes §architecture)
- iOS calls a new Supabase Edge Function that holds the key (alternative)
- ❌ iOS holds the key directly (unsafe — keys would leak via reverse-engineered binaries)

### Rate limiting
**None at the application layer.** No per-user request count, no timestamp-window check, no token bucket. The only limits are:
- Anthropic's account-level rate limit (server-side concern)
- Vercel function timeout (default 60 s for App-Router API routes)
- The route's `maxDuration` is NOT explicitly set in this file (unlike the cron routes which set 300). Will use platform defaults.

### Cost considerations
Each call:
- ~3 KB of JSON-stringified `ctx` as user message
- Up to 1024 output tokens
- Uses `claude-sonnet-4-6`

No batching, no caching (each "Should I buy?" tap is a fresh call even for the same item). No client-side dedup. iOS should expect a billable Anthropic call per tap.

---

## 10. Usage Limits

**None.** No per-user daily decision cap. No free-vs-paid tier branching. No cost-tracking column on the `purchase_decisions` table (no `tokens_used`, no `cost_usd`).

If usage limits become necessary, the natural place is the
`/api/decisions/ask` route (count rows in `purchase_decisions` for
this `user_id` since `now() - 24h` and 429 if over a threshold). Not
implemented yet.

---

## 11. Post-Decision Follow-ups

### "I bought it" path (lines 101–104)

```ts
if (outcome === 'bought') {
  router.push('/transactions');
}
onClose();
```

- PATCH `/api/decisions/outcome` with `outcome='bought'` (best-effort)
- Navigate to `/transactions` (the user manually logs the purchase there)
- Close the sheet

**Does NOT** open the Add Transaction wizard. Does NOT pre-fill the wizard with the item name / amount / bucket. The link is purely contextual ("you said you bought it, here's the transactions page").

The `outcome_transaction_id` column exists for *eventually* linking the logged transaction to the decision, but the client doesn't currently populate it. iOS Phase 8 can match (no pre-fill) or upgrade (pre-fill the wizard via deep-link query params if Phase 7's wizard supports them).

### "Nah, skip" path (line 89–104, no router push)

- PATCH `/api/decisions/outcome` with `outcome='skipped'` (best-effort)
- Close the sheet
- **No toast.** No celebratory or commiserating UI.
- No analytics event beyond the implicit one bundled into the outcome PATCH (which itself doesn't fire a PostHog event).

### Analytics events fired during the flow
| Trigger | Event |
| --- | --- |
| Sheet open | `decision_opened` |
| Verdict received | `decision_verdict_received` (with `verdict` property) |

(See `src/lib/analytics/identify.ts:31–32`.)

No outcome-specific analytics event. iOS can match.

---

## iOS Implementation Notes (Phase 8)

### Architecture decision: **Option B — call web's existing endpoint** (recommended)

| Option | Pros | Cons |
| --- | --- | --- |
| **A. Direct Anthropic SDK on iOS** | No server hop; lowest latency. | API key must be embedded in iOS app or fetched per-session — both leak. Server-side context computation (`computeDecisionContext`) would have to be re-implemented in Swift, doubling maintenance. The math model has 254 lines of database joins and date logic that would drift from web fast. **❌ Not recommended.** |
| **B. HTTP call to web's `/api/decisions/ask`** | Reuses 100% of existing logic — auth, context computation, prompt, model choice, persistence. Zero math duplication. iOS just sends `{item_name, amount, bucket, urgency}` and renders `DecisionData`. Anthropic key stays server-only. | One network hop (Vercel → Anthropic → Vercel → iOS). User's auth must be passed via Supabase cookie OR Bearer token (see auth note below). Vercel function cold-start latency. |
| **C. New Supabase Edge Function** | API key isolated in Supabase secrets. Edge functions are global. Could be slightly faster than Vercel for some users. | Requires duplicating `computeDecisionContext` + `generateDecision` + the persistence write into an edge function. New deployment surface to maintain. **Only worth it if web's API route is being deprecated** — no signal that's the case. |

**Recommendation: Option B.** The existing route is well-shaped for iOS reuse — strict Zod validation, JSON request/response, RLS-respecting persistence, no client-specific assumptions.

#### Auth note for option B
The route uses `createClient()` from `@/lib/supabase/server` which reads the user's session from the **`sb-...-auth-token` cookie**. iOS supabase-swift sessions don't share Vercel cookies by default. Options:
- **Forward the access_token as `Authorization: Bearer <token>`**, then have the API route use `supabase.auth.getUser(token)` instead of cookie-based extraction. This requires a small server change. ← Recommended.
- Or: have iOS POST the JWT in the request body and verify server-side. More change.
- Or: ship a separate `/api/decisions/ask-mobile` endpoint that accepts Bearer auth — preserves existing behavior for web.

> **iOS Phase 8 prompt should call out the auth-mode change as a small required web edit** so the engineer doesn't get blindsided by 401s.

### Models

```swift
enum Verdict: String, Codable {
  case goAhead       = "go_ahead"
  case notNow        = "not_now"
  case onlyIf        = "only_if"
  case thinkAboutIt  = "think_about_it"

  var displayLabel: String {
    rawValue.replacingOccurrences(of: "_", with: " ").uppercased()
  }
}

enum DecisionAccent: String, Codable {
  case green, amber, red, blue
}

enum PurchaseDecisionBucket: String, Codable {
  case needs, wants, savings
}

enum PurchaseUrgency: String, Codable {
  case now
  case canWait = "can_wait"
  case notSure = "not_sure"
}

struct PurchaseAnalysisRequest: Codable {
  let itemName: String
  let amount: Double
  let bucket: PurchaseDecisionBucket
  let urgency: PurchaseUrgency?

  enum CodingKeys: String, CodingKey {
    case itemName = "item_name"
    case amount, bucket, urgency
  }
}

struct DecisionData: Codable {
  let verdict: Verdict
  let verdictLine: String
  let reasoning: String
  let impact: Impact
  let accent: DecisionAccent

  struct Impact: Codable {
    let bucketAfter: BucketAfter
    let goalImpact: GoalImpact?
    let opportunityCost: String?

    enum CodingKeys: String, CodingKey {
      case bucketAfter      = "bucket_after"
      case goalImpact       = "goal_impact"
      case opportunityCost  = "opportunity_cost"
    }
  }
  struct BucketAfter: Codable {
    let bucket: PurchaseDecisionBucket
    let pctAfter: Int
    let overBudget: Bool

    enum CodingKeys: String, CodingKey {
      case bucket
      case pctAfter   = "pct_after"
      case overBudget = "over_budget"
    }
  }
  struct GoalImpact: Codable {
    let goalName: String
    let pctOfGoal: Int
    let comment: String

    enum CodingKeys: String, CodingKey {
      case goalName  = "goal_name"
      case pctOfGoal = "pct_of_goal"
      case comment
    }
  }

  enum CodingKeys: String, CodingKey {
    case verdict
    case verdictLine = "verdict_line"
    case reasoning, impact, accent
  }
}

struct AskDecisionResponse: Codable {
  let id: UUID
  let decision: DecisionData
}
```

> No need for a `PurchaseAnalysisMath` model — the math is server-side. iOS only consumes `DecisionData.impact`.

### Service

```swift
@MainActor
final class DecisionService {
  let httpClient: HTTPClient
  let baseURL: URL  // e.g. https://sika-dlrl.vercel.app

  /// Mirrors decision-sheet.tsx:62–87
  func ask(_ request: PurchaseAnalysisRequest) async throws -> AskDecisionResponse {
    var req = URLRequest(url: baseURL.appendingPathComponent("/api/decisions/ask"))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(supabase.auth.session?.accessToken ?? "")",
                 forHTTPHeaderField: "Authorization")
    req.httpBody = try JSONEncoder().encode(request)

    let (data, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw DecisionError.serverError
    }
    return try JSONDecoder().decode(AskDecisionResponse.self, from: data)
  }

  /// Mirrors decision-sheet.tsx:89–105
  func recordOutcome(decisionID: UUID, outcome: Outcome) async {
    var req = URLRequest(url: baseURL.appendingPathComponent("/api/decisions/outcome"))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(supabase.auth.session?.accessToken ?? "")",
                 forHTTPHeaderField: "Authorization")
    req.httpBody = try? JSONEncoder().encode(["decision_id": decisionID.uuidString,
                                              "outcome": outcome.rawValue])
    _ = try? await URLSession.shared.data(for: req)
    // best-effort — silent fail matches web
  }
}

extension DecisionService {
  enum Outcome: String, Codable { case bought, skipped }
  enum DecisionError: Error { case serverError }
}
```

> No client-side LLM logic. No `computeDecisionContext` Swift port. The iOS service is a thin HTTP wrapper.

### Components

```swift
ShouldIBuyButton              // Home slot — gold ShoppingBag tile
DecisionSheet                  // wrapper holding the 4-phase state machine
  ├── DecisionInputView        // form (item / amount / bucket / urgency / CTA)
  ├── DecisionLoadingView      // gold spinner + "Sika is thinking..."
  ├── DecisionResultView       // verdict pill + math card + Sika says + CTAs
  └── DecisionErrorView        // "Try again" button
```

State machine (single `enum Phase: case input, loading, result, error`):

```swift
@MainActor
final class DecisionSheetViewModel: ObservableObject {
  @Published var phase: Phase = .input
  @Published var itemName = ""
  @Published var amount = ""
  @Published var bucket: PurchaseDecisionBucket = .wants
  @Published var urgency: PurchaseUrgency?
  @Published var decisionID: UUID?
  @Published var decision: DecisionData?
  @Published var errorMessage = ""

  var canSubmit: Bool {
    !itemName.trimmingCharacters(in: .whitespaces).isEmpty
      && (Double(amount) ?? 0) > 0
  }

  func ask() async { /* ... */ }
  func resolve(outcome: DecisionService.Outcome, router: Router) async { /* ... */ }
}
```

### State / presentation

- Sheet style: SwiftUI `.sheet(isPresented:)` with `.presentationDetents([.medium, .large])` — match web's `max-h-[92svh]` ≈ large detent.
- `.presentationDragIndicator(.hidden)` — web has its own grab-handle bar; replicate with a Capsule().
- Result phase replaces (does not push) the entry sheet content. Same sheet, different render branch.
- Auto-focus the item-name field 100 ms after the sheet appears (mirror web's setTimeout).

### Required iOS data dependencies

**None new.** All math is server-side. The user just needs to be authenticated (Supabase session) and have:
- A `profiles` row (set during signup) — server reads `monthly_income`, `cycle_start_day`, bucket %s
- Optionally `goals`, `transactions`, `recurring_transactions` — server reads them but tolerates empty results

iOS Phase 8 doesn't need to plumb cycle math, bucket state, goal progress, or anything else into the decision flow.

### LLM call on iOS
Per option B: **iOS does not call Anthropic.** All LLM logic stays on web's backend.

### Schema considerations
**No new migrations.** `purchase_decisions` already exists. RLS is correct. iOS only needs to:
1. Write through `/api/decisions/ask` (server inserts via service-role)
2. Update through `/api/decisions/outcome` (server updates via cookie/Bearer auth)

> Web bug: see §8 schema drift on the `bucket` CHECK constraint. iOS sends `'savings'` per the API contract; if it 500s, that's a web-side fix, not iOS Phase 8 scope.

### Web-side change required for iOS (small)

The `/api/decisions/ask` and `/api/decisions/outcome` routes both call `createClient()` (cookie-based). For iOS to use these, modify both routes to also accept Bearer-token auth:

```ts
// (illustrative — to be implemented in a separate PR before iOS Phase 8 ships)
const authHeader = request.headers.get('authorization');
if (authHeader?.startsWith('Bearer ')) {
  const token = authHeader.slice(7);
  const { data: { user } } = await supabase.auth.getUser(token);
  // ...
}
```

Alternatively, ship dedicated `/api/decisions/ask-mobile` + `/api/decisions/outcome-mobile` endpoints that accept Bearer-only. Preserves web's cookie behavior unchanged.

> **Phase 8 prompt should make this dependency explicit** — iOS work is blocked on the small web auth change.

### Out of scope for Phase 8

- **Auto-log a transaction on "I bought it".** Web doesn't do this; just navigates to `/transactions`. iOS should match (push to its existing transactions screen).
- **Pre-fill the Add Transaction wizard** with the decision's `item_name` / `amount` / `bucket`. Could be a future enhancement via a deep link + the wizard's existing query-param support.
- **Decision history view.** Rows are persisted but not surfaced on web; no list page exists.
- **Per-decision sharing.** No share affordance on web.
- **Voice input on the entry sheet.** No mic button on web.
- **Streaming responses.** Web uses non-streaming; iOS should match. (If product later wants the "Sika is thinking..." to feel faster via streaming, that's a coordinated change across web + server + client.)
- **Per-user usage limits.** None on web; not needed for v1.
- **Token-cost telemetry.** Not tracked on web; not needed for v1.

### Source-of-truth files for iOS Phase 8 prompt

The complete picture lives across 9 files (~700 lines total):

1. `src/components/decision/should-i-buy-button.tsx` — entry button (28 lines)
2. `src/components/decision/decision-sheet.tsx` — 4-phase sheet (335 lines)
3. `src/types/decision.ts` — `DecisionData`, `Verdict`, etc. (17 lines)
4. `src/lib/ai/decision-voice-prompt.ts` — system prompt (62 lines)
5. `src/lib/decisions/generate-decision.ts` — Anthropic SDK call (35 lines)
6. `src/lib/decisions/compute-decision-context.ts` — server-side math (254 lines, **iOS does not port**)
7. `src/app/api/decisions/ask/route.ts` — main endpoint (48 lines)
8. `src/app/api/decisions/outcome/route.ts` — outcome PATCH (29 lines)
9. `supabase/migrations/0024_purchase_decisions.sql` — table schema (29 lines)

The system prompt (#4) and the response shape (#3) are the most load-bearing for iOS. The math file (#6) is informational only — iOS doesn't reimplement it.
