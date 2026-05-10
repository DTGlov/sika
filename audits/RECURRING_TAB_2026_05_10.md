# Recurring Tab Audit — 2026-05-10

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Recurring tab UI rebuild — Phase 7 already shipped the engine; this audit covers the dedicated `/recurring` page surface.

Source of truth: web repo (`feat/bearer-auth-decisions` branch, working tree clean for src).

## TL;DR for the iOS prompt author

- **Recurring tab is expense-only by design.** New rows always default to `type='expense'` and the modal locks the type field. Income recurrings are LEGACY — they remain editable but the canonical place for income is `Settings → Income` (the `income_sources` table). iOS should NOT add an income tab; if a legacy income row exists, surface it in Paused or with the gold accent (income legacy uses `#00D9A3` green dot, expense uses `#F43F5E` red).
- **The page has TWO tabs only**: `Recurring` (active expense + not paused) and `Paused`. Persistence via URL `?tab=paused`. Tab counts shown as colored chips next to the label.
- **There IS a per-recurring detail route** (`/recurring/[id]`) — unlike Transactions which has none. The detail page is NOT a generic edit page; it's a "this period" status surface with **Log this instance now** / **Skip this period** affordances for the current cycle. The edit form lives in a modal opened from the row's pencil icon, not from the detail route.
- **`schedule_day` is a single integer column reused across frequencies**: weekly/biweekly (0-6, Sun=0), monthly (1-28 OR `-1` for last day), daily/yearly (null/unused). iOS' `RecurringTransaction` model needs this exact semantic — don't split into `dayOfWeek` + `dayOfMonth`.
- **Delete uses native `window.confirm()`** (NOT a styled dialog) and is a **soft delete** — sets `is_active=false`. Already-generated transactions are kept (`generated_from_recurring` FK presumably preserves the link or sets null).
- **Quick templates are a 5-entry hardcoded constant** (not 3 as the screenshot implied — the row scrolls). Full list captured below in Section 9.

---

## 1. Page Route + Layout

File: `src/app/(app)/recurring/page.tsx` (465 lines).
Route: `/recurring`.

Sub-route exists: `src/app/(app)/recurring/[id]/page.tsx` (249 lines) — the **per-recurring "this period" detail page**, reached by tapping the left side of a row card. Not an edit page; the edit modal opens from the pencil icon and is `RecurringModal` mounted on the list page itself.

### Top-level layout

```tsx
<div className="max-w-2xl mx-auto pb-8 px-4 pt-6 md:px-8">
  <div className="flex items-center justify-between mb-4">
    <h1 className="text-2xl font-bold text-foreground">Recurring</h1>
    <div className="flex items-center gap-2">
      <button onClick={handleSync} disabled={syncing} className="...sync icon button..." title="Sync now">
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
      </button>
      <Button onClick={() => { ...openModal... }} className="...gold pill...">
        <Plus className="w-4 h-4" /> Add
      </Button>
    </div>
  </div>

  {/* HintCard — recurring_intro, banner variant */}
  <HintCard hintId="recurring_intro" title="..." body="..." icon={RefreshCw} variant="banner" className="mb-4" />

  {/* Tabs strip — Recurring / Paused with count chips */}
  <div className="flex gap-1 mb-5 bg-muted border border-border rounded-xl p-1 overflow-x-auto scrollbar-none">
    {TABS.map(...)}
  </div>

  {/* Body: skeleton / EmptyState / list */}

  {/* Quick expense templates strip */}
  {!loading && (
    <div className="mt-8">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-3">Quick expense templates</p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TEMPLATES.map(...)}
      </div>
      <p className="text-xs text-muted-foreground/70 mt-3">
        For income, manage your sources in <Link href="/settings">Settings → Income</Link>.
      </p>
    </div>
  )}

  <RecurringModal open={modalOpen} ... />
</div>
```

The `Suspense` wrapper handles `useSearchParams` SSR-safety (`page.tsx:451-465`), with a skeleton fallback (h-8 title + h-11 strip + 3 × h-28 cards).

---

## 2. List View

### Layout

Plain mapped list of `RecurringCard` components — NOT virtualized. No day-grouping (each card is its own self-contained block with its own due-date strip). Rendered with a `space-y-3` (12px) gap between cards.

```tsx
<div className="space-y-3">
  {visibleItems.map(item => (
    <RecurringCard
      key={item.id}
      item={item}
      accentColor={item.type === 'income' ? '#00D9A3' : '#F43F5E'}
      today={today}
      onOpen={(id) => router.push(`/recurring/${id}`)}
      onTogglePause={handleTogglePause}
      onEdit={(i) => { setEditItem(i); setModalOpen(true); }}
      onDelete={handleDelete}
    />
  ))}
</div>
```

### Tab segmentation

```ts
type TabValue = 'expense' | 'paused';

const expenseItems = useMemo(
  () => items
    .filter(i => i.type === 'expense' && !i.is_paused)
    .sort((a, b) => getNextDueTimestamp(a, today) - getNextDueTimestamp(b, today)),
  [items]
);

const pausedItems = useMemo(
  () => items
    .filter(i => i.is_paused)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  [items]
);

const TABS: { value: TabValue; label: string; count: number }[] = [
  { value: 'expense', label: 'Recurring', count: expenseItems.length },
  { value: 'paused',  label: 'Paused',    count: pausedItems.length  },
];
```

**Important segmentation rules:**
- "Recurring" tab = `type === 'expense' AND !is_paused`. **Income recurrings are excluded.** They're legacy and never get their own tab.
- "Paused" tab = `is_paused === true` (any type, including legacy income).
- The query filters `is_active = true` only, so soft-deleted items are excluded from BOTH tabs (and therefore from BOTH counts).

### Tab styling (with count chip)

```tsx
<button onClick={() => setTab(value)}
  className="flex-1 h-9 rounded-lg text-xs font-medium transition-colors min-w-[80px] whitespace-nowrap"
  style={{
    backgroundColor: tab === value ? 'var(--card)' : 'transparent',
    color: tab === value ? 'var(--foreground)' : 'var(--muted-foreground)',
  }}>
  {label}
  {count > 0 && (
    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
      style={{
        backgroundColor: tab === value ? accentColor + '22' : 'var(--border)',
        color: tab === value ? accentColor : 'var(--muted-foreground)',
      }}>
      {count}
    </span>
  )}
</button>
```

`accentColor` is computed from the active tab: `tab === 'expense' ? '#F43F5E' : '#FBBF24'` — red on Recurring, amber on Paused. Inactive tabs render the count chip with muted bg + muted fg.

### Sort order

- **Recurring tab**: sorted by `getNextDueTimestamp(item, today)` ascending. Items with no future occurrence (`Infinity`) sink to the bottom. `getNextDueTimestamp` calls `getNextDueDate(item, today)?.getTime() ?? Infinity`.
- **Paused tab**: sorted by `updated_at` descending (most recently paused first).

### Day-grouping

**There is no day-grouping** like the Transactions tab has. Each card carries its own per-card "Next due: TODAY" header strip. The list is a flat sort by next due timestamp.

### Empty states

