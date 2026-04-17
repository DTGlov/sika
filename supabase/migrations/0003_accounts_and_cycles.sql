-- ACCOUNTS TABLE
create table accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  type text not null check (type in ('bank','momo','cash','savings','investment','other')),
  icon text,
  color text,
  opening_balance numeric(12,2) default 0 not null,
  is_active boolean default true,
  is_default boolean default false, -- one default account per user
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_accounts_user on accounts(user_id) where is_active = true;
create unique index idx_one_default_account on accounts(user_id) where is_default = true;

alter table accounts enable row level security;
create policy "own accounts" on accounts for all using (auth.uid() = user_id);

create trigger accounts_updated_at
  before update on accounts
  for each row execute procedure update_updated_at();

-- ADD account_id TO TRANSACTIONS
alter table transactions
  add column account_id uuid references accounts on delete restrict,
  add column to_account_id uuid references accounts on delete restrict;
  -- to_account_id only used for transfers

-- For transfers, enforce both accounts differ
alter table transactions add constraint transfer_accounts_differ
  check (type != 'transfer' or (account_id is not null and to_account_id is not null and account_id != to_account_id));

-- For income/expense, to_account_id must be null
alter table transactions add constraint non_transfer_no_to_account
  check (type = 'transfer' or to_account_id is null);

create index idx_transactions_account on transactions(account_id);

-- BUDGET CYCLE START DAY on profiles
alter table profiles
  add column cycle_start_day int default 1 check (cycle_start_day between 1 and 28);
  -- capped at 28 to avoid Feb edge cases; "last day of month" handled in app logic if needed

-- SEED DEFAULT ACCOUNTS FOR EXISTING USERS
-- Every user needs at least one account. Backfill a "Main Account" for anyone without one.
insert into accounts (user_id, name, type, is_default, icon, color, sort_order)
select id, 'Main Account', 'bank', true, 'landmark', '#00D9A3', 1
from auth.users
where not exists (select 1 from accounts where accounts.user_id = auth.users.id);

-- Backfill existing transactions to use the default account
update transactions t
set account_id = (
  select id from accounts a
  where a.user_id = t.user_id and a.is_default = true
  limit 1
)
where t.account_id is null;

-- NOW make account_id required for new transactions going forward
alter table transactions alter column account_id set not null;

-- UPDATE handle_new_user TO SEED DEFAULT ACCOUNTS
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

  -- Default accounts
  insert into public.accounts (user_id, name, type, is_default, icon, color, sort_order) values
    (new.id, 'Bank', 'bank', true, 'landmark', '#00D9A3', 1),
    (new.id, 'MoMo', 'momo', false, 'smartphone', '#FBBF24', 2),
    (new.id, 'Cash', 'cash', false, 'banknote', '#A1A1AA', 3);

  -- Default categories (same as before)
  insert into public.categories (user_id, bucket_id, name, icon, is_default) values
    (new.id, needs_id, 'Rent', 'home', true),
    (new.id, needs_id, 'Groceries', 'shopping-cart', true),
    (new.id, needs_id, 'Light Bill', 'zap', true),
    (new.id, needs_id, 'Water Bill', 'droplet', true),
    (new.id, needs_id, 'Data Bundle', 'wifi', true),
    (new.id, needs_id, 'Transport', 'car', true),
    (new.id, needs_id, 'Chop Money', 'utensils', true),
    (new.id, needs_id, 'Healthcare', 'heart-pulse', true),
    (new.id, wants_id, 'Eating Out', 'pizza', true),
    (new.id, wants_id, 'Entertainment', 'film', true),
    (new.id, wants_id, 'Shopping', 'shopping-bag', true),
    (new.id, wants_id, 'Subscriptions', 'repeat', true),
    (new.id, wants_id, 'Gym', 'dumbbell', true),
    (new.id, wants_id, 'Personal Care', 'sparkles', true),
    (new.id, future_id, 'Savings', 'piggy-bank', true),
    (new.id, future_id, 'Investments', 'trending-up', true),
    (new.id, future_id, 'Emergency Fund', 'shield', true),
    (new.id, null, 'Salary', 'briefcase', true),
    (new.id, null, 'Side Hustle', 'zap', true),
    (new.id, null, 'Gift', 'gift', true);

  return new;
exception when others then
  raise log 'handle_new_user failed: %', sqlerrm;
  return new;
end;
$$;
