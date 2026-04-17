# Sika

Bold personal finance for Ghana. Track spending, savings, and investments with a clean 50/30/20 bucket split. Revolut/Cash App energy, Cedis first.

## Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project, then:

- Copy your **Project URL** and **anon public key** from Settings → API.
- Run the migration in the SQL editor:
  ```
  supabase/migrations/0001_initial_schema.sql
  ```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`.

---

## Folder structure

```
src/
  app/
    (auth)/         # login + signup pages (unauthenticated layout)
    (app)/          # dashboard, transactions, settings (auth-protected)
    layout.tsx      # root layout with fonts + dark mode
    page.tsx        # redirects to /dashboard or /login
  components/
    ui/             # shadcn/ui primitives
    dashboard/      # BucketRing, SpendCard, WeeklyChart, RecentTransactions, OnboardingModal
    transactions/   # TransactionSheet, AmountKeypad, CategoryGrid, TransactionItem, FAB
    layout/         # AppShell, TopBar
  lib/
    supabase/       # client.ts (browser), server.ts (RSC), middleware.ts (session refresh)
    utils.ts        # cn(), formatGHS(), formatGHSCompact(), getGreeting(), etc.
    constants.ts    # bucket config, default percentages, currency symbol
  stores/
    auth-store.ts       # Zustand: user + profile
    transaction-store.ts # Zustand: transactions, categories, log sheet state
  types/
    index.ts        # shared TypeScript interfaces
  hooks/
    use-profile.ts          # fetch + cache profile
    use-dashboard-data.ts   # fetch all dashboard stats

middleware.ts       # root Next.js middleware — refreshes Supabase session on every request
supabase/
  migrations/
    0001_initial_schema.sql  # profiles, budget_buckets, categories, transactions + RLS + trigger
```

---

## Phase 1 scope (this build)

- Auth: email/password sign-up and login via Supabase
- On signup: database trigger creates profile + 3 buckets + 20 Ghana-context categories
- Onboarding: modal asking for monthly income if not set (default ₵11,500)
- Dashboard: animated bucket rings, today/month spend cards, 7-day bar chart, recent transactions
- Transaction logging: floating + button → 3-step sheet (amount keypad → category grid → note/date)
- Transactions page: full list grouped by day, filterable, delete + edit
- Settings: edit income, edit bucket %, manage categories, sign out
- Design: dark-only, Geist fonts, accent green `#00D9A3`, Framer Motion throughout

## Future phases

- Phase 2: recurring transactions, budgets per category, CSV export
- Phase 3: mobile-native (Expo/React Native) with shared Supabase backend
- Phase 4: savings goals with progress tracking, investment logging
- Phase 5: multi-currency support, bank statement import