```tsx
function EmptyState({ tab, onAdd }: { tab: TabValue; onAdd: () => void }) {
  if (tab === 'paused') {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nothing paused right now.</div>;
  }

  return (
    <div className="text-center py-16 px-4">
      <p className="text-muted-foreground text-sm mb-4">
        No recurring expenses yet. Add things like rent, subscriptions, or bills.
      </p>
      <Button onClick={onAdd} className="h-9 px-4 text-sm bg-[#D4A017] ... rounded-xl">
        <Plus className="w-4 h-4 mr-1.5" /> Add expense
      </Button>
    </div>
  );
}
```

Recurring empty: muted message + gold "Add expense" CTA. Paused empty: muted message only, no CTA.

### Loading state

3 skeleton cards (`h-28 rounded-2xl bg-muted`).

### No pagination

The list is `is_active = true` for the current user — no `range()`, no "Load more". Realistic since users typically have <50 recurrings; the engine's `safety: max 365 occurrences per sync` is the only volume guard.

---

## 3. Row Component (`RecurringCard`)

Verbatim source (`page.tsx:99-181`):

```tsx
function RecurringCard({ item, accentColor, today, onOpen, onTogglePause, onEdit, onDelete }: RecurringCardProps) {
  const { format } = useCurrency();
  const dueInfo = getDueDateInfo(item, today);
  const name = item.note ?? item.category?.name ?? FREQUENCY_LABELS[item.frequency];
  const handled = !item.auto_log && isHandledThisInstance(item, today);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Due date header */}
      <div className="px-4 pt-3 pb-2.5 flex items-center justify-between">
        <p className="text-xs font-semibold"
          style={{ color: dueInfo.color, fontWeight: dueInfo.bold ? 700 : 500 }}>
          {item.is_paused ? 'Paused' : `Next due: ${dueInfo.label}`}
        </p>
        <div className="flex items-center gap-1">
          {handled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#00D9A318] text-[#00D9A3] font-medium flex items-center gap-1">
              <Check className="w-2.5 h-2.5" /> Handled
            </span>
          )}
          {!item.auto_log && !handled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
              Nudge
            </span>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Name + amount + actions */}
      <div className="px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => onOpen(item.id)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg">
          <div className="w-2 h-2 rounded-full shrink-0 self-center"
            style={{ backgroundColor: accentColor }} />
          <div className="min-w-0 flex-1">
            <p className="text-foreground font-bold text-base truncate">{name}</p>
            <p className="text-muted-foreground/70 text-xs mt-0.5 truncate">
              {item.account?.name}
              {item.category ? ` · ${item.category.name}` : ''}
              {' · '}{formatScheduleSummary(item)}
            </p>
          </div>
        </button>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <p className="text-lg font-bold tabular-nums" style={{ color: accentColor }}>
            {format(item.amount)}
          </p>
          <div className="flex items-center gap-0.5">
            <button onClick={() => onTogglePause(item)}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              title={item.is_paused ? 'Resume' : 'Pause'}>
              {item.is_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => onEdit(item)}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(item.id)}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-[#F43F5E] flex items-center justify-center transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Visual structure

A 2-section card divided by a hairline:

1. **Top strip** (`px-4 pt-3 pb-2.5`): due-date label on the left, status pill on the right.
   - Due-date label color-coded per `getDueDateInfo` (see below).
   - Status pill: `Handled` (green, with check icon) when not auto-log + currently within an already-logged period; `Nudge` (muted) when not auto-log + pending; nothing for auto-log items.
   - When paused: the entire left label is just the literal word `Paused`.
2. **Body** (`px-4 py-3 flex items-center gap-3`): tappable left half (dot + name + meta), right column (amount + 3 inline buttons).

### Due-date info helper

`getDueDateInfo` (`page.tsx:55-82`):

```ts
function getDueDateInfo(item: RecurringTransaction, today: Date): DueDateInfo {
  const todayStart = startOfDay(today);

  // Overdue check — only for non-auto-log
  if (!item.auto_log) {
    const overdueFrom = item.last_generated_date
      ? addDays(parseDateStr(item.last_generated_date), 1)
      : parseDateStr(item.start_date);
    const firstMissed = getNextDueDate({ ...item, last_generated_date: null }, overdueFrom);
    if (firstMissed && isBefore(startOfDay(firstMissed), todayStart)) {
      return { label: `OVERDUE since ${format(firstMissed, 'MMM d')}`, color: '#F43F5E', bold: true };
    }
  }

  const nextDue = getNextDueDate(item, today);
  if (!nextDue) return { label: 'No future occurrences', color: 'var(--muted-foreground)', bold: false };

  const diffDays = differenceInCalendarDays(startOfDay(nextDue), todayStart);

  if (diffDays === 0)  return { label: 'TODAY',                                          color: '#00D9A3', bold: true };
  if (diffDays === 1)  return { label: 'Tomorrow',                                       color: 'var(--foreground)', bold: false };
  if (diffDays <= 7)   return { label: `in ${diffDays} days (${format(nextDue, 'EEE MMM d')})`, color: 'var(--foreground)', bold: false };
  if (diffDays <= 30)  return { label: format(nextDue, 'EEE MMM d'),                     color: 'var(--muted-foreground)', bold: false };
  return                       { label: format(nextDue, 'MMM d, yyyy'),                  color: 'var(--muted-foreground)', bold: false };
}
```

| Diff | Label | Color | Bold |
|---|---|---|---|
| OVERDUE (non-auto-log only) | `OVERDUE since {Mon d}` | `#F43F5E` red | yes |
| 0 (today) | `TODAY` | `#00D9A3` green | yes |
| 1 | `Tomorrow` | foreground | no |
| 2-7 | `in N days (Mon Mon d)` | foreground | no |
| 8-30 | `Mon Mon d` | muted | no |
| > 30 | `Mon d, yyyy` | muted | no |
| no future | `No future occurrences` | muted | no |

### Name resolution

```ts
const name = item.note ?? item.category?.name ?? FREQUENCY_LABELS[item.frequency];
```

Fallback chain: `note → category.name → frequency label ('Daily' / 'Weekly' / etc.)`. Null-tolerant because nothing is required at the schema level except amount + account + frequency + start_date.

### Meta line

```tsx
<p className="text-muted-foreground/70 text-xs mt-0.5 truncate">
  {item.account?.name}
  {item.category ? ` · ${item.category.name}` : ''}
  {' · '}{formatScheduleSummary(item)}
</p>
```

