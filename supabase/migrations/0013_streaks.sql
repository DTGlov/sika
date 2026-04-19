create table streaks (
  user_id uuid references auth.users on delete cascade primary key,

  -- Logging streak (daily)
  logging_current int default 0 not null,
  logging_longest int default 0 not null,
  logging_last_date date,

  -- Savings streak (weekly, Monday-Sunday)
  savings_current int default 0 not null,
  savings_longest int default 0 not null,
  savings_last_week date, -- the Monday of the last week a contribution was made

  -- Freezes (Duolingo-style)
  freezes_banked int default 0 not null check (freezes_banked between 0 and 2),
  freezes_earned_total int default 0 not null,

  -- Milestone tracking (prevent re-showing)
  logging_milestones_shown int[] default '{}',
  savings_milestones_shown int[] default '{}',

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table streaks enable row level security;
create policy "own streaks" on streaks for all using (auth.uid() = user_id);

create trigger streaks_updated_at
  before update on streaks
  for each row execute procedure update_updated_at();

-- Backfill: create a streaks row for every existing user
insert into streaks (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Update handle_new_user trigger to create streaks row for new signups
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  needs_id uuid;
  wants_id uuid;
  future_id uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');

  insert into public.budget_buckets (user_id, name, display_name, color, sort_order)
  values (new.id, 'needs', 'Needs', '#00D9A3', 1) returning id into needs_id;
  insert into public.budget_buckets (user_id, name, display_name, color, sort_order)
  values (new.id, 'wants', 'Wants', '#FBBF24', 2) returning id into wants_id;
  insert into public.budget_buckets (user_id, name, display_name, color, sort_order)
  values (new.id, 'future', 'Future', '#60A5FA', 3) returning id into future_id;

  insert into public.accounts (user_id, name, type, is_default, icon, color, sort_order) values
    (new.id, 'Bank', 'bank', true, 'landmark', '#00D9A3', 1),
    (new.id, 'MoMo', 'momo', false, 'smartphone', '#FBBF24', 2),
    (new.id, 'Cash', 'cash', false, 'banknote', '#A1A1AA', 3);

  insert into public.categories (user_id, bucket_id, name, icon, is_default, category_type) values
    (new.id, needs_id, 'Rent', 'home', true, 'expense'),
    (new.id, needs_id, 'Groceries', 'shopping-cart', true, 'expense'),
    (new.id, needs_id, 'Light Bill', 'zap', true, 'expense'),
    (new.id, needs_id, 'Water Bill', 'droplet', true, 'expense'),
    (new.id, needs_id, 'Data Bundle', 'wifi', true, 'expense'),
    (new.id, needs_id, 'Transport', 'car', true, 'expense'),
    (new.id, needs_id, 'Chop Money', 'utensils', true, 'expense'),
    (new.id, needs_id, 'Healthcare', 'heart-pulse', true, 'expense'),
    (new.id, wants_id, 'Eating Out', 'pizza', true, 'expense'),
    (new.id, wants_id, 'Entertainment', 'film', true, 'expense'),
    (new.id, wants_id, 'Shopping', 'shopping-bag', true, 'expense'),
    (new.id, wants_id, 'Subscriptions', 'repeat', true, 'expense'),
    (new.id, wants_id, 'Gym', 'dumbbell', true, 'expense'),
    (new.id, wants_id, 'Personal Care', 'sparkles', true, 'expense'),
    (new.id, future_id, 'Savings', 'piggy-bank', true, 'expense'),
    (new.id, future_id, 'Investments', 'trending-up', true, 'expense'),
    (new.id, future_id, 'Emergency Fund', 'shield', true, 'expense'),
    (new.id, null, 'Salary', 'briefcase', true, 'income'),
    (new.id, null, 'Side Hustle', 'zap', true, 'income'),
    (new.id, null, 'Gift', 'gift', true, 'income'),
    (new.id, null, 'Balance Adjustment', 'scale', true, 'adjustment');

  insert into public.streaks (user_id) values (new.id);

  return new;
exception when others then
  raise log 'handle_new_user failed: %', sqlerrm;
  return new;
end;
$$;
