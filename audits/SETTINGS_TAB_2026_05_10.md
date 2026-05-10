# Settings Tab Audit — 2026-05-10

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Settings rebuild — Phase 6 shipped a partial shell (heritage card themes), this audit covers the full ~14-section Settings page.

Source of truth: web repo (`feat/bearer-auth-decisions` branch, working tree clean for src).

## TL;DR for the iOS prompt author

- **Settings has NO bottom-nav entry.** It's reached via the gear icon in the `TopBar` (top-right of `/dashboard` only — top-bar is mounted on Home and a few other pages). iOS should mirror this: a `gearshape.fill` button in the home toolbar, NOT a 6th tab.
- **The page is one long form (single route)** plus ONE sub-route: `/settings/currency` (currency picker is its own page because of the 131-currency list). All other sections are inline on `/settings`. No `/settings/income`, no `/settings/categories`, no `/settings/privacy` (privacy is `/privacy`, a separate top-level public route).
- **Two theme systems exist and are independent.** The system theme (light/dark via `next-themes`) is at the top in "Appearance"; the heritage card theme (Sankofa/etc — Phase 6 already on iOS) is a separate "Card Style" section further down. Don't conflate them.
- **Every Settings mutation is configuration-only.** Saving budget split / income source / category / theme / currency does NOT fire streak / momentum / badge updates. Match this on iOS.
- **Delete account is the highest-risk operation**: typed `DELETE` confirmation, then `DELETE /api/profile/delete` which cascades **18 user-scoped tables** via service role + deletes `profiles` row + calls `auth.admin.deleteUser(uid)`. iOS needs the same server endpoint (already exists) — its job is just the UI flow + the fetch.
- **Categories are SOFT-deleted** (`is_archived = true`) with a Restore affordance. **Income sources are HARD-deleted**. iOS must match this asymmetry.
- **Income source side effect**: every income-source save/delete also writes `profiles.monthly_income` to the new aggregated total via `syncMonthlyIncome`. Not optional — it's used elsewhere in the app for fallbacks. iOS must mirror.

---

## 1. Page Route + Layout

### Main page

File: `src/app/(app)/settings/page.tsx` (633 lines).
Route: `/settings`.
Wrapper: standard `(app)` route group → `AppShell` provides side-rail / bottom-nav / FAB. Nothing route-specific.

### Sub-route

File: `src/app/(app)/settings/currency/page.tsx` (68 lines).
Route: `/settings/currency`.
Reason for sub-route: 131-entry currency list with search needs its own viewport. Reached via the `Currency` tile on the main page.

### Top-level structure

The main page is one long-form layout, inlined sections in this exact render order (top → bottom):

1. **`<AppearanceSection />`** — light / dark
2. **Currency tile** (inline button → `/settings/currency`)
3. **`<HapticsSection />`** — haptics toggle (hidden on browsers without `navigator.vibrate`)
4. **`<NotificationSettings />`** — push (gated by `experimental_push_notifications` feature flag; returns null when disabled)
5. **`<HintCard hintId="settings_income_sources" />`** — only when `incomeSources.length === 0`
6. **`<IncomeSourcesSection />`** — full CRUD list
7. **`<HintCard hintId="card_theme_available" />`** — "Customize your card"
8. **`<CardThemePicker />`** — heritage themes (Phase 6 territory)
9. *(form starts)* **Total Monthly Income** (read-only echo of the income-sources total)
10. **Budget Month** — `cycle_start_day` input (1-28)
11. **Budget Split** — needs / wants / savings percent inputs
12. **Save changes** button (form submit — covers Budget Month + Budget Split together)
13. **`<HintCard hintId="settings_categories" />`** — only when user has only default categories
14. **Categories** section — full CRUD with NEEDS / WANTS / SAVINGS / Spending (no bucket) / Income / Adjustments / Archived sub-sections
15. **App preferences** — Reset onboarding hints button
16. **Sign out** button (red text, NOT inside danger zone)
17. **`<DangerZone />`** — Delete account
18. **Privacy policy** link (text link to `/privacy`, separate top-level public route)

Total LOC: 633 in the main page; the 7 section components add ~1,200 more.

The `<form>` only wraps the **Total Monthly Income echo + Budget Month + Budget Split** triplet (lines 256-359). Everything else mutates independently when its own button/toggle fires.

---

## 2. Appearance Section

File: `src/components/settings/appearance-section.tsx` (83 lines, full source):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    try {
      await fetch('/api/profile/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme }),
      });
    } catch {
      // silent fail — UI already updated
    }
  };

  if (!mounted) {
    return <div className="bg-card border border-border rounded-2xl p-5 mb-4">{/* skeleton */}</div>;
  }

  const isLight = theme === 'light';

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-4">
      <h2 className="text-foreground font-semibold mb-1">Appearance</h2>
      <p className="text-muted-foreground text-xs mb-4">Choose your preferred colour scheme.</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => handleThemeChange('light')} aria-pressed={isLight}
          className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl border transition-colors ${
            isLight ? 'border-accent bg-accent/10' : 'border-border bg-transparent hover:bg-muted/50'
          }`}>
          <Sun className={`w-5 h-5 ${isLight ? 'text-accent' : 'text-muted-foreground'}`} />
          <span className="text-xs font-medium">Light</span>
        </button>
        <button onClick={() => handleThemeChange('dark')} aria-pressed={!isLight}
          className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl border transition-colors ${
            !isLight ? 'border-accent bg-accent/10' : 'border-border bg-transparent hover:bg-muted/50'
          }`}>
          <Moon className={`w-5 h-5`} />
          <span className="text-xs font-medium">Dark</span>
        </button>
      </div>
    </div>
  );
}
```

### Implementation

- **Library**: `next-themes` (`useTheme` hook). Adds/removes `class="dark"` on `<html>` for Tailwind's `dark:` variant.
- **Persistence**: `next-themes` localStorage by default → key `theme`. **Plus** a mirror to DB via `PATCH /api/profile/theme` (sets `profiles.theme_preference = 'light' | 'dark'`).
- **Options**: **Light or Dark only**. There is NO "System / Auto" option. The `useTheme()` hook can technically return `'system'`, but the UI only ever calls `setTheme('light' | 'dark')`. iOS should mirror this: explicit two-tile picker, no auto.
- **Fallback**: silent-fail on fetch (UI already updated locally).

### `/api/profile/theme` route (verbatim)

```ts
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { theme } = await request.json();
  if (theme !== 'light' && theme !== 'dark') {
    return NextResponse.json({ error: 'Invalid theme' }, { status: 400 });
  }

  const { error } = await supabase.from('profiles').update({ theme_preference: theme }).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

### Visual

2-tile picker grid (`grid-cols-2`), each tile `py-4 px-2 rounded-xl border`. Active tile: `border-accent bg-accent/10` + `text-accent` for icon and label. Sun icon for Light; Moon for Dark.

### Phase 6 / iOS reuse

System theme is **independent** of the heritage card theme. iOS has Phase 6's `CardStylePicker` for heritage themes — that stays. The system theme is a NEW concern: iOS should add a `Light / Dark` SF Symbols toggle in Settings that maps to `UITraitCollection.userInterfaceStyle`-aware app override.

---

## 3. Currency Section

### Inline tile on Settings page (lines 211-222)

```tsx
<div className="bg-card border border-border rounded-2xl p-5 mb-4">
  <h2 className="text-foreground font-semibold mb-1">Currency</h2>
  <p className="text-muted-foreground text-xs mb-4">All amounts display in your chosen currency.</p>
  <button onClick={() => router.push('/settings/currency')} className="...">
    <span className="text-foreground text-sm">Currency</span>
    <span className="text-muted-foreground text-sm font-medium">{profile?.currency ?? 'GHS'}</span>
  </button>
</div>
```

The tile shows the current currency code (e.g. `GHS`) and navigates to the picker page on tap.

### Sub-route page (`src/app/(app)/settings/currency/page.tsx`)

```tsx
export default function CurrencySettingsPage() {
  const router = useRouter();
  const { profile, setProfile } = useAuthStore();
  const [selected, setSelected] = useState(profile?.currency ?? 'GHS');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (selected === profile?.currency) { router.back(); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/profile/currency', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency_code: selected }),
      });
      if (!res.ok) throw new Error();
      if (profile) setProfile({ ...profile, currency: selected });
      toast.success('Currency updated');
      router.back();
    } catch {
      toast.error('Failed to update currency');
    } finally { setSaving(false); }
  }
  // ... renders TopBar + back chevron + card with CurrencyPicker + Save button
}
```