Composition: `{account.name}{ · category.name?}{ · scheduleSummary}`. Account name has no fallback — if `account` is null (shouldn't happen since `account_id` is required by zod), the field renders empty. Category is conditional. Schedule summary always renders.

`formatScheduleSummary` produces strings like `Every day`, `Every Monday`, `Every other Tuesday`, `15th of each month`, `Last day of month`, `Yearly from Jan 15`.

### Accent / dot / amount color

The accent color is computed per-row in the parent:

```ts
accentColor={item.type === 'income' ? '#00D9A3' : '#F43F5E'}
```

- The 2px dot (`w-2 h-2 rounded-full`) uses `accentColor`.
- The amount (`text-lg font-bold tabular-nums`) uses `accentColor`.

So expense → red dot + red amount; income (legacy) → green dot + green amount.

### 3 inline action buttons

| Action | Icon | Lucide name | Hover | Stop propagation |
|---|---|---|---|---|
| Pause | `Pause` | `Pause` | hover:text-foreground | (button is outside the open-card button) |
| Resume (when `is_paused`) | `Play` | `Play` | hover:text-foreground | same |
| Edit | `Pencil` | `Pencil` | hover:text-foreground | same |
| Delete | `Trash2` | `Trash2` | **hover:text-[#F43F5E] (red)** | same |

All buttons are 8×8 (`w-8 h-8`) rounded squares with a 14px (`w-3.5 h-3.5`) icon. The button row is tight (`gap-0.5`).

The pause/resume button uses a `title` attribute (`"Pause"` / `"Resume"`) for accessibility — no aria-label.

### Tap targets

| Region | Target |
|---|---|
| Left half (dot + name + meta block) | `<button onClick={() => onOpen(item.id)}>` → `router.push(/recurring/${item.id})` (detail page) |
| Pause/Play icon | `onTogglePause(item)` |
| Pencil icon | `onEdit(item)` → opens `RecurringModal` with editItem |
| Trash2 icon | `onDelete(item.id)` → window.confirm + soft delete |
| Amount text | NOT interactive (no button wrapping) |
| Top strip (due-date label + Handled/Nudge pill) | NOT interactive |

The whole card is **not** a single tap target — only the left half. iOS should mirror this: the `Pause/Edit/Delete` buttons must be hit-test islands, and the rest of the row navigates to detail.

---

## 4. Add/Edit Modal

File: `src/components/recurring/recurring-modal.tsx` (504 lines).

### Sheet shell

It is **NOT** a bottom sheet. It's a centered shadcn `Dialog`:

```tsx
<Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
  <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle className="text-foreground">
        {editItem ? 'Edit recurring' : 'New recurring transaction'}
      </DialogTitle>
    </DialogHeader>
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">{...}</form>
  </DialogContent>
</Dialog>
```

`max-w-sm` (24rem) on desktop, `max-h-[90vh]` with internal scroll. No drag handle. No `side="bottom"`. iOS should adapt this to a bottom sheet (idiomatic), but the field structure stays identical.

### Title

- Add: `New recurring transaction`
- Edit: `Edit recurring`

### Form library

`react-hook-form` + `zod` resolver. Schema (verbatim):

```ts
const schema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive('Must be > 0'),
  account_id: z.string().min(1, 'Required'),
  category_id: z.string().nullable(),
  note: z.string().nullable(),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']),
  schedule_day: z.number().nullable(),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().nullable(),
  auto_log: z.boolean(),
  is_paused: z.boolean(),
});
```

### Defaults (new)

```ts
{
  type: 'expense',                                              // ALWAYS expense for new rows
  amount: undefined,                                            // user must enter
  account_id: defaultValues?.account_id ?? defaultAccount?.id ?? '',
  category_id: defaultValues?.category_id ?? null,
  note: defaultValues?.note ?? null,
  frequency: defaultValues?.frequency ?? 'monthly',             // monthly is the default
  schedule_day: defaultValues?.schedule_day ?? null,
  start_date: format(new Date(), 'yyyy-MM-dd'),                 // today
  end_date: null,                                               // collapsed by default
  auto_log: defaultValues?.auto_log ?? true,                    // ON by default for new
  is_paused: false,
}
```

`defaultValues` are passed in by the page — currently used by the Quick Templates flow (Section 9).

### Field order (top → bottom)

1. **Type pill** — only rendered when editing a legacy income row (locked, with link to Settings → Income). Hidden in all other cases.
2. **Amount** — `<Input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00">`. Standard system numeric keypad, NOT the custom `AmountKeypad` from TransactionSheet.
3. **Account** — shadcn `Select` dropdown. Each option renders `{ACCOUNT_TYPE_CONFIG[a.type].emoji} {a.name}`.
4. **Category (optional)** — shadcn `Select`. First item is `"No category"` (value `'none'` mapped to null on save). Filtered by transaction type via `categories.filter(c => (c.category_type ?? (c.bucket_id ? 'expense' : 'income')) === txType)`.
5. **Note (optional)** — placeholder `"e.g. Monthly rent"`.
6. **Frequency** — 5 chips in a 3-column grid (`grid-cols-3 gap-1.5`). Active style: green `#00D9A3` border + 10% bg + green fg. Selecting a new frequency resets `schedule_day` to null.
7. **Day of week** — only when `frequency === 'weekly'` or `'biweekly'`. 7-button row (Sun→Sat), one-letter labels.
8. **Day of month** — only when `frequency === 'monthly'`. Number input (1-28, clamped) + a `Last day` toggle that sets `schedule_day = -1`.
9. **Start date** — `<Input type="date">`. Defaults to today.
10. **End date** — collapsed by default with `+ Add end date (optional)` dashed-border button. When set, exposes a `<Input type="date">` and a `Remove` link.
11. **Auto-log** — pill toggle on the right with helper copy on the left.
12. **Paused** — pill toggle, **only rendered on edit** (`{editItem && ...}`).
13. **Submit button** — `Create` (add) / `Save changes` (edit), full-width gold pill.

### Field details

#### Frequency chips (verbatim)

```ts
const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: 'daily',    label: 'Daily' },
  { value: 'weekly',   label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly',  label: 'Monthly' },
  { value: 'yearly',   label: 'Yearly' },
];
```

Active styling:
```tsx
style={{
  borderColor:     frequency === value ? '#00D9A3' : 'var(--border)',
  backgroundColor: frequency === value ? '#00D9A318' : 'var(--input)',
  color:           frequency === value ? '#00D9A3' : 'var(--muted-foreground)',
}}
```

#### Day-of-week picker (weekly / biweekly)

```tsx
<div className="grid grid-cols-7 gap-1">
  {DAY_OF_WEEK_LABELS.map((day, i) => (
    <button onClick={() => setValue('schedule_day', i)}
      style={{
        backgroundColor: scheduleDay === i ? '#00D9A3' : 'var(--input)',
        color:           scheduleDay === i ? '#0E1A2E' : 'var(--muted-foreground)',
      }}>
      {day[0]}  {/* "S" / "M" / "T" / "W" / "T" / "F" / "S" */}
    </button>
  ))}
</div>
```

`DAY_OF_WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']` (Sunday = index 0).

#### Day-of-month picker (monthly)

```tsx
<div className="flex gap-2 items-center">
  <Input type="number" min="1" max="28" placeholder="1–28" className="w-24"
    value={scheduleDay != null && scheduleDay !== -1 ? scheduleDay : ''}
    onChange={e => {
      const v = parseInt(e.target.value);
      setValue('schedule_day', isNaN(v) ? null : Math.min(Math.max(v, 1), 28));
    }} />
  <button onClick={() => setValue('schedule_day', scheduleDay === -1 ? null : -1)}
    style={{
      borderColor:     scheduleDay === -1 ? '#00D9A3' : 'var(--border)',
      backgroundColor: scheduleDay === -1 ? '#00D9A318' : 'var(--input)',
      color:           scheduleDay === -1 ? '#00D9A3' : 'var(--muted-foreground)',
    }}>
    Last day
  </button>
</div>
```

**Day cap is 28**, not 31. The "Last day" toggle (`schedule_day = -1`) is the explicit way to express end-of-month. This avoids the Feb-31 problem at the form layer.

#### End date

Default state: a dashed-border button reading `+ Add end date (optional)`.
On tap: replaces with `<Input type="date">` defaulted to today + a `Remove` link.

#### Auto-log toggle

Pill switch (24×44px, white knob), green when ON. Helper text:

```ts
const autoLogHelperText = txType === 'income'
  ? 'Income arrival can be unpredictable. Recommended: keep this off and confirm via the reminder card when money arrives.'
  : 'Auto-log for fixed obligations (rent, subscriptions). Turn off if amount varies — Sika will nudge you to confirm instead.';
```

#### Income auto-log warning

A nested `Dialog` fires when the user toggles auto-log ON for income (only relevant when editing a legacy income row):

```tsx
<Dialog open={showIncomeWarning} onOpenChange={setShowIncomeWarning}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Auto-log income?</DialogTitle>
      <DialogDescription>
        Income often arrives late or skips a cycle. Auto-logging means Sika will count this money before it actually lands — your balance may show more than what's really in your accounts.
      </DialogDescription>
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">Recommended:</strong> Keep auto-log off for income, and tap the reminder card to confirm when the money arrives.
      </p>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowIncomeWarning(false)}>Keep it manual</Button>
      <Button onClick={confirmIncomeAutoLog} className="bg-[#D4A017] ...">Auto-log anyway</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

iOS doesn't need this dialog initially — new rows are expense-only. Only required if iOS surfaces the legacy income recurrings for editing.

### Submit logic

```ts
async function onSubmit(values: FormValues) {
  if (!user) return;

  const payload = {
    user_id: user.id,
    type: values.type,
    amount: values.amount,
    account_id: values.account_id,
    category_id: values.category_id || null,
    note: values.note || null,
    frequency: values.frequency,
    schedule_day: values.schedule_day,
    start_date: values.start_date,
    end_date: values.end_date || null,
    auto_log: values.auto_log,
    is_paused: values.is_paused,
  };

  if (editItem) {
    const { error } = await supabase.from('recurring_transactions').update(payload).eq('id', editItem.id);
    if (error) { toast.error('Failed to save'); return; }
    toast.success('Updated');
  } else {
    const { error } = await supabase.from('recurring_transactions').insert({ ...payload, is_active: true });
    if (error) { toast.error('Failed to create'); return; }
    toast.success('Recurring transaction created');
  }

  revalidateForEntity('transaction');
  onSaved();
  onClose();
}
```

Validation gate (computed before form-level validation):

```ts
const fixedFrequency = frequency === 'monthly' || frequency === 'weekly' || frequency === 'biweekly';
const scheduleDayValid = !fixedFrequency || (scheduleDay != null && !Number.isNaN(scheduleDay));
const canSubmitRecurring =
  typeof amountValue === 'number' &&
  !Number.isNaN(amountValue) &&
  amountValue > 0 &&
  !!accountIdValue &&
  scheduleDayValid;
const disableRecurringSubmit = isSubmitting || !canSubmitRecurring;
```

So the user cannot submit until: amount > 0, account selected, AND if frequency is weekly/biweekly/monthly, a schedule_day has been chosen. Daily and yearly are exempt (yearly derives schedule from `start_date`).

No optimistic UI — the modal stays open until the round-trip completes, then closes. Toast: `Recurring transaction created` (add) / `Updated` (edit).

---

## 5. Pause / Resume Actions

### Schema

`is_paused` boolean column on `recurring_transactions`. (Not `paused_at` timestamp, not a status enum.)

### Engine behavior

`getDueRecurring` (`lib/recurring.ts:112-122`) filters explicitly:

```ts
const { data } = await supabase
  .from('recurring_transactions')
  .select(...)
  .eq('user_id', userId)
  .eq('is_active', true)
  .eq('is_paused', false);
```

So a paused recurring is invisible to the next sync — it produces no transactions, no nudges, no due-dates calculated by `generateDueTransactions`.

### UI handler

```ts
async function handleTogglePause(item: RecurringTransaction) {
  setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_paused: !i.is_paused } : i));
  const { error } = await supabase
    .from('recurring_transactions')
    .update({ is_paused: !item.is_paused })
    .eq('id', item.id);
  if (error) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_paused: item.is_paused } : i));
    toast.error('Failed to update');
    return;
  }
  toast.success(item.is_paused ? 'Resumed' : 'Paused');
}
```

**Optimistic update**: flip `is_paused` in local state immediately, write to DB, revert on error. No confirmation dialog. Toast: `Paused` or `Resumed`.

After the toggle, the row jumps tabs — paused items move to the Paused tab (and the count chip on the destination tab ticks up). The local list still includes them; the tab filter does the work.

---

## 6. Delete Flow

### Confirmation

Native `window.confirm`, NOT a styled `Dialog`:

```ts
async function handleDelete(id: string) {
  if (!confirm('Delete this recurring transaction? Already-generated transactions are kept.')) return;
  setItems(prev => prev.filter(i => i.id !== id));
  const { error } = await supabase
    .from('recurring_transactions')
    .update({ is_active: false })
    .eq('id', id);
  if (error) {
    toast.error('Failed to delete');
    revalidateForEntity('transaction');
  } else {
    toast.success('Deleted');
  }
}
```

This is the lone use of native `confirm()` I've seen across the audited Recurring/Transactions/HealthRow surfaces. iOS should use a proper `Alert` (idiomatic).

### Soft delete

```sql
UPDATE recurring_transactions SET is_active = false WHERE id = X;
```

The row remains in the DB indefinitely. No `deleted_at` column. The list query filters `is_active = true`, so soft-deleted rows are invisible in the UI.

### Already-generated transactions

The confirm copy explicitly says **"Already-generated transactions are kept."** The web schema's FK from `transactions.generated_from_recurring` → `recurring_transactions.id` is presumably `ON DELETE SET NULL` (or no cascade) — but since this is a soft delete (UPDATE not DELETE), the FK doesn't fire either way. The `transactions` rows continue pointing to the inactive recurring row.

Implication for iOS: matches web. iOS `RecurringService.delete(id)` should set `is_active = false` (NOT call `.delete()`). Already-generated transactions stay in the user's history.

### Undo

**No undo.** Once confirmed, the row is gone from the UI. To recover, the user would need DB access — there's no "trash" or "restore" view.

### No mutation hooks

Delete does NOT trigger streak/momentum/badge updates. Same as pause/resume.

---

## 7. Manual Sync Action

```ts
async function handleSync() {
  if (!user) return;
  setSyncing(true);
  await generateDueTransactions(supabase, user.id);
  revalidateForEntity('transaction');
  setSyncing(false);
  toast.success('Recurring transactions synced');
}
```

### Engine call

`generateDueTransactions` from `lib/recurring.ts:161-198`. Calls `getDueRecurring` (which respects `is_active=true AND is_paused=false`), then for each due recurring:

- If `auto_log === true`: inserts one `transaction` row per missed occurrence (capped at 365 occurrences per sync as a safety), then `UPDATE recurring_transactions SET last_generated_date = lastDate`.
- If `auto_log === false`: appended to a `pending` array, no DB writes. (The pending array is consumed by the Home page's `PendingRecurringCard` banner — not by this tab.)

### Loading state

The sync icon spins while `syncing`:

```tsx
<RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
```

Tailwind's `animate-spin` (1s linear infinite). Button is `disabled={syncing}` to prevent double-fire.

### Toast

`Recurring transactions synced` (success). No error path is wired — `generateDueTransactions` doesn't return an error code, and `handleSync` doesn't `try/catch`.

### Idempotency

The engine is idempotent across runs because `last_generated_date` is the source of truth: once it's been bumped to today, the next call returns no due dates for that recurring.

---

## 8. Intro HintCard

```tsx
<HintCard
  hintId="recurring_intro"
  title="Automate your money rhythm"
  body="Recurring expenses auto-log on a schedule — set up subscriptions, rent, and bills once and Sika handles the rest. Use the toggle for variable amounts (utilities, gym, side gigs)."
  icon={RefreshCw}
  variant="banner"
  className="mb-4"
