-- Momentum + Tiers system

create table if not exists momentum (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_points integer not null default 0,
  tier text not null default 'seedling',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists momentum_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  points integer not null,
  created_at timestamptz not null default now()
);

create index if not exists momentum_events_user_created
  on momentum_events(user_id, created_at desc);

alter table momentum enable row level security;
alter table momentum_events enable row level security;

create policy "Users can view own momentum"
  on momentum for select using (auth.uid() = user_id);
create policy "Users can insert own momentum"
  on momentum for insert with check (auth.uid() = user_id);
create policy "Users can update own momentum"
  on momentum for update using (auth.uid() = user_id);

create policy "Users can view own momentum events"
  on momentum_events for select using (auth.uid() = user_id);
create policy "Users can insert own momentum events"
  on momentum_events for insert with check (auth.uid() = user_id);
