-- Profiles (extends auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  monthly_income numeric(12,2) default 0,
  currency text default 'GHS',
  needs_percent numeric(5,2) default 50,
  wants_percent numeric(5,2) default 30,
  future_percent numeric(5,2) default 20,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Buckets (Needs/Wants/Future) — one row per user per bucket
create table budget_buckets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null, -- 'needs' | 'wants' | 'future'
  display_name text not null,
  color text not null,
  icon text,
  sort_order int not null,
  created_at timestamptz default now()
);

-- Categories
create table categories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  bucket_id uuid references budget_buckets on delete set null,
  name text not null,
  icon text,
  is_default boolean default false,
  is_archived boolean default false,
  created_at timestamptz default now()
);

-- Transactions
create table transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  category_id uuid references categories on delete set null,
  amount numeric(12,2) not null,
  type text not null check (type in ('expense','income','transfer')),
  note text,
  transaction_date date not null default current_date,
  created_at timestamptz default now()
);

create index idx_transactions_user_date on transactions(user_id, transaction_date desc);
create index idx_transactions_category on transactions(category_id);

-- RLS
alter table profiles enable row level security;
alter table budget_buckets enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;

-- Policies: users only see/modify their own data
create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own buckets" on budget_buckets for all using (auth.uid() = user_id);
create policy "own categories" on categories for all
  using (auth.uid() = user_id or user_id is null);
create policy "own transactions" on transactions for all using (auth.uid() = user_id);

-- Trigger: create profile + buckets + default categories on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  needs_id uuid;
  wants_id uuid;
  future_id uuid;
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');

  insert into budget_buckets (user_id, name, display_name, color, sort_order)
  values
    (new.id, 'needs', 'Needs', '#00D9A3', 1),
    (new.id, 'wants', 'Wants', '#FBBF24', 2),
    (new.id, 'future', 'Future', '#60A5FA', 3);

  select id into needs_id from budget_buckets where user_id = new.id and name = 'needs';
  select id into wants_id from budget_buckets where user_id = new.id and name = 'wants';
  select id into future_id from budget_buckets where user_id = new.id and name = 'future';

  -- Ghana-context default categories
  insert into categories (user_id, bucket_id, name, icon, is_default) values
    -- Needs
    (new.id, needs_id, 'Rent', 'home', true),
    (new.id, needs_id, 'Groceries', 'shopping-cart', true),
    (new.id, needs_id, 'Light Bill', 'zap', true),
    (new.id, needs_id, 'Water Bill', 'droplet', true),
    (new.id, needs_id, 'Data Bundle', 'wifi', true),
    (new.id, needs_id, 'Transport', 'car', true),
    (new.id, needs_id, 'Chop Money', 'utensils', true),
    (new.id, needs_id, 'Healthcare', 'heart-pulse', true),
    -- Wants
    (new.id, wants_id, 'Eating Out', 'pizza', true),
    (new.id, wants_id, 'Entertainment', 'film', true),
    (new.id, wants_id, 'Shopping', 'shopping-bag', true),
    (new.id, wants_id, 'Subscriptions', 'repeat', true),
    (new.id, wants_id, 'Gym', 'dumbbell', true),
    (new.id, wants_id, 'Personal Care', 'sparkles', true),
    -- Future
    (new.id, future_id, 'Savings', 'piggy-bank', true),
    (new.id, future_id, 'Investments', 'trending-up', true),
    (new.id, future_id, 'Emergency Fund', 'shield', true),
    -- Income (no bucket)
    (new.id, null, 'Salary', 'briefcase', true),
    (new.id, null, 'Side Hustle', 'zap', true),
    (new.id, null, 'Gift', 'gift', true);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