/>
```

`hintId` lives in the `HintId` type union (`src/lib/hints.ts:3-16`, observed in earlier audits): `'recurring_intro'` is the literal key.

**Dismissal**: One-time. Stored in `dismissed_hints` table by user_id + hint_id. Once dismissed, never re-shown for that user. (Pattern verified in HealthRow audit's Hint section — same `dismissHint` / `fetchDismissedHints` helpers.)

**Variant `banner`**: Full-width banner-style, distinct from the `inline` variant used inside flow steps (e.g. `transaction_sheet_reconcile`).

**Icon**: `RefreshCw` Lucide — same icon used for the sync button + tab bar Recurring tab.

---

## 9. Quick Expense Templates

### FULL list (5 entries — not 3 as the screenshot's visible window suggested)

The strip is `flex gap-2 overflow-x-auto pb-1 scrollbar-none` — horizontally scrollable. Source constant (`page.tsx:32-42`):

```ts
const TEMPLATES: Array<{
  label: string;
  emoji: string;
  defaults: { type: 'expense'; frequency: RecurringFrequency; schedule_day?: number; auto_log: boolean; note: string };
}> = [
  { label: 'Monthly rent',    emoji: '🏠',  defaults: { type: 'expense', frequency: 'monthly', auto_log: true,  note: 'Monthly rent' } },
  { label: 'Subscription',    emoji: '📱',  defaults: { type: 'expense', frequency: 'monthly', auto_log: true,  note: 'Subscription' } },
  { label: 'Utility bill',    emoji: '⚡',  defaults: { type: 'expense', frequency: 'monthly', auto_log: false, note: 'Utility bill' } },
  { label: 'Gym membership',  emoji: '🏋️', defaults: { type: 'expense', frequency: 'monthly', auto_log: true,  note: 'Gym membership' } },
  { label: 'Internet',        emoji: '📶',  defaults: { type: 'expense', frequency: 'monthly', auto_log: true,  note: 'Internet' } },
];
```

### Per-template details

| # | Label | Emoji | Frequency | Auto-log | Note pre-fill |
|---|---|---|---|---|---|
| 1 | Monthly rent    | 🏠  | monthly | **true**  | `Monthly rent` |
| 2 | Subscription    | 📱  | monthly | **true**  | `Subscription` |
| 3 | Utility bill    | ⚡  | monthly | **false** | `Utility bill` (variable amount → nudge) |
| 4 | Gym membership  | 🏋️ | monthly | **true**  | `Gym membership` |
| 5 | Internet        | 📶  | monthly | **true**  | `Internet` |

All 5 templates default to `frequency: 'monthly'`. Only Utility bill has `auto_log: false` — the only template that becomes a nudge rather than auto-logging. None of the templates pre-fill `schedule_day` (the user picks day-of-month manually).

### Render

```tsx
<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
  {TEMPLATES.map(tmpl => (
    <button key={tmpl.label} onClick={() => openTemplate(tmpl)}
      className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2 shrink-0 hover:border-border transition-colors">
      <span className="text-base">{tmpl.emoji}</span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">{tmpl.label}</span>
    </button>
  ))}
