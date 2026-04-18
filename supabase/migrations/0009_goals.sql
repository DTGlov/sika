create table goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null check (length(name) > 0 and length(name) <= 80),
  description text,
  icon text,
  color text,
  goal_type text not null check (goal_type in ('savings','perpetual','sinking_fund')),
  target_amount numeric(12,2) check (target_amount is null or target_amount > 0),
  deadline date,
  funding_account_id uuid references accounts on delete restrict not null,
  priority int default 5 check (priority between 1 and 10),
  is_active boolean default true,
  is_archived boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table goals add constraint goal_type_rules check (
  (goal_type = 'perpetual' and deadline is null)
  OR
  (goal_type in ('savings','sinking_fund') and target_amount is not null and deadline is not null)
);

create index idx_goals_user_active on goals(user_id) where is_active = true and is_archived = false;
create index idx_goals_priority on goals(user_id, priority) where is_active = true;

alter table goals enable row level security;
create policy "own goals" on goals for all using (auth.uid() = user_id);

create trigger goals_updated_at before update on goals
  for each row execute procedure update_updated_at();

alter table transactions add column goal_id uuid references goals on delete set null;
create index idx_transactions_goal on transactions(goal_id) where goal_id is not null;