### `CurrencyPicker` (`src/components/settings/currency-picker.tsx`)

```tsx
export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  const [search, setSearch] = useState('');

  const ordered = useMemo<CurrencyOption[]>(() => {
    const lowered = search.toLowerCase();
    if (!lowered) {
      const popular = POPULAR_CURRENCIES
        .map(code => ALL_CURRENCIES.find(c => c.code === code)!)
        .filter(Boolean);
      const rest = ALL_CURRENCIES.filter(c => !POPULAR_CURRENCIES.includes(c.code));
      return [...popular, ...rest];
    }
    return ALL_CURRENCIES.filter(c =>
      c.code.toLowerCase().includes(lowered) ||
      c.name.toLowerCase().includes(lowered) ||
      c.symbol.toLowerCase().includes(lowered),
    );
  }, [search]);

  return (
    <div className="flex flex-col gap-3">
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search currencies…" className="..." />
      <div className="overflow-y-auto max-h-[50vh] space-y-0.5">
        {ordered.map(currency => (
          <button onClick={() => onChange(currency.code)} className={selected ? 'bg-accent/10 border border-accent/40' : 'hover:bg-muted/50'}>
            <div>
              <p className="text-sm font-medium">{currency.code}</p>
              <p className="text-muted-foreground text-xs">{currency.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">{currency.symbol}</span>
              {selected && <Check className="w-4 h-4 text-accent" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Currency catalog (`src/lib/currencies.ts`)

- `ALL_CURRENCIES`: **131 entries** (counted via `grep -c "code:"`). Real ISO 4217 codes with name + symbol. Africa-first ordering (GHS, NGN, KES, ZAR, EGP, ETB, TZS, UGX, XOF, XAF, MAD, DZD, TND, ZMW, MWK, …) followed by global currencies.
- `POPULAR_CURRENCIES`: 8 — `['GHS', 'NGN', 'KES', 'ZAR', 'EGP', 'USD', 'EUR', 'GBP']`. When the search box is empty, these 8 render first.
- Search matches `code` / `name` / `symbol` substring (case-insensitive).

### `/api/profile/currency` route

```ts
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { currency_code } = await request.json();
  if (!ALL_CURRENCIES.some(c => c.code === currency_code)) {
    return NextResponse.json({ error: 'Invalid currency code' }, { status: 400 });
  }

  const { error } = await supabase.from('profiles').update({ currency: currency_code }).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

Server validates the code against the 131-entry catalog. Persists `profiles.currency` (column name is `currency`, not `currency_code`).

### Currency consumption

The `useCurrency()` hook (not exhaustively audited here) reads `profile.currency` and derives:
- `format(amount)` → `${symbol}${amount.toLocaleString(...)}`
- `formatCompact(amount)` → with K/M suffixes
- `symbol` → just the symbol string

So changing the currency reformats every amount in the app on the next render. **No exchange-rate conversion** — the underlying `amount` fields are unchanged; only the display symbol changes.

---

## 4. Push Notifications

File: `src/components/settings/notification-settings.tsx` (125 lines, full source above in source pass).

### Feature flag

```ts
const pushEnabled = useFeatureFlag('experimental_push_notifications');
// ...
if (!mounted || !pushEnabled) return null;
```

The whole section returns `null` when the flag is off. iOS should NOT mirror this — push is a normal feature on iOS.

### Toggle behavior (web push specific)

```ts
async function handleToggle(next: boolean) {
  if (!user || working) return;

  if (next && !isInPWA()) {
    setShowInstallModal(true);     // require PWA installation first
    return;
  }

  setWorking(true);
  try {
    if (next) {
      const ok = await subscribeToPush(user.id);
      // toast success/error
    } else {
      const ok = await unsubscribeFromPush(user.id);
      // toast success
    }
  } finally { setWorking(false); }
}
```

Web subscribe flow (`src/lib/push-subscriptions.ts`):

1. Check `isPushSupported()` (serviceWorker + PushManager + Notification globals).
2. Read `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env.
3. `await navigator.serviceWorker.ready`.
4. `Notification.requestPermission()` — must return `'granted'`.
5. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })`.
6. Upsert `push_subscriptions` row with `endpoint`, `p256dh_key`, `auth_key`, `user_agent`. Conflict key: `(user_id, endpoint)`.
7. Best-effort POST `/api/push/welcome` for a welcome notification (silent-fail).

### iOS divergence

iOS uses **APNs**, not web push. The Settings toggle on iOS becomes:
- Read current `UNAuthorizationStatus` (notDetermined / denied / authorized / provisional).
- On enable: `UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])`. If granted, `UIApplication.shared.registerForRemoteNotifications()`.
- On `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`: send the APNs device token to a server endpoint that stores it in `push_subscriptions` (or a new `apns_subscriptions` table — schema decision).
- On disable: server endpoint removes the row; client doesn't need to "unsubscribe APNs" per se.
- Permission denied is permanent without a Settings → iOS Settings round-trip; show a "Open Settings" affordance.

The web `push_subscriptions` schema (`endpoint`, `p256dh_key`, `auth_key`) is web-push-specific; iOS will need a server-side schema decision before this section is built. Flag this as a prerequisite — the Bearer auth helper from `feat/bearer-auth-decisions` IS relevant here (the iOS app needs to authenticate the device-token registration call).

---

## 5. Income Sources (full CRUD)

File: `src/components/settings/income-sources-section.tsx` (480 lines).

### Schema (`income_sources` table)

```ts
interface IncomeSource {
  id: string;
  user_id: string;
  name: string;                          // ≤ 50 chars
  amount: number;                        // > 0
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'irregular';
  expected_day: number | null;           // 1-31 for monthly, 0-6 for weekly/biweekly, null for irregular
  notes: string | null;                  // ≤ 200 chars
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### Frequency labels + colors (`src/lib/income.ts`)

```ts
export const FREQUENCY_LABELS: Record<string, string> = {
  monthly:   'Monthly',
  weekly:    'Weekly',
  biweekly:  'Bi-weekly',
  irregular: 'Irregular',
};

export const FREQUENCY_COLORS: Record<string, string> = {
  monthly:   '#00D9A3',  // green
  weekly:    '#60A5FA',  // blue
  biweekly:  '#FBBF24',  // yellow
  irregular: '#A1A1AA',  // gray
};

export const DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
```

### Monthly equivalent computation (`src/lib/income.ts`)

```ts
export function calculateMonthlyEquivalent(
  amount: number,
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'irregular'
): number {
  switch (frequency) {
    case 'monthly':   return amount;
    case 'weekly':    return amount * 4.333;   // avg weeks per month
    case 'biweekly':  return amount * 2.167;
    case 'irregular': return amount;           // assume monthly-ish
  }
}