</div>
```

Each chip is a horizontal pill: emoji + label. `shrink-0` so they don't squash when the row scrolls.

### Tap handler

```ts
function openTemplate(tmpl: typeof TEMPLATES[0]) {
  setEditItem(undefined);
  setDefaultModalValues(tmpl.defaults);
  setModalOpen(true);
}
```

Opens the modal in **add** mode (`editItem=undefined`) with `defaultModalValues = tmpl.defaults`. The modal's `defaultValues` prop pre-fills the relevant fields (frequency, auto_log, note) — the user still has to enter amount, pick account, optionally pick category, optionally adjust day-of-month, and submit.

### Source-of-truth

**Hardcoded TS constant** — NOT DB-driven. Adding a template means a code change. iOS should ship the same 5 templates as a Swift `let TEMPLATES: [QuickTemplate]` (or whatever the convention is).

### Footer note

Below the templates strip:

```tsx
<p className="text-xs text-muted-foreground/70 mt-3">
  For income, manage your sources in <Link href="/settings" className="text-accent underline-offset-2 hover:underline">
    Settings → Income
  </Link>
  .
</p>
```

This is the ONLY UI hint to the user that recurring is expense-only. iOS should reproduce this as a `Text` link to its settings/income screen.

---

## 10. Next-Due Calculation

`getNextDueDate` (`lib/recurring.ts:36-106`) is the canonical computer. Verbatim:

```ts
export function getNextDueDate(
  recurring: Pick<RecurringTransaction, 'frequency' | 'start_date' | 'end_date' | 'schedule_day' | 'last_generated_date'>,
  fromDate: Date = new Date()
): Date | null {
  const start = parseDate(recurring.start_date);
  const from = startOfDay(fromDate);
  const effectiveFrom = isBefore(from, start) ? start : from;

  let candidate: Date;

  switch (recurring.frequency) {
    case 'daily': {
      candidate = new Date(effectiveFrom);
      break;
    }
    case 'weekly': {
      const targetDow = recurring.schedule_day ?? getDay(start);
      candidate = new Date(effectiveFrom);
      while (getDay(candidate) !== targetDow) {
        candidate = addDays(candidate, 1);
      }
      break;
    }
    case 'biweekly': {
      const targetDow = recurring.schedule_day ?? getDay(start);
      let anchor = new Date(start);
      while (getDay(anchor) !== targetDow) anchor = addDays(anchor, 1);
      while (isBefore(anchor, effectiveFrom)) anchor = addWeeks(anchor, 2);
      candidate = anchor;
      break;
    }
    case 'monthly': {
      const schedDay = recurring.schedule_day ?? getDate(start);
      const tryThis = getMonthlyDate(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), schedDay);
      if (!isBefore(tryThis, effectiveFrom)) {
        candidate = tryThis;
      } else {
        const next = addMonths(new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1), 1);
        candidate = getMonthlyDate(next.getFullYear(), next.getMonth(), schedDay);
      }
      break;
    }
    case 'yearly': {
      const schedMonth = getMonth(start);
      const schedDay = recurring.schedule_day ?? getDate(start);
      let tryDate = new Date(effectiveFrom.getFullYear(), schedMonth, Math.min(schedDay, 28));
      if (isBefore(tryDate, effectiveFrom)) tryDate = addYears(tryDate, 1);
      candidate = tryDate;
      break;
    }
    default:
      return null;
  }

  if (recurring.end_date) {
    const end = parseDate(recurring.end_date);
    if (isAfter(candidate, end)) return null;
  }

  return candidate;
}
```

`getMonthlyDate` handles the last-day case:

```ts
function getMonthlyDate(year: number, month: number, schedDay: number): Date {
  if (schedDay === -1) return new Date(year, month + 1, 0);  // last day
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));
  return new Date(year, month, Math.min(schedDay, daysInMonth));
}
```

### Key behaviors

- **Pure function**: no DB reads, no caching. Called every render of `RecurringCard` for the due-date label and twice during sort comparisons. There is **NO `next_due_at` cached column** on `recurring_transactions`.
- **`fromDate` semantic**: returns the next occurrence on or after `fromDate`. Used with `today` for the UI label, and with `last_generated_date + 1 day` during sync to find missed occurrences.
- **Feb-31 problem**: monthly with `schedule_day = 31` is impossible to enter (the form caps at 28). For yearly, `schedDay = Math.min(schedDay, 28)` is enforced at the candidate level. For monthly with last-day, `schedule_day = -1` triggers the explicit last-day path.
- **End_date respected** at the very end — if `candidate > end_date`, returns null (the row will sort to the bottom of the list).

### When is `last_generated_date` updated?

- **Auto-log path** (`generateDueTransactions:189-194`): set to the LAST generated date (typically today, but could be older if multiple days were missed and all caught up in one sync).
- **Manual confirm path** (`confirmPendingRecurring:220-223`): set to the chosen `dueDate` (typically today).
- **Skip path** (`skipPendingRecurring:235-238`): set to the chosen `dueDate` (typically today). This is how skip is "remembered" — the sync engine's `addDays(parseDate(last_generated_date), 1)` start scoping skips the period.

---

## 11. Frequency Rule Structure

### Schema

`recurring_transactions` table columns relevant to scheduling:

| Column | Type | Used for |
|---|---|---|
| `frequency` | `'daily' \| 'weekly' \| 'biweekly' \| 'monthly' \| 'yearly'` | Frequency switch |
| `schedule_day` | `int \| null` | Reused across frequencies (semantics below) |
| `start_date` | `date (YYYY-MM-DD)` | Anchor for biweekly + fallback for everything |
| `end_date` | `date (YYYY-MM-DD) \| null` | Hard stop |
| `last_generated_date` | `date (YYYY-MM-DD) \| null` | Idempotency cursor |

### Per-frequency `schedule_day` semantics (CRITICAL)

| Frequency | `schedule_day` semantic | Form input | Defaults |
|---|---|---|---|
| `daily`    | unused (null) | hidden field | n/a |
| `weekly`   | day of week, 0=Sun..6=Sat | 7-button row | falls back to `getDay(start_date)` if null |
| `biweekly` | day of week, 0=Sun..6=Sat | 7-button row | falls back to `getDay(start_date)` if null |
| `monthly`  | day of month, 1..28 OR `-1` for last day | number input + Last-day toggle | falls back to `getDate(start_date)` if null |
| `yearly`   | unused (null) — month + day taken from `start_date` | hidden field | uses `getMonth(start_date)` + `getDate(start_date)` |

**For iOS**: do NOT split this into separate `dayOfWeek: Int?` + `dayOfMonth: Int?` fields. Keep it as a single `scheduleDay: Int?` so the model maps 1:1 to the DB column. If iOS prefers a richer model layer, build a computed `frequencyRule` getter that derives the appropriate semantic from `frequency + scheduleDay`.

### Required-vs-optional matrix for the form

| Frequency | Required field beyond amount + account + frequency | What auto-resolves |
|---|---|---|
| daily    | nothing | n/a |
| weekly   | `schedule_day` (day of week) | n/a |
| biweekly | `schedule_day` (day of week) | start_date is anchor |
| monthly  | `schedule_day` (day of month, 1-28, or -1) | n/a |
| yearly   | nothing | derives month + day from start_date |

The form's `canSubmitRecurring` gate enforces the weekly/biweekly/monthly schedule_day requirement explicitly; daily and yearly skip the check.

### `formatScheduleSummary` (display strings)

| Frequency | Output |
|---|---|
| daily | `Every day` |
| weekly with schedule_day=1 | `Every Mon` |
| weekly without schedule_day | `Every weekly` (degenerate; shouldn't happen with valid form) |
| biweekly with schedule_day=2 | `Every other Tue` |
| monthly with schedule_day=15 | `15th of each month` |
| monthly with schedule_day=1 | `1st of each month` |
| monthly with schedule_day=-1 | `Last day of month` |
| yearly | `Yearly from {Mon d}` (month + day from start_date) |

iOS should mirror these strings character-for-character so the meta line on cards reads identically.

---

## 12. Icons

| Surface | Icon | Lucide name |
|---|---|---|
| Page header sync button | RefreshCw | `RefreshCw` (animate-spin while syncing) |
| Page header Add button | Plus | `Plus` |
| Intro HintCard | RefreshCw | `RefreshCw` |
| Tab Bar (BottomNav) Recurring tab | RefreshCw | `RefreshCw` (per Transactions audit Section 14) |
| Card row dot | n/a — 2px CSS rounded square, color from accentColor |
| Card row pause button | Pause | `Pause` |
| Card row resume button | Play | `Play` |
| Card row edit button | Pencil | `Pencil` |
| Card row delete button | Trash2 | `Trash2` (red on hover) |
| Card "Handled" pill | Check | `Check` |
| Detail page back chevron | ChevronLeft | `ChevronLeft` |
| Detail page Log CTA | Check | `Check` |
| Quick template chips | Emoji | (literal emoji string per template) |

There are NO bucket-color tinted square icons on this tab — unlike Transactions where each row has a 10×10 bucket-color tinted square with a category emoji. The Recurring card uses just the 2px colored dot. This is intentional: the visual is simpler because each card already has a header strip with status info.

iOS SF Symbol candidates:

| Lucide | SF Symbol |
|---|---|
| `RefreshCw` | `arrow.clockwise` (with `.symbolEffect(.rotate, isActive: syncing)` for the spin) |
| `Plus` | `plus` |
| `Pause` | `pause.fill` |
| `Play` | `play.fill` |
| `Pencil` | `pencil` |
| `Trash2` | `trash` |
| `Check` | `checkmark` |
| `ChevronLeft` | `chevron.left` |

---

## 13. Tab Bar Entry

From `src/components/layout/bottom-nav.tsx` (5 tabs total, mobile only):

```ts
const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Home',         icon: Home },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/accounts',     label: 'Accounts',     icon: Wallet },
  { href: '/goals',        label: 'Goals',        icon: Target },
  { href: '/recurring',    label: 'Recurring',    icon: RefreshCw },
] as const;
```

Recurring is the **5th tab** (rightmost on mobile). Lucide `RefreshCw` icon. **No badge counts** on the tab itself — even if there are 3 paused or 5 overdue items, the tab badge stays empty. (Counts only appear on the in-page tab strip: Recurring [N] / Paused [M].)

iOS recommendation: do NOT add a tab-bar badge for pending nudges or overdue counts. Web doesn't. If product wants a Home-page nudge surface, that already exists via `PendingRecurringCard` (Phase 7 shipped on iOS).

---

## 14. Data Dependencies

### Tables read

`recurring_transactions` joined with:
- `accounts` (via `account_id`) — fields: `id, name, type, color, icon`
- `categories` (via `category_id`) — joined further with `budget_buckets` (via `bucket_id`)

Verbatim query on the list page:

```ts
const { data } = await supabase
  .from('recurring_transactions')
  .select('*, account:accounts!account_id(id,name,type,color,icon), category:categories(*, bucket:budget_buckets(*))')
  .eq('user_id', user!.id)
  .eq('is_active', true);
