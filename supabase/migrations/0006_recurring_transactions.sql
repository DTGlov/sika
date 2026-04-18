-- Recurring transactions: scheduled expense/income entries
create table recurring_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  account_id uuid references accounts on delete restrict not null,
  category_id uuid references categories on delete set null,

  type text not null check (type in ('expense','income')),
  amount numeric(12,2) not null check (amount > 0),
  note text,

  -- Schedule
  frequency text not null check (frequency in ('daily','weekly','biweekly','monthly','yearly')),
  start_date date not null,
  end_date date, -- null = no end

  -- day of week (0-6, sunday=0) for weekly/biweekly
  -- day of month (1-28, or -1 for "last day") for monthly
  -- ignored for daily/yearly (yearly uses start_date's month/day)
  schedule_day int,

  auto_log boolean default true,
  last_generated_date date, -- prevents duplicate generation

  is_active boolean default true,
  is_paused boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_recurring_user_active on recurring_transactions(user_id)
  where is_active = true and is_paused = false;

alter table recurring_transactions enable row level security;
create policy "own recurring" on recurring_transactions for all using (auth.uid() = user_id);

create trigger recurring_updated_at
  before update on recurring_transactions
  for each row execute procedure update_updated_at();

-- Link auto-generated transactions back to their recurring rule
alter table transactions
  add column generated_from_recurring uuid references recurring_transactions on delete set null;

create index idx_transactions_recurring on transactions(generated_from_recurring)
  where generated_from_recurring is not null;

-- Income nudge dismissals: track user responses to "did your income arrive?" cards
create table income_nudge_dismissals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  income_source_id uuid references income_sources on delete cascade not null,
  due_date date not null,
  action text not null check (action in ('logged','snoozed','dismissed')),
  created_at timestamptz default now(),
  unique(user_id, income_source_id, due_date)
);

alter table income_nudge_dismissals enable row level security;
create policy "own dismissals" on income_nudge_dismissals for all using (auth.uid() = user_id);
