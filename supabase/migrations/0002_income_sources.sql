create table income_sources (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  frequency text not null check (frequency in ('monthly','weekly','biweekly','irregular')),
  expected_day int, -- day of month for monthly (1-31), day of week for weekly (0-6), null for irregular
  is_active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_income_sources_user on income_sources(user_id) where is_active = true;

alter table income_sources enable row level security;
create policy "own income sources" on income_sources for all using (auth.uid() = user_id);

-- Trigger to keep updated_at fresh
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger income_sources_updated_at
  before update on income_sources
  for each row execute procedure update_updated_at();