```

So **soft-deleted rows are filtered at the query level**. Paused rows are NOT filtered at the query level — they come back and the client splits them by `is_paused` for the tab segmentation.

The detail page (`/recurring/[id]`) uses the same select clause + an extra `.eq('id', id).single()`.

### Aggregations

None server-side. The Recurring [N] / Paused [M] tab counts are computed client-side from the already-loaded `items` array via the `useMemo` filters (Section 2).

### Categories list

Read from `useTransactionStore.categories` (already populated by other hooks).

### Accounts list

Read from `useAuthStore.accounts` (populated by `useProfile`).

### Refetch strategy

```ts
useEffect(() => {
  if (!user) return;
  async function load() {
    setLoading(true);
    const { data } = await supabase.from('recurring_transactions').select(...);
    setItems((data ?? []) as RecurringTransaction[]);
    setLoading(false);
  }
  load();
}, [user, mutationCount]);
```

Triggered by:
- `user` change (initial mount after auth resolves)
- `mutationCount` bump (any `revalidateForEntity('transaction')` call → bumpMutation → re-load)

NO real-time Supabase subscription. NO pull-to-refresh. NO auto-refresh on focus.

The detail page does NOT participate in `mutationCount` refetch — it uses a local `cancelled` flag and re-fetches manually after `handleLog` / `handleSkip` (lines 117-124). After a log, it calls `bumpMutation()` so OTHER pages refetch, but it loads its own row separately.

---

## 15. Mutation Hooks

| Action | Streak update | Momentum award | Badge check |
|---|---|---|---|
| Create recurring | NO | NO | NO |
| Edit recurring | NO | NO | NO |
| Pause recurring | NO | NO | NO |
| Resume recurring | NO | NO | NO |
| Delete (soft) recurring | NO | NO | NO |
| Sync (auto-log generates transactions) | NO* | NO | NO |
| Detail page "Log this instance now" | NO* | NO | NO |
| Detail page "Skip this period" | NO | NO | NO |

*The transactions generated from auto-log or detail-page log do NOT trigger streak updates — the `updateLoggingStreak` call in `transaction-sheet.tsx:309` fires only from user-initiated transactions through that sheet. The auto-generated path via `confirmPendingRecurring` / `generateDueTransactions` inserts directly into the `transactions` table without invoking the streak helper. This is intentional per the HealthRow audit (line 444): *"NOT called for auto-generated recurring transactions."*

This means iOS' Recurring tab has **zero hookups to the streak/momentum/badge subsystems**. If iOS' detail-page log triggers streak updates, that's a divergence from web — flag it before shipping.

The only side effects are:
- `revalidateForEntity('transaction')` → bumps `mutationCount` → other pages refetch.
- Toasts for pause/resume/delete/sync/save.

---

## 16. Animations

| Animation | Trigger | Library |
|---|---|---|
| Sync icon rotation | `syncing === true` | Tailwind `animate-spin` (1s linear infinite) |
| Modal open/close | `open` prop | shadcn `Dialog` (CSS data-state driven fade + scale) |
| Auto-log toggle pill | `autoLog` change | CSS `transition-transform` on the inner knob (translateX 2 → 22) |
| Paused toggle pill | `is_paused` change | same pattern |
| Tab strip background | `tab` change | CSS `transition-colors` |
| Frequency chip active state | `frequency` change | CSS `transition-all` |
| Day-of-week button active state | `schedule_day` change | CSS `transition-all` |
| Skeleton cards | loading | Tailwind `animate-pulse` |
| Bottom nav tab indicator | active tab change | framer-motion `layoutId="bottom-nav-indicator"` (from earlier audit) |

**No** entrance/exit animations on cards (no `motion.div`, no `AnimatePresence`). When a row toggles paused → it flips tabs instantly. When a row is deleted → it disappears instantly (the `setItems(prev => prev.filter(...))` is the only animation hint). Adding row-level animations would diverge from web; iOS may add idiomatic `.transition()` decorations as long as they're subtle.

The detail page has no entrance animation either — it's a regular Next.js navigation.

---

## iOS Implementation Notes (Recurring Tab)

### Models

iOS already has `RecurringTransaction` from Phase 7. Verify against this Swift translation of the web type (`src/types/index.ts:85-105`):

```swift
enum RecurringFrequency: String, Codable {
    case daily, weekly, biweekly, monthly, yearly
}

