-- Add category_type to distinguish expense / income / adjustment categories.
-- Default 'expense' covers all existing bucket-linked categories safely.
alter table categories
  add column category_type text not null default 'expense'
  check (category_type in ('expense', 'income', 'adjustment', 'transfer', 'system'));

-- Backfill known income categories
update categories set category_type = 'income'
  where bucket_id is null and name in ('Salary', 'Side Hustle', 'Gift');

-- Backfill adjustment categories by name
update categories set category_type = 'adjustment'
  where bucket_id is null and name ilike '%adjustment%';

-- All bucket-linked categories are expenses (already defaulted, explicit for clarity)
update categories set category_type = 'expense'
  where bucket_id is not null;

-- Enforce bucket consistency going forward:
--   expense → must have bucket_id
--   non-expense → must NOT have bucket_id
alter table categories add constraint category_bucket_consistency check (
  (category_type = 'expense' and bucket_id is not null) or
  (category_type != 'expense' and bucket_id is null)
);

-- Seed a "Balance Adjustment" category for every existing user
do $$
declare
  u record;
begin
  for u in select id from profiles loop
    -- Only insert if no adjustment category exists yet for this user
    if not exists (
      select 1 from categories
      where user_id = u.id and category_type = 'adjustment'
    ) then
      insert into categories (user_id, bucket_id, name, icon, is_default, category_type)
      values (u.id, null, 'Balance Adjustment', 'scale', true, 'adjustment');
    end if;
  end loop;
end $$;

-- Update the new-user trigger to seed category_type from the start
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

  insert into categories (user_id, bucket_id, name, icon, is_default, category_type) values
    -- Needs
    (new.id, needs_id, 'Rent', 'home', true, 'expense'),
    (new.id, needs_id, 'Groceries', 'shopping-cart', true, 'expense'),
    (new.id, needs_id, 'Light Bill', 'zap', true, 'expense'),
    (new.id, needs_id, 'Water Bill', 'droplet', true, 'expense'),
    (new.id, needs_id, 'Data Bundle', 'wifi', true, 'expense'),
    (new.id, needs_id, 'Transport', 'car', true, 'expense'),
    (new.id, needs_id, 'Chop Money', 'utensils', true, 'expense'),
    (new.id, needs_id, 'Healthcare', 'heart-pulse', true, 'expense'),
    -- Wants
    (new.id, wants_id, 'Eating Out', 'pizza', true, 'expense'),
    (new.id, wants_id, 'Entertainment', 'film', true, 'expense'),
    (new.id, wants_id, 'Shopping', 'shopping-bag', true, 'expense'),
    (new.id, wants_id, 'Subscriptions', 'repeat', true, 'expense'),
    (new.id, wants_id, 'Gym', 'dumbbell', true, 'expense'),
    (new.id, wants_id, 'Personal Care', 'sparkles', true, 'expense'),
    -- Future
    (new.id, future_id, 'Savings', 'piggy-bank', true, 'expense'),
    (new.id, future_id, 'Investments', 'trending-up', true, 'expense'),
    (new.id, future_id, 'Emergency Fund', 'shield', true, 'expense'),
    -- Income
    (new.id, null, 'Salary', 'briefcase', true, 'income'),
    (new.id, null, 'Side Hustle', 'zap', true, 'income'),
    (new.id, null, 'Gift', 'gift', true, 'income'),
    -- Adjustment
    (new.id, null, 'Balance Adjustment', 'scale', true, 'adjustment');

  return new;
end;
$$;