export function totalMonthlyIncome(sources: IncomeSource[]): number {
  return sources
    .filter(s => s.is_active)
    .reduce((sum, s) => sum + calculateMonthlyEquivalent(s.amount, s.frequency), 0);
}
```

iOS port: keep the constants `4.333` and `2.167` exact. Don't recompute as `52/12` or `26/12` — match web bit-for-bit so totals are identical between platforms.

### Validation (zod)

```ts
const sourceSchema = z.object({
  name: z.string().min(1, 'Required').max(50, 'Max 50 chars'),
  amount: z.number().positive('Must be greater than 0'),
  frequency: z.enum(['monthly', 'weekly', 'biweekly', 'irregular']),
  expected_day: z.number().int().min(0).max(31).nullable().optional(),
  notes: z.string().max(200).optional(),
  is_active: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.frequency !== 'irregular' && data.expected_day == null) {
    ctx.addIssue({
      code: 'custom',
      message: data.frequency === 'monthly'
        ? 'Pick the day of month this lands'
        : 'Pick the day of week this lands',
      path: ['expected_day'],
    });
  }
});
```

`expected_day` is required for fixed frequencies (monthly/weekly/biweekly). Irregular skips it.

### Quick-add templates (4 entries)

```ts
const QUICK_ADD_TEMPLATES = [
  { name: 'Monthly salary',                amount: 9000, frequency: 'monthly',   expected_day: 25   },
  { name: 'Weekly allowance',              amount: 600,  frequency: 'weekly',    expected_day: 1    },
  { name: 'Monthly allowance (irregular)', amount: 2600, frequency: 'irregular', expected_day: null },
  { name: 'Benefit / subsidy',             amount: 500,  frequency: 'monthly',   expected_day: 1    },
];
```

These render as a 2-column grid only when `incomeSources.length === 0` (empty state). On tap they open the modal in **add mode** without pre-filling values — note: `void template;` in `openAdd(template?)` indicates the templates are presentational only at the moment (the data isn't passed through yet). iOS should pre-fill the form with the template's values.

### Per-row chrome (lines 401-462)

```tsx
{incomeSources.map((source) => {
  const monthlyEq = calculateMonthlyEquivalent(source.amount, source.frequency);
  const showEq = source.frequency !== 'monthly' && source.frequency !== 'irregular';
  const missingDay = source.frequency !== 'irregular' && source.expected_day == null;
  return (
    <div key={source.id} className="flex items-center justify-between px-3 py-2.5 bg-muted rounded-xl"
      style={{ opacity: source.is_active ? 1 : 0.5 }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-sm font-medium truncate">{source.name}</span>
          <Badge className="..."
            style={{
              backgroundColor: FREQUENCY_COLORS[source.frequency] + '22',
              color: FREQUENCY_COLORS[source.frequency],
            }}>
            {FREQUENCY_LABELS[source.frequency]}
          </Badge>
          {!source.is_active && <span className="text-muted-foreground/70 text-[10px]">inactive</span>}
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-muted-foreground text-xs">{format(source.amount)}</span>
          {showEq && <span className="text-muted-foreground/70 text-[11px]">≈ {format(monthlyEq)}/mo</span>}
        </div>
        {missingDay && (
          <button type="button" onClick={() => openEdit(source)}
            className="flex items-center gap-1 mt-1 text-[11px] text-[#FBBF24] hover:underline">
            <AlertCircle className="w-3 h-3" />
            <span>No reminder day set — tap to add one</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 ml-2 shrink-0">
        <button onClick={() => openEdit(source)} className="..."><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={() => handleDelete(source.id)} className="hover:text-[#F43F5E] ..."><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
})}

<div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
  <span className="text-muted-foreground text-sm">Total monthly income</span>
  <span className="text-foreground text-base font-bold">{format(total)}</span>
</div>
```

Visual elements per row:
- Name (truncated, foreground bold)
- Frequency badge (Monthly green / Weekly blue / Bi-weekly yellow / Irregular gray; bg at 22% alpha)
- `inactive` label if `!is_active` (whole row at 50% opacity)
- Raw amount + `≈ {monthlyEq}/mo` for weekly/biweekly only (monthly skips the ≈, irregular skips it too)
- "No reminder day set — tap to add one" warning (yellow, `AlertCircle` icon) when fixed frequency + null `expected_day`
- Pencil button (edit) + Trash2 button (delete, red on hover)

Below the list: totals strip with hairline border.

### Modal (`IncomeSourceModal`, lines 88-329)

Centered shadcn `Dialog`, `max-w-sm`. Title: `Add income source` / `Edit income source`.

Fields in order:
1. **Name** — `<Input>`, placeholder `e.g. Salary, Weekly Allowance`.
2. **Amount** — `<Input type="number" inputMode="decimal" min="0.01" step="0.01">` with currency symbol prefix in label.
3. **Frequency** — 4-chip grid (`grid-cols-4`), short labels (`Bi-wk` instead of `Bi-weekly`). Active chip uses `FREQUENCY_COLORS[f]` for border + bg + text.
4. **Expected day** — required asterisk star (red). For `monthly`: number input 1-31. For `weekly`/`biweekly`: shadcn `Select` with 7 day options. For `irregular`: skipped, replaced by helper text "Sika won't send reminders. Log it manually when received."
5. **Notes (optional)** — `<textarea>`, 200 chars, 2 rows.
6. **Active toggle** — pill switch, **edit mode only**.
7. **Submit button** — `Add source` (add) / `Save changes` (edit).

Submit gate: name non-empty, amount > 0, expected_day set for fixed frequencies.

### Side effect: `syncMonthlyIncome`

```ts
async function syncMonthlyIncome(supabase, userId, sources: IncomeSource[]) {
  const total = totalMonthlyIncome(sources);
  await supabase
    .from('profiles')
    .update({ monthly_income: total, updated_at: new Date().toISOString() })
    .eq('id', userId);
}
```

Called after every income source create/update/delete. Maintains `profiles.monthly_income` as a denormalized cached total. Used elsewhere as a fallback when `income_sources` is empty (e.g. in `lib/health-score.ts`).

iOS must mirror this. Don't skip — other parts of the app read `profile.monthlyIncome`.

### Delete is HARD

```ts
async function handleDelete(id: string) {
  if (!user) return;
  const { error } = await supabase.from('income_sources').delete().eq('id', id);
  // ...syncMonthlyIncome, bumpMutation, toast
}
```

`.delete()`, NOT `.update({is_active: false})`. No `is_archived` column on `income_sources`. No undo. No confirmation dialog (just trash icon → instant delete).

iOS recommendation: ADD a confirmation `Alert` even though web doesn't have one — destructive ops without confirmation are non-idiomatic on iOS. Get explicit approval from product if you preserve web's no-confirm behavior.

### No mutation hooks

Income source create/update/delete does NOT fire streak/momentum/badge updates.

---

## 6. "Customize your card" HintCard

```tsx
<HintCard
  hintId="card_theme_available"
  title="Customize your card"
  body="Choose from 7 heritage-themed card styles inspired by Adinkra symbols and Ghanaian craft. Tap 'Change card' to browse."
  className="mb-4"
/>
```

`hintId`: `'card_theme_available'` (already in the `HintId` union per earlier audits).
`variant`: omitted → defaults to whatever HintCard's default is.
Dismissal: same one-time pattern as all HintCards (`dismissed_hints` table).

---

## 7. Card Style Section

File: `src/components/settings/card-theme-picker.tsx` (33 lines):

```tsx
export function CardThemePicker() {
  const { profile } = useAuthStore();
  const themeId = (profile?.card_theme as CycleCardTheme) ?? 'sankofa';
  const config = CYCLE_CARD_THEMES[themeId] ?? CYCLE_CARD_THEMES.sankofa;
  const userName = profile?.full_name?.toUpperCase() ?? 'YOUR NAME';

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-foreground font-semibold">Card Style</h2>
        <ThemePicker />
      </div>
      <p className="text-muted-foreground text-xs mb-4">
        {config.name}{config.meaning ? ` — ${config.meaning}` : ''}
      </p>
      <div className="w-full">
        <CardSurface themeId={themeId} cycleNet={2426} userName={userName} />
      </div>
    </div>
  );
}
```

### What's shown

- **Section title** (bold "Card Style") + **`<ThemePicker />`** trigger button on the right (the picker sheet — not audited in detail since this is Phase 6 territory iOS already has).
- **Subtitle line**: `{theme.name} — {theme.meaning}` (e.g. "Sankofa — Learn from the past"). The `name` and `meaning` come from `CYCLE_CARD_THEMES[themeId]` (`src/types/card-theme.ts`).
- **Live preview**: `<CardSurface>` with the active theme, hardcoded `cycleNet={2426}`, and the user's uppercased full name (or `'YOUR NAME'`). Same component used on the dashboard for the real virtual card.

### iOS reuse

**Phase 6 already shipped this on iOS** — keep it as-is. The CardThemePicker is the heritage-themes picker. The system theme (Section 2) is a separate concern.

The picker sheet itself is `<ThemePicker />` from `@/components/cycle-card/theme-picker` — out of scope for this audit (Phase 6 has the iOS equivalent).

---

## 8. Total Monthly Income Echo

```tsx
<div className="bg-card border border-border rounded-2xl p-5">
  <h2 className="text-foreground font-semibold mb-1">Total Monthly Income</h2>
  <p className="text-muted-foreground text-xs mb-3">Computed from your active income sources above</p>
  <div className="h-12 px-4 bg-muted border border-border rounded-xl flex items-center">
    <span className="text-foreground font-semibold text-base">
      {totalIncome > 0 ? format(totalIncome) : "—"}
    </span>
  </div>
</div>
```

### Why it appears twice

- **First occurrence**: at the bottom of `IncomeSourcesSection` ("Total monthly income") — section-internal totals strip.
- **Second occurrence (this echo)**: at the top of the form group that contains Budget Month + Budget Split — used as **context** for the percentage-to-GHS amount derivation in Budget Split (each Needs/Wants/Savings input shows `{(income × pct) / 100}` underneath).

Both are read-only displays of `totalMonthlyIncome(incomeSources)`. They're not stored separately; they're recomputed every render from the same source array.

iOS should keep both occurrences for the same reason — the budget-split inputs need to display the GHS equivalents.

---

## 9. Budget Month

```tsx
<div className="bg-card border border-border rounded-2xl p-5">
  <h2 className="text-foreground font-semibold mb-1">Budget Month</h2>
  <p className="text-muted-foreground text-xs mb-4">
    Which day of the month does your month start? (1–28)
  </p>
  <div className="space-y-1.5">
    <Label className="text-muted-foreground text-sm">Month start day</Label>
    <Input type="number" min="1" max="28"
      className="h-11 w-28 bg-input border-border text-foreground focus-visible:ring-accent amount"
      {...register("cycle_start_day", { valueAsNumber: true })} />
    <p className="text-muted-foreground/70 text-[11px]">
      Tip: set this to your salary day so your budget resets when you get paid.
    </p>
  </div>
</div>
```

### Validation

```ts
cycle_start_day: z.number().int().min(1).max(28),
```

Capped at 28 (no Feb-30 problem).

### Persistence

`profiles.cycle_start_day` integer column. Saved with the form's "Save changes" button (covers Budget Month + Budget Split together).

### Tip

`Tip: set this to your salary day so your budget resets when you get paid.` — verbatim copy.

---

## 10. Budget Split

```tsx
<div className="bg-card border border-border rounded-2xl p-5">
  <h2 className="text-foreground font-semibold mb-1">Budget Split (%)</h2>
  <p className="text-muted-foreground text-xs mb-4">Must add up to 100</p>
  <div className="grid grid-cols-3 gap-3">
    {(["needs", "wants", "savings"] as const).map((bucket) => {
      const colors  = { needs: "#00D9A3", wants: "#FBBF24", savings: "#60A5FA" };
      const labels  = { needs: "Needs",   wants: "Wants",   savings: "Savings"  };
      const pct = profile ? (profile[`${bucket}_percent`] as number) : 0;
      return (
        <div key={bucket} className="space-y-1.5">
          <Label className="text-xs" style={{ color: colors[bucket] }}>{labels[bucket]}</Label>
          <Input type="number" min="0" max="100"
            className="h-10 bg-input border-border text-foreground focus-visible:ring-accent text-center amount"
            {...register(`${bucket}_percent`, { valueAsNumber: true })} />
          {totalIncome > 0 && (
            <p className="text-muted-foreground/70 text-[10px] text-center">
              {format((totalIncome * pct) / 100)}
            </p>
          )}
        </div>
      );
    })}
  </div>
  {errors.needs_percent && (
    <p className="text-[#F43F5E] text-xs mt-2">{errors.needs_percent.message}</p>
  )}
</div>
```

### Validation (zod refine, lines 43-53)

```ts
const profileSchema = z
  .object({
    needs_percent:    z.number().min(0).max(100),
    wants_percent:    z.number().min(0).max(100),
    savings_percent:  z.number().min(0).max(100),
    cycle_start_day:  z.number().int().min(1).max(28),
  })
  .refine((d) => d.needs_percent + d.wants_percent + d.savings_percent === 100, {
    message: "Percentages must sum to 100",
    path: ["needs_percent"],
  });
```

The error message attaches to `needs_percent` so it renders below the section. iOS should match the validation logic; the error-anchor convention can adapt to whatever pattern iOS uses.

### Live GHS preview

Each input shows `{format((totalIncome * pct) / 100)}` underneath in tiny text — the live derived amount. Suppressed when `totalIncome === 0`.

### Save button (line 348)

```tsx
<Button type="submit" disabled={isSubmitting || !isDirty}
  className="w-full h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl ...">
  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
</Button>
```

Disabled when nothing has changed (`!isDirty`). Triggers `onSaveProfile` which writes `profiles.{needs_percent, wants_percent, savings_percent, cycle_start_day, updated_at}`, then `refetch()` + `bumpMutation()` + toast `Settings saved`.

### Persistence

`profiles.needs_percent`, `wants_percent`, `savings_percent` — three integer columns.

### iOS port consideration

Web's `react-hook-form` + zod `refine` triplet maps to iOS as: a `BudgetSplitForm` `@State` with three Int values + a computed `var sum` that gates the Save button. The on-the-fly GHS preview is `(totalMonthlyIncome * pct) / 100`.

---

## 11. Categories (full CRUD)

### Section structure (page.tsx lines 372-547)

```tsx
<div className="bg-card border border-border rounded-2xl p-5 mt-6">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-foreground font-semibold">Categories</h2>
    <Button onClick={() => { setEditingCat(undefined); setCatModalOpen(true); }} className="h-8 ... gold pill">
      <Plus className="w-3.5 h-3.5" /> Add
    </Button>
  </div>

  <div className="space-y-5">
    {/* Spending categories grouped by bucket — needs, wants, savings */}
    {(["needs", "wants", "savings"] as const).map((bName) => {
      const bCats = expenseByBucket[bName] ?? [];
      if (bCats.length === 0) return null;
      // ... colored dot + UPPERCASE label + CategoryRow list
    })}

    {/* Expense categories without a bucket */}
    {expenseNoBucket.length > 0 && <div>...Spending (no bucket) header + rows...</div>}

    {/* Income categories — gold "+" header */}
    {incomeCats.length > 0 && <div>...gold + Income header + rows...</div>}

    {/* Adjustment categories — ⚖️ Adjustments header */}
    {adjustmentCats.length > 0 && <div>...⚖️ Adjustments header + rows...</div>}

    {/* Archived collapsible */}
    {archivedCats.length > 0 && <div>...{N} archived chevron + collapsed rows with Restore links...</div>}
  </div>
</div>
```

### Group ordering (top → bottom)

1. **NEEDS** — green dot (#00D9A3) + `NEEDS` uppercase label in green (only when there's at least one needs category)
2. **WANTS** — yellow dot (#FBBF24) + `WANTS` uppercase label in yellow
3. **SAVINGS** — blue dot (#60A5FA) + `SAVINGS` uppercase label in blue
4. **Spending (no bucket)** — muted header (only when there are expense categories without a bucket — degenerate state, shouldn't happen with valid form)
5. **INCOME** — gold "+" + `INCOME` uppercase label in gold (#D4A017)
6. **Adjustments** — ⚖️ emoji + `ADJUSTMENTS` uppercase label in muted
7. **N archived** — collapsible chevron disclosing archived categories

### `CategoryRow` (lines 605-633, full source)

```tsx
function CategoryRow({ cat, onEdit, onArchive, getIconEmoji }: CategoryRowProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-xl group">
      <div className="flex items-center gap-2">
        <span className="text-base">{getIconEmoji(cat.icon)}</span>
        <span className="text-foreground text-sm">{cat.name}</span>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="..."><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={onArchive} className="hover:text-[#FBBF24] ..."><Archive className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}
```

Per row: emoji icon + name + (on hover) Pencil + Archive icons.

**Important**: hover is desktop-only. On mobile (which is iOS' use case), `opacity-0 group-hover:opacity-100` means the icons are **invisible** — the user can only act via the modal opened from elsewhere. iOS should NOT mirror this — icons should be always visible.

### Archived row (lines 519-543)

```tsx
{archivedCats.map((cat) => (
  <div key={cat.id} className="flex items-center justify-between px-3 py-2 bg-muted rounded-xl opacity-50">
    <div className="flex items-center gap-2">
      <span className="text-base">{getIconEmoji(cat.icon)}</span>
      <span className="text-muted-foreground text-sm">{cat.name}</span>
    </div>
    <button onClick={() => handleRestoreCategory(cat.id)} className="text-xs text-[#D4A017] hover:text-[#E8B520]">
      Restore
    </button>
  </div>
))}
```

50% opacity, "Restore" gold link.

### CategoryModal (`src/components/settings/category-modal.tsx`, 284 lines)

Centered shadcn `Dialog`, `max-w-sm`. Title: `Add category` / `Edit category`.

Fields:
1. **Name** — required, ≤ 40 chars.
2. **Type** — 3-chip row: Expense / Income / Adjustment. Active chip: gold border + bg.
   - Expense → "Subtracts from your buckets"
   - Income → "Adds to your available income"
   - Adjustment → "For reconciling balances — doesn't affect buckets"
3. **Bucket** — only when type is `expense`. Chip row populated from `budget_buckets` table query (per-user). Active chip: bucket-color border + bg.
4. **Icon (optional)** — 8-column grid of 23 emoji options:

```ts
export const ICON_OPTIONS: { key: string; emoji: string }[] = [
  { key: 'home',          emoji: '🏠' },
  { key: 'shopping-cart', emoji: '🛒' },
  { key: 'zap',           emoji: '⚡' },
  { key: 'droplet',       emoji: '💧' },
  { key: 'wifi',          emoji: '📶' },
  { key: 'car',           emoji: '🚗' },
  { key: 'utensils',      emoji: '🍽️' },
  { key: 'heart-pulse',   emoji: '💊' },
  { key: 'pizza',         emoji: '🍕' },
  { key: 'film',          emoji: '🎬' },
  { key: 'shopping-bag',  emoji: '🛍️' },
  { key: 'repeat',        emoji: '🔄' },
  { key: 'dumbbell',      emoji: '🏋️' },
  { key: 'sparkles',      emoji: '✨' },
  { key: 'piggy-bank',    emoji: '🐷' },
  { key: 'trending-up',   emoji: '📈' },
  { key: 'shield',        emoji: '🛡️' },
  { key: 'briefcase',     emoji: '💼' },
  { key: 'gift',          emoji: '🎁' },
  { key: 'scale',         emoji: '⚖️' },
  { key: 'phone',         emoji: '📞' },
  { key: 'book',          emoji: '📚' },
  { key: 'music',         emoji: '🎵' },
];
```

23 entries — 4 more than the Transactions row map (`gift` is the last in Transactions; this list adds `scale, phone, book, music`). Tap an active icon again deselects it.

5. **Submit** — `Add category` (add) / `Save changes` (edit). Disabled until name is non-empty.

### Validation

```ts
const categorySchema = z
  .object({
    name: z.string().min(1, 'Required').max(40, 'Max 40 chars'),
    category_type: z.enum(['expense', 'income', 'adjustment']),
    bucket_id: z.string().nullable(),
    icon: z.string().nullable(),
  })
  .refine((d) => d.category_type !== 'expense' || d.bucket_id !== null, {
    message: 'Choose a bucket for this expense category',
    path: ['bucket_id'],
  });
```

Expense categories MUST have a bucket; income/adjustment categories ignore bucket_id (auto-cleared via the `useEffect` on `categoryType` change).

### Save logic

```ts
async function onSubmit(values: CategoryForm) {
  // ...
  const payload = {
    user_id: user.id,
    name: values.name,
    category_type: values.category_type,
    bucket_id: values.category_type === 'expense' ? values.bucket_id : null,
    icon: values.icon,
    is_default: false,
    is_archived: false,
  };
  // INSERT or UPDATE depending on editCategory
}
```

New categories always have `is_default = false` and `is_archived = false`.

### Soft delete (Archive)

```ts
async function handleArchiveCategory(id: string) {
  const { error } = await supabase
    .from("categories")
    .update({ is_archived: true })
    .eq("id", id);
  // ...optimistic local state, bumpMutation, toast
}

async function handleRestoreCategory(id: string) {
  const { error } = await supabase
    .from("categories")
    .update({ is_archived: false })
    .eq("id", id);
  // ...
}
```

**Archive, not delete.** Archived categories disappear from pickers but stay in the DB. Existing transactions retain their `category_id` reference. The Restore link toggles `is_archived = false`.

There is NO hard-delete affordance for categories on web. iOS should mirror.

### Default categories

`is_default = true` and/or `user_id = null` rows are seed defaults shipped with the database (not user-created). The form unconditionally sets `is_default: false` on inserts. The Settings page hides the "Categories explained" hint until the user has at least one non-default category (`hasOnlyDefaultCats`).

iOS should NOT bundle its own seed catalog — the DB already has them. iOS just reads `categories` per user.

### No mutation hooks

Category create/update/archive does NOT fire streak/momentum/badge updates.

---

## 12. App Preferences (Reset onboarding hints)

```tsx
<div className="mt-6 bg-card border border-border rounded-2xl p-5">
  <h2 className="text-foreground font-semibold mb-1">App preferences</h2>
  <p className="text-muted-foreground text-xs mb-4">
    Show all dismissed hints again. Useful if you want a refresher.
  </p>
  <Button type="button" variant="outline" onClick={handleResetHints}
    className="h-10 px-4 border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl text-sm gap-2">
    <RotateCcw className="w-3.5 h-3.5" /> Reset onboarding hints
  </Button>
</div>
```

### Handler (lines 168-174)

```ts
async function handleResetHints() {
  if (!user) return;
  const { setDismissedHints } = useAuthStore.getState();
  await supabase.from('dismissed_hints').delete().eq('user_id', user.id);
  setDismissedHints([]);
  toast.success('Hints will appear again');
}
```

`DELETE FROM dismissed_hints WHERE user_id = X`. **No confirmation dialog.** Resets local store array to empty, success toast.

iOS should add a confirmation Alert (idiomatic) — "Reset all dismissed hints?" / Cancel / Reset. Web's lack of confirmation is a minor UX miss.

---

## 13. Sign Out

```tsx
<div className="mt-4">
  <Button variant="outline" onClick={handleSignOut}
    className="w-full h-12 border-border text-[#F43F5E] hover:bg-[#F43F5E]/10 hover:border-[#F43F5E]/50 rounded-xl">
    <LogOut className="w-4 h-4 mr-2" /> Sign out
  </Button>
</div>
```

### Handler (lines 112-117)

```ts
async function handleSignOut() {
  resetAnalytics();
  await supabase.auth.signOut();
  reset();
  router.push("/login");
}
```

Three steps:
1. `resetAnalytics()` from `lib/analytics/identify` — clears the PostHog identity.
2. `supabase.auth.signOut()` — clears the auth cookie + invalidates the session server-side.
3. `reset()` — auth-store reset (`reset` from `useAuthStore`, defined to clear user/profile/streaks/momentum/badges/healthScore/etc.).
4. Redirect to `/login`.

### Visual

Outlined button, full-width, muted border, **red text** (`#F43F5E`). NOT inside the danger zone. The visual hierarchy puts Sign out as a normal-but-careful action; Delete account is more severe (Section 14).

iOS port: same flow with `Auth.shared.signOut()` (or whatever the Supabase Swift SDK calls) → reset AppState → present `LoginView` (or `NavigationStack` root).

---

## 14. Delete Account (Danger Zone)

### Visual

```tsx
<div className="mt-6 bg-card border border-destructive/30 rounded-2xl p-5">
  <h2 className="text-destructive font-semibold mb-1">Danger zone</h2>
  <p className="text-muted-foreground text-xs mb-4">
    Permanently delete your account and all data. This cannot be undone.
  </p>
  <Button type="button" variant="outline" onClick={() => { setOpen(true); setConfirmText(''); setError(''); }}
    className="h-10 px-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive rounded-xl text-sm gap-2">
    <Trash2 className="w-3.5 h-3.5" /> Delete my account
  </Button>
  ...modal below...
</div>
```

Bordered destructive card (`border-destructive/30`), red title, "Delete my account" outline button with red text and red hover.

### Confirmation dialog

```tsx
<Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
  <DialogContent showCloseButton={false} className="bg-card border-border">
    <DialogTitle className="text-foreground font-bold text-base">Delete your account?</DialogTitle>
    <p className="text-muted-foreground text-sm">
      This will permanently erase all your transactions, accounts, goals, income sources, and settings.
      <strong className="text-foreground">There is no undo.</strong>
    </p>
    <div className="space-y-1.5">
      <label className="text-muted-foreground text-xs">
        Type <span className="font-mono font-semibold text-destructive">DELETE</span> to confirm
      </label>
      <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE"
        className="h-11 bg-input border-border text-foreground font-mono ..." disabled={loading} />
    </div>
    {error && <p className="text-destructive text-xs">{error}</p>}
    <div className="flex gap-2 pt-1">
      <Button variant="outline" disabled={loading} onClick={() => setOpen(false)} className="flex-1 ...">Cancel</Button>
      <Button onClick={handleDelete} disabled={confirmText !== 'DELETE' || loading}
        className="flex-1 h-11 bg-destructive hover:bg-destructive/90 text-white font-semibold rounded-xl disabled:opacity-40">
        {loading ? 'Deleting…' : 'Delete everything'}
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

**Typed-confirmation** — user must literally type the string `DELETE` before the destructive button enables. Modal cannot be closed during `loading` (`onOpenChange={(o) => !loading && setOpen(o)}`).

### Client handler (`src/components/settings/danger-zone.tsx:23-40`)

```ts
async function handleDelete() {
  if (confirmText !== 'DELETE') return;
  setLoading(true);
  setError('');
  try {
    const res = await fetch('/api/profile/delete', { method: 'DELETE' });
    if (!res.ok) {
      setError('Could not delete account. Email dtglover21@gmail.com for help.');
      setLoading(false);
      return;
    }
    reset();
    router.push('/login');
  } catch {
    setError('Could not delete account. Email dtglover21@gmail.com for help.');
    setLoading(false);
  }
}
```

On any error: shows the email contact in the modal. On success: resets the auth store and redirects to `/login`.

### Server route (`src/app/api/profile/delete/route.ts`, full source)

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceClient();
  const uid = user.id;

  // Verified user-scoped tables (FK-safe order: dependents first)
  const tables = [
    'transactions',
    'recurring_transactions',
    'purchase_decisions',
    'daily_insights',
    'monthly_recaps',
    'user_daily_reads',
    'momentum_events',
    'user_badges',
    'streaks',
    'income_nudge_dismissals',
    'dismissed_hints',
    'income_sources',
    'goals',
    'categories',
    'accounts',
    'budget_buckets',
    'momentum',
  ];

  const tableErrors: string[] = [];
  for (const table of tables) {
    try {
      const { error } = await svc.from(table).delete().eq('user_id', uid);
      if (error) {
        console.error(`Failed to delete ${table}:`, error.message);
        tableErrors.push(table);
      }
    } catch (err) {
      console.error(`Exception deleting ${table}:`, err);
      tableErrors.push(table);
    }
  }

  if (tableErrors.length > 0) {
    console.warn(`Non-fatal table errors during account deletion for ${uid}:`, tableErrors);
  }

  const { error: profileErr } = await svc.from('profiles').delete().eq('id', uid);
  if (profileErr) {
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 });
  }

  const { error: authErr } = await svc.auth.admin.deleteUser(uid);
  if (authErr) {
    return NextResponse.json({ error: 'Failed to delete auth user' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

### What's deleted (17 user-scoped tables + profiles + auth.users)

In FK-safe order:

1. `transactions`
2. `recurring_transactions`
3. `purchase_decisions`
4. `daily_insights`
5. `monthly_recaps`
6. `user_daily_reads`
7. `momentum_events`
8. `user_badges`
9. `streaks`
10. `income_nudge_dismissals`
11. `dismissed_hints`
12. `income_sources`
13. `goals`
14. `categories`
15. `accounts`
16. `budget_buckets`
17. `momentum`
18. `profiles` (final user-scoped row)
19. `auth.users` (via `svc.auth.admin.deleteUser(uid)`)

### What's preserved (intentionally)

The route comment states: *"Do NOT include shared tables: badges, sika_daily_digests, sika_daily_sources"*.
- `badges` is the catalog (not user-specific, just badge definitions).
- `sika_daily_digests` and `sika_daily_sources` are shared system tables.

### Failure semantics

- Per-table delete errors are logged but **non-fatal** — the route continues. Best-effort cascade.
- `profiles` delete failure is fatal → 500.
- `auth.admin.deleteUser` failure is fatal → 500.

If the route returns 200, the client redirects to `/login`. If 500, the modal shows the contact email.

### iOS port

iOS calls the same `/api/profile/delete` endpoint. Auth: cookie from web login, OR Bearer token (the `getAuthedUser` helper from `feat/bearer-auth-decisions` is currently scoped to `/api/decisions/*` only — to support iOS, the delete endpoint needs the same Bearer fallback). **Add this to the iOS prerequisites list.**

---

## 15. Privacy Policy

### Where it points

`<a href="/privacy" ...>Privacy policy</a>` — separate top-level public route.

File: `src/app/privacy/page.tsx` (110 lines). Renders a plain HTML privacy policy page. No auth required (it's a marketing/legal page).

### Contents (paraphrased — full source available in audit's read pass)

11 sections:
1. What Sika is
2. What we collect (name, email, financial data, preferences, usage signals)
3. How we use your data (display, computations, AI insights via Claude, optional digests)
4. AI features (Claude API; data not used to train models)
5. Usage analytics (PostHog with masked financial data)
6. Data storage and security (Supabase + AWS, RLS)
7. Your rights (Export via email, Delete from app, Correction inline)
8. Cookies and tracking (only session cookie)
9. Children (not for under-13)
10. Changes to this policy
11. Contact: `dtglover21@gmail.com`

### iOS rendering

Two options:
1. **Native rendering** — port the 11 sections to Swift/SwiftUI as a static `PrivacyView`. Higher maintenance (any web update means an iOS update).
2. **`SFSafariViewController`** — load `https://sika.app/privacy` in-app. Lower maintenance, but harder to match the app's visual style. Recommended for v1.

The privacy text changes rarely; either approach works. Default to `SFSafariViewController` unless product wants native styling.

---

## 16. Tab Bar Entry

**Settings is NOT a bottom-nav tab on web.**

The 5 BottomNav tabs are: Home / Transactions / Accounts / Goals / Recurring (per Transactions audit Section 14).

### Entry point: gear icon in TopBar

File: `src/components/layout/top-bar.tsx` (full source, 39 lines):

```tsx
'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { format } from 'date-fns';
import { getGreeting } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { SikaMark } from '@/components/brand/sika-mark';

export function TopBar() {
  const { profile } = useAuthStore();
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  return (
    <div className="flex items-center justify-between px-4 pb-4 md:px-8"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center">
          <SikaMark size={32} variant="gold-on-navy" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{getGreeting()}, {firstName}</p>
          <p className="text-xs text-muted-foreground/70">{format(new Date(), 'MMMM yyyy')}</p>
        </div>
      </div>

      <Link href="/settings"
        className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-colors">
        <Settings className="w-4 h-4" />
      </Link>
    </div>
  );
}
```

`TopBar` is mounted on the dashboard (Home page) and a few sub-pages. The gear icon (`Settings` Lucide) on the right side is a Next.js `<Link href="/settings">`.

### iOS port

Add a `Toolbar` item with `.toolbar { ToolbarItem(placement: .topBarTrailing) { Button { ... } label: { Image(systemName: "gearshape.fill") } } }` on the Home view. Tapping pushes a `SettingsView`.

**Do NOT add a 6th tab.** Settings is a "drilling" destination, not a peer of the 5 main tabs.

---

## 17. Data Dependencies

### Tables read

| Table | Section | Read shape |
|---|---|---|
| `profiles` | All form fields | full row (`useProfile` hook) |
| `income_sources` | Income Sources | full rows for user (`useAuthStore.incomeSources`) |
| `categories` | Categories | full rows joined to `budget_buckets` (`useTransactionStore.categories`) |
| `budget_buckets` | Category modal (bucket picker) | per-user, lazy-loaded when modal opens |
| `dismissed_hints` | Reset onboarding hints | (write-only) DELETE eq user_id |
| `push_subscriptions` | NotificationSettings | upsert + delete (helpers in `lib/push-subscriptions.ts`) |

`useProfile` hook (already audited in HealthRow Section 9) does the parallel fetch of profiles + income_sources + accounts + dismissed_hints + streaks + momentum + user_badges. Categories are fetched separately by another hook (not part of the Settings page; the page just reads the store).

### Refetch strategy

Same as the rest of the app:
- **`mutationCount` in `useTransactionStore`** — bumped after any mutation (`bumpMutation()`). Triggers re-fetches in `useProfile` and other hooks via their `useEffect` deps.
- **`refetch()` from `useProfile`** — explicit refetch after the budget-split form submit.
- No real-time subscriptions, no pull-to-refresh, no auto-refresh on focus.

### Profile API routes (PATCH triplet + DELETE)

| Route | Method | Auth | Body | Persists |
|---|---|---|---|---|
| `/api/profile/theme`     | PATCH  | cookie | `{theme: 'light'\|'dark'}` | `profiles.theme_preference` |
| `/api/profile/haptics`   | PATCH  | cookie | `{enabled: boolean}` | `profiles.haptics_enabled` |
| `/api/profile/currency`  | PATCH  | cookie | `{currency_code: string}` (validated against `ALL_CURRENCIES`) | `profiles.currency` |
| `/api/profile/delete`    | DELETE | cookie | (none) | cascade-deletes 17 user tables + profiles + auth.users |

All four currently use **cookie auth only**. To support iOS, they all need the Bearer fallback (`getAuthedUser` helper from `feat/bearer-auth-decisions`). This is a prerequisite for the Settings rebuild on iOS.

### Direct Supabase writes (no API route)

These mutations go directly to Supabase from the client (under user RLS):

- Income source create/update/delete (`income_sources` table)
- Category create/update/archive/restore (`categories` table)
- `profiles.{needs_percent, wants_percent, savings_percent, cycle_start_day}` update (in `onSaveProfile`)
- `profiles.monthly_income` write (in `syncMonthlyIncome` after every income source change)
- `dismissed_hints` delete (Reset onboarding hints handler)

Why direct vs API route: theme/haptics/currency/delete go through API routes either because they have validation logic (theme/haptics/currency check the payload shape) or because they need service-role privileges (delete cascades through 17 tables). The directly-Supabase'd writes are RLS-scoped and don't need server-side validation.

iOS implication: Swift SDK can do the direct writes natively; only theme / haptics / currency / delete need HTTP fetch calls.

---

## 18. Mutation Hooks

| Action | Streak | Momentum | Badge |
|---|---|---|---|
| Theme change | NO | NO | NO |
| Currency change | NO | NO | NO |
| Push toggle | NO | NO | NO |
| Haptics toggle | NO | NO | NO |
| Income source create/update/delete | NO | NO | NO |
| Card theme change | NO | NO | NO |
| Budget Month / Budget Split save | NO | NO | NO |
| Category create/update/archive/restore | NO | NO | NO |
| Reset onboarding hints | NO | NO | NO |
| Sign out | NO | NO | NO (auth-store reset() clears local state, doesn't write to streak/momentum/badge tables) |
| Delete account | (everything is wiped) |

**Configuration is not a user "action" that earns points.** Match this on iOS: no `awardMomentum` / `updateLoggingStreak` / `checkAndUnlockBadges` calls in any Settings handler.

---

## 19. Animations

| Animation | Trigger | Library |
|---|---|---|
| Theme toggle | `setTheme(...)` from `next-themes` | CSS class flip on `<html>` (instantaneous; CSS handles color transitions via Tailwind `transition-colors` on individual elements) |
| Section reveal on mount | none | n/a — sections render immediately |
| Toggle pills (haptics, push, active toggle in income source) | state change | inline `transition-transform` on the inner knob (translateX 2 → 22) |
| Save button pending state | `isSubmitting` | swap to `Loader2` Lucide with `animate-spin` |
| Modal open/close | `open` prop | shadcn `Dialog` (CSS `data-state` driven fade + scale) |
| Currency picker tile selection | `selected` change | CSS `transition-colors` (border + bg) |
| Frequency chip selection | `frequency` change | CSS `transition-colors` |
| Bucket chip selection | `bucket_id` change | CSS `transition-all` |
| Icon picker tile selection | `icon` change | CSS `transition-all` |
| Archived collapsible chevron | `showArchived` toggle | inline `transform: rotate(180deg)` + `transition-transform` |
| Category row hover icons | mouse hover | `opacity-0 group-hover:opacity-100 transition-opacity` (desktop only) |
| Card preview entrance | mount | none — `<CardSurface>` renders as a static element here (the dashboard surface uses framer-motion entrance, but the Settings preview doesn't) |

No row-level entrance/exit animations on income source list or category list. Items appear/disappear instantly on save/delete (with optional `animate-pulse` skeleton during the pending fetch).

---

## iOS Implementation Notes (Settings Tab)

### Models

```swift
extension Profile {
    var themePreference: SystemTheme { /* "light" | "dark" */ }
    var hapticsEnabled: Bool
    var currency: String                       // ISO code, e.g. "GHS"
    var cycleStartDay: Int                     // 1...28
    var needsPercent: Int                      // 0...100
    var wantsPercent: Int                      // 0...100
    var savingsPercent: Int                    // 0...100
    var monthlyIncome: Double                  // denormalized cache from income_sources sync
    var cardTheme: CycleCardTheme              // already on iOS from Phase 6
}

enum SystemTheme: String, Codable { case light, dark }

enum IncomeFrequency: String, Codable {
    case monthly, weekly, biweekly, irregular
}

struct IncomeSource: Identifiable, Codable, Equatable {
    let id: UUID
    let userId: UUID
    var name: String                           // ≤ 50 chars
    var amount: Double
    var frequency: IncomeFrequency
    var expectedDay: Int?                      // 1-31 monthly | 0-6 weekly/biweekly | nil irregular
    var notes: String?                         // ≤ 200 chars
    var isActive: Bool
    let createdAt: Date
    let updatedAt: Date
}

enum CategoryType: String, Codable { case expense, income, adjustment }

struct CategoryRow: Identifiable, Codable, Equatable {
    let id: UUID
    let userId: UUID?                          // nil for system seed defaults
    var bucketId: UUID?
    var name: String                           // ≤ 40 chars
    var icon: String?                          // key into ICON_OPTIONS catalog (NOT emoji literal)
    var isDefault: Bool
    var isArchived: Bool
    var categoryType: CategoryType
    let bucket: BudgetBucket?
}

struct BudgetSplit: Equatable {
    var needs: Int
    var wants: Int
    var savings: Int
    var sum: Int { needs + wants + savings }
    var isValid: Bool { sum == 100 }
}
```

Catalogs to ship as Swift constants:

- `ICON_OPTIONS` — 23 (key, emoji) pairs (Section 11). The DB stores the key string; the UI maps to emoji.
- `POPULAR_CURRENCIES` — 8 codes for empty-search ordering.
- `ALL_CURRENCIES` — 131 entries with code + name + symbol (best to ship as a JSON resource, not 131 Swift literals).
- `FREQUENCY_LABELS` / `FREQUENCY_COLORS` / `DAY_OF_WEEK` — small constants from Section 5.
- `INCOME_QUICK_TEMPLATES` — 4 entries (Section 5).

### Service additions

```swift
final class ProfileService {
    func fetch(userId: UUID) async throws -> Profile
    func updateBudgetSplit(userId: UUID, needs: Int, wants: Int, savings: Int, cycleStartDay: Int) async throws
    func updateTheme(theme: SystemTheme) async throws       // → PATCH /api/profile/theme
    func updateHaptics(enabled: Bool) async throws          // → PATCH /api/profile/haptics
    func updateCurrency(code: String) async throws          // → PATCH /api/profile/currency
    func deleteAccount() async throws                       // → DELETE /api/profile/delete
    func resetDismissedHints(userId: UUID) async throws     // direct Supabase delete
}

final class IncomeSourceService {
    func fetchAll(userId: UUID) async throws -> [IncomeSource]
    func create(userId: UUID, payload: IncomeSourcePayload) async throws -> IncomeSource
    func update(id: UUID, payload: IncomeSourcePayload) async throws -> IncomeSource
    func delete(id: UUID) async throws

    /// Side effect mirror of web's syncMonthlyIncome — call after every create/update/delete
    func syncMonthlyIncome(userId: UUID, sources: [IncomeSource]) async throws
}

final class CategoryService {
    func fetchAll(userId: UUID) async throws -> [CategoryRow]
    func create(userId: UUID, payload: CategoryPayload) async throws -> CategoryRow
    func update(id: UUID, payload: CategoryPayload) async throws -> CategoryRow
    func archive(id: UUID) async throws       // sets is_archived = true
    func restore(id: UUID) async throws       // sets is_archived = false

    func fetchBuckets(userId: UUID) async throws -> [BudgetBucket]   // for the modal
}

final class AuthService {
    func signOut() async throws
    func resetAnalytics()                      // PostHog identity clear
}

final class PushService {
    func currentAuthorizationStatus() async -> UNAuthorizationStatus
    func enable() async throws -> Bool         // request authorization + register for remote notifications + POST device token to server
    func disable() async throws                // DELETE device token from server
}
```

### API route prerequisite

`PATCH /api/profile/theme`, `/haptics`, `/currency`, and `DELETE /api/profile/delete` currently use **cookie auth only**. To support iOS, they need the Bearer fallback from `feat/bearer-auth-decisions`. **Add this to the prerequisites list before building Settings on iOS** — without it, theme/haptics/currency changes from iOS will 401, and account deletion will fail.

The fix is a 1-line refactor each (replace `await supabase.auth.getUser()` with `await getAuthedUser(request)`) plus one import. Bundle into a separate `feat/bearer-auth-profile` PR before the iOS Settings rebuild.

### AppState integration

```swift
final class AppState: ObservableObject {
    // Existing slices (profile/incomeSources/categories already present after earlier phases)

    // Settings tab additions
    @Published var systemTheme: SystemTheme = .dark         // mirrored from profile.themePreference
    @Published var hapticsEnabled: Bool = true              // mirrored from profile.hapticsEnabled
    @Published var currencyCode: String = "GHS"             // mirrored from profile.currency
    @Published var pushAuthorizationStatus: UNAuthorizationStatus = .notDetermined

    // Computed
    var totalMonthlyIncome: Double {
        incomeSources.filter(\.isActive)
            .map { calculateMonthlyEquivalent(amount: $0.amount, frequency: $0.frequency) }
            .reduce(0, +)
    }

    func calculateMonthlyEquivalent(amount: Double, frequency: IncomeFrequency) -> Double {
        switch frequency {
        case .monthly:   return amount
        case .weekly:    return amount * 4.333
        case .biweekly:  return amount * 2.167
        case .irregular: return amount
        }
    }
}
```

### Components

| Component | Responsibility |
|---|---|
| `SettingsView` | Top-level scrollable form. Owns the section ordering. |
| `AppearanceSectionView` | 2-tile Light/Dark picker. Calls `ProfileService.updateTheme` + flips `UIWindow` `overrideUserInterfaceStyle`. |
| `CurrencyTileView` | Single tile with current code + chevron. Pushes `CurrencyPickerView`. |
| `CurrencyPickerView` | Sub-route (`NavigationLink`). Search bar + scrollable list of 131 currencies + Save button. |
| `HapticsSectionView` | Pill toggle. Calls `ProfileService.updateHaptics`. Hidden if device doesn't support haptics (always true on iOS — no need to hide). |
| `NotificationSettingsView` | Pill toggle + permission denied state with "Open Settings" link. Calls `PushService`. |
| `IncomeSourcesSectionView` | List + Add button + total. Hosts the per-row chrome. |
| `IncomeSourceFormSheet` | Bottom sheet for add/edit. Fields per Section 5. |
| `CardThemePickerView` | **Already shipped in Phase 6** — reuse as-is. |
| `BudgetMonthSectionView` | Number stepper bound to `cycleStartDay`. |
| `BudgetSplitSectionView` | 3-input row + live GHS preview + "Must add up to 100" validation. |
| `SaveBudgetButton` | Disabled when invalid OR not dirty. |
| `CategoriesSectionView` | Header + Add button + grouped sub-sections. |
| `CategoryGroupView` | Color dot + uppercase header + rows. |
| `CategoryRowView` | Emoji + name + Pencil + Archive icons (always visible on iOS). |
| `ArchivedCategoriesDisclosure` | Collapsible disclosure with Restore links. |
| `CategoryFormSheet` | Bottom sheet for add/edit. Fields per Section 11. |
| `IconPickerView` | 8-column grid of 23 emojis bound to selected key. |
| `AppPreferencesSectionView` | "Reset onboarding hints" button + confirmation Alert. |
| `SignOutButton` | Outline button, red text, full-width. |
| `DangerZoneView` | Bordered destructive card + button + typed-confirmation Alert. |
| `PrivacyPolicyLink` | Bottom of page text link. Opens `SFSafariViewController` to `https://sika.app/privacy`. |

### Phase 6 reuse

`CardThemePicker` (heritage themes) is already shipped — reuse 1:1. The `CYCLE_CARD_THEMES` catalog and theme preview surface are unchanged.

Everything else in this audit is NEW iOS work.

### Phase splitting recommendation

**Split into 3 phases.** ~14 sections + 2 full CRUD entities + a destructive RPC is too much for one PR.

| Phase | Scope | Files | Risk |
|---|---|---|---|
| **S1: Read-only + simple toggles** | `AppearanceSection`, `CurrencyTile` + `CurrencyPickerView`, `HapticsSection`, `NotificationSettingsView`, `BudgetMonthSection`, `BudgetSplitSection` (read-only, no save), `SaveBudgetButton`, `SignOutButton`, `DangerZoneView`, `PrivacyPolicyLink`, `AppPreferencesSection`, plus the `SettingsView` shell + `gearshape.fill` Toolbar item | ~10-12 files | Low. Each section is independent. The destructive Delete account uses the existing server endpoint (assuming Bearer prereq lands first). |
| **S2: Income Sources CRUD** | `IncomeSourcesSectionView`, `IncomeSourceRowView`, `IncomeSourceFormSheet`, `IncomeSourceService` (full CRUD + `syncMonthlyIncome` side effect), 4 quick-add templates | ~5-6 files | Medium. The `syncMonthlyIncome` side effect is the part most likely to be overlooked. Adds the IncomeSources hint card. |
| **S3: Categories CRUD** | `CategoriesSectionView`, `CategoryGroupView`, `CategoryRowView`, `ArchivedCategoriesDisclosure`, `CategoryFormSheet`, `IconPickerView`, `CategoryService` (CRUD + archive/restore), `BudgetBucket` fetch for the modal | ~7-8 files | Medium. The 4-group layout (NEEDS / WANTS / SAVINGS / no-bucket / INCOME / Adjustments / Archived) and the type → bucket coupling logic (clear bucket when type changes) are the parts most likely to drift. |

**Justification**: Splitting on the natural seam between "read-only + simple toggles" / "first CRUD entity" / "second CRUD entity" gives three reviewable PRs of roughly equal size. Each is independently shippable: S1 ships a usable Settings page even without S2/S3 (income sources / categories visible but not editable from Settings — they remain editable via the Transactions sheet's category picker etc.). S2 adds income source CRUD. S3 adds category CRUD.

If schedule pressure mandates fewer PRs: **S1 + (S2 + S3 merged)** is the next-best split. Don't merge S1 with S2 — the destructive Delete account UX needs its own PR-level review.

### Out of scope

- **A 6th tab for Settings** — web doesn't have it; entry is the gear icon in `TopBar`.
- **System theme / Auto** — web has Light + Dark only.
- **Currency exchange rate conversion** — web does NOT convert amounts; only the symbol changes.
- **Income source quick-add template prefill** — web's templates currently DON'T prefill the form (`void template;` in the handler). iOS could fix this; flag it as a small product decision.
- **Confirmation on income source delete** — web has none. iOS should ADD an Alert; don't preserve the no-confirm behavior.
- **Confirmation on Reset onboarding hints** — web has none. iOS should ADD an Alert.
- **Category emoji picker** — limited to 23 hardcoded emojis. Don't expand to full system emoji keyboard; the icon-key string in DB ties to the constant.
- **Hard delete for categories** — web only soft-deletes (archive). Don't expose hard delete.
- **Hard delete for income sources is preserved** — no archive. Match web.
- **Real-time subscriptions on push_subscriptions** — web doesn't sync push state across devices. Same for iOS.
- **Native rendering of privacy policy** — `SFSafariViewController` is fine; web hosts the canonical version.
- **Bucket creation/editing UI** — web reads `budget_buckets` rows but doesn't expose a "create new bucket" affordance in Settings. Buckets are seed-only via DB. Match this.
- **Account-level CRUD (financial accounts)** — `/accounts` is a separate tab on web, not part of Settings. Out of scope here.
- **Goals CRUD** — `/goals` is a separate tab. Out of scope.
- **Per-category budget cap** — web doesn't have it (only per-bucket via Budget Split percentages). Don't introduce.
- **Family sharing / multi-profile per account** — does not exist on web.