struct RecurringTransaction: Identifiable, Codable, Equatable {
    let id: UUID
    let userId: UUID
    let accountId: UUID
    let categoryId: UUID?
    let type: TransactionType                // 'expense' | 'income' (recurring legacy may have income)
    var amount: Double
    var note: String?
    var frequency: RecurringFrequency
    var startDate: String                    // YYYY-MM-DD
    var endDate: String?                     // YYYY-MM-DD
    var scheduleDay: Int?                    // CRITICAL: single column reused (see Section 11 semantics)
    var autoLog: Bool
    var lastGeneratedDate: String?           // YYYY-MM-DD
    var isActive: Bool                       // soft-delete flag
    var isPaused: Bool
    let createdAt: Date
    let updatedAt: Date

    let account: AccountRef?
    let category: Category?
}
```

Critical verification points for the existing Phase 7 model:
- `scheduleDay` is a single `Int?` (NOT split). Web semantics: weekly/biweekly use 0-6 (Sun=0), monthly uses 1-28 or -1 (last day), daily/yearly are null.
- `isActive` is the soft-delete flag (NOT a separate `deletedAt`).
- `lastGeneratedDate` is the idempotency cursor for both auto-log and skip paths.

A quick template helper:

```swift
struct QuickTemplate {
    let label: String
    let emoji: String
    let frequency: RecurringFrequency
    let autoLog: Bool
    let note: String
}

let TEMPLATES: [QuickTemplate] = [
    .init(label: "Monthly rent",   emoji: "🏠",  frequency: .monthly, autoLog: true,  note: "Monthly rent"),
    .init(label: "Subscription",   emoji: "📱",  frequency: .monthly, autoLog: true,  note: "Subscription"),
    .init(label: "Utility bill",   emoji: "⚡",  frequency: .monthly, autoLog: false, note: "Utility bill"),
    .init(label: "Gym membership", emoji: "🏋️", frequency: .monthly, autoLog: true,  note: "Gym membership"),
    .init(label: "Internet",       emoji: "📶",  frequency: .monthly, autoLog: true,  note: "Internet"),
]
```

### Service

iOS already has the engine (Phase 7's `generateAndCollectPending`). Required additions for this tab:

```swift
extension RecurringService {
    /// List active recurrings (paused + unpaused) for a user. Tab segmentation is client-side.
    func fetchAll(userId: UUID) async throws -> [RecurringTransaction]

    /// Add (always type=.expense at the service level — match web's expense-only invariant for new rows).
    func create(userId: UUID, payload: RecurringPayload) async throws -> RecurringTransaction

    /// Edit. Allowed to mutate type only if editing an existing legacy income row; new rows stay expense.
    func update(id: UUID, payload: RecurringPayload) async throws -> RecurringTransaction

    /// Pause / resume — flip is_paused, optimistic in UI.
    func setPaused(id: UUID, isPaused: Bool) async throws

    /// Soft delete — set is_active = false, do NOT cascade to generated transactions.
    func delete(id: UUID) async throws

    /// Manual sync — proxies the existing engine's generateAndCollectPending and bumps mutationCount.
    func syncNow(userId: UUID) async throws

    /// Detail-page actions
    func logInstanceNow(userId: UUID, recurring: RecurringTransaction, dueDate: String) async throws
    func skipPeriod(recurringId: UUID, dueDate: String) async throws
}
```

The `getNextDueDate` / `formatScheduleSummary` / `isHandledThisInstance` / `getCurrentInstancePeriod` pure helpers from `lib/recurring.ts` should be ported as **stateless static methods** on a `RecurringEngine` Swift type — they're already pure on the web side. Phase 7 likely already has the first three.

### AppState integration

```swift
final class AppState: ObservableObject {
    // existing...

    // Recurring tab state
    @Published var recurringList: [RecurringTransaction] = []
    @Published var recurringTab: RecurringTab = .expense    // .expense | .paused
    @Published var recurringLoading: Bool = false
    @Published var recurringSyncing: Bool = false

    // computed
    var expenseRecurrings: [RecurringTransaction] {
        recurringList
            .filter { $0.type == .expense && !$0.isPaused }
            .sorted { ($0.nextDueTimestamp ?? .distantFuture) < ($1.nextDueTimestamp ?? .distantFuture) }
    }

    var pausedRecurrings: [RecurringTransaction] {
        recurringList
            .filter { $0.isPaused }
            .sorted { $0.updatedAt > $1.updatedAt }
    }
}
```

Refetch driver: `mutationCount` change (already exists from earlier phases). Same pattern as TransactionsView.

### Components

| Component | Responsibility |
|---|---|
| `RecurringView` | Top-level screen. Header (title + Sync + Add buttons) + intro hint + tab strip + list + quick templates strip. |
| `RecurringTabsView` | 2-tab segmented control (Recurring / Paused) bound to `appState.recurringTab` with count chips. |
| `RecurringCardView` | Mirrors `RecurringCard` 1:1 — header strip with due-date label + Handled/Nudge pill, divider, body with dot+name+meta on left, amount + 3-button row on right. |
| `RecurringDetailView` | Mirrors `/recurring/[id]/page.tsx` — header card + "this period" status section with Log/Skip CTAs (only for non-auto-log items). |
| `RecurringFormSheet` | Bottom sheet (NOT a centered Dialog — iOS idiomatic). All fields per Section 4. Drives `RecurringService.create` / `update`. |
| `FrequencyChipsView` | 5-chip grid (Daily/Weekly/Bi-weekly/Monthly/Yearly), green active state. |
| `DayOfWeekPickerView` | 7-button row (S M T W T F S), shown when frequency ∈ {weekly, biweekly}. |
| `DayOfMonthPickerView` | Number input (1-28) + Last-day toggle, shown when frequency == monthly. |
| `QuickTemplatesStrip` | Horizontal scroll of 5 chips, taps open `RecurringFormSheet` pre-filled. |
| `IntroHintCardView` | Already exists (the HintCard pattern from earlier audits). Drives off `dismissed_hints` table by `recurring_intro` key. |
| `IncomeAutoLogConfirmAlert` | Native `Alert` — only fires if user toggles auto-log ON for legacy income. (Not needed for new rows.) |

The `RecurringFormSheet` does NOT need a custom amount keypad — web uses a plain `<Input type="number">` with system decimal keyboard. iOS should use `TextField` with `.keyboardType(.decimalPad)`.

### Tab bar integration

If the iOS `TabView` has been introduced for the Transactions rebuild (per that audit), Recurring slots in as the 5th tab with SF Symbol `arrow.clockwise`. No tab badge.

### Schema considerations

- `recurring_transactions` table already exists with all columns (`scheduleDay`, `lastGeneratedDate`, `isActive`, `isPaused`, `autoLog`, etc.) — Phase 7 confirmed this.
- RLS: standard `auth.uid() = user_id` posture. Both list and detail queries are user-scoped.
- The Bearer-auth helper (`feat/bearer-auth-decisions`) is **not used** here — iOS reads tables directly via Swift SDK.
- No new migrations needed.

### Architecture decisions

1. **Tab segmentation client-side, not query-side.** Match web. Filter the loaded list; don't re-query when switching tabs.
2. **No optimistic UI on save.** Match web. Pause/resume/delete ARE optimistic (already in Phase 7 if delete is wired); save is not.
3. **Modal for add/edit, separate detail route for "this period".** Match web. Don't conflate the two — the detail page exists specifically for the Log/Skip current-instance affordances, which is a different mental model from "edit this recurring's schedule."
4. **No mutation hookups to streak/momentum/badge.** Match web. Auto-generated and detail-page-logged transactions do not tick the streak.
5. **Soft delete via `isActive=false`**, not row delete. Match web. Already-generated transactions stay in the user's history.

### Phase splitting recommendation

**Single phase. Do not split.**

Justification:
- Total scope: ~5 components + 1 service extension + 1 detail view + 1 modal. ~10-12 files.
- No mutation chain risk (no streak/momentum/badge hookups means no cross-cutting concerns with HealthRow / Phase 9).
- The engine (Phase 7) is already shipped and battle-tested.
- The detail page's Log/Skip flow is small enough (~50 LOC of view code) that splitting it into its own phase would add overhead without much risk reduction.
- Quick templates are a single hardcoded array.

If splitting were considered, the only sensible cut would be **R1 (List + Add/Edit/Pause/Delete + Sync) → R2 (Detail page Log/Skip + Quick templates strip)**, with R2 as a post-merge polish PR. But even this isn't necessary unless the team is bandwidth-constrained — R2 is small and low-risk.

The single PR should land with both the list page AND the detail page; without the detail page, the Nudge pill on cards has no destination for the user to act on, which is a worse user experience than what web ships.

### Out of scope

- **Per-tab badge counts on the bottom nav** — web doesn't badge the Recurring tab. Don't introduce.
- **Pull-to-refresh** — not on web. Mutation-count refetch is the model.
- **Real-time subscriptions** — not on web.
- **Hard delete / restore / archive views** — soft-delete is permanent in the UI; recovering a soft-deleted recurring is a manual-DB operation.
- **Income recurring CRUD** — new rows are expense-only on web. Editing legacy income rows is supported but the canonical place for income is `Settings → Income` (`income_sources` table).
- **Bulk pause/delete** — not on web. No multi-select.
- **CSV export of recurring list** — not on web.
- **`next_due_at` cached column** — does NOT exist on web. Computed on the fly via `getNextDueDate`. iOS should compute on the fly too.
- **Custom AmountKeypad in the form** — web uses a plain numeric input. Don't pull `AmountKeypad` over.
- **Streak/momentum/badge mutations on log/skip** — does not exist on web. Don't add.
- **Snooze / "remind me tomorrow" affordance** — web has `Skip` (skip the current period) and `Log this instance now`, but no time-shift. Don't introduce.
- **Push notifications when a recurring is due** — separate subsystem, not part of this tab. Out of scope unless explicitly added.
