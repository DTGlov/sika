-- Ensure currency column is NOT NULL (it already exists with DEFAULT 'GHS')
UPDATE profiles SET currency = 'GHS' WHERE currency IS NULL;
ALTER TABLE profiles ALTER COLUMN currency SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN currency SET DEFAULT 'GHS';

-- Update handle_new_user trigger to accept currency from signup metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  needs_id uuid;
  wants_id uuid;
  savings_id uuid;
  user_currency text;
BEGIN
  user_currency := COALESCE(new.raw_user_meta_data->>'currency_code', 'GHS');

  INSERT INTO profiles (id, full_name, currency)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', user_currency);

  -- Create the three buckets
  INSERT INTO budget_buckets (user_id, name, display_name, color, sort_order)
  VALUES
    (new.id, 'needs', 'Needs', '#00D9A3', 1),
    (new.id, 'wants', 'Wants', '#FBBF24', 2),
    (new.id, 'savings', 'Savings', '#60A5FA', 3);

  SELECT id INTO needs_id FROM budget_buckets WHERE user_id = new.id AND name = 'needs';
  SELECT id INTO wants_id FROM budget_buckets WHERE user_id = new.id AND name = 'wants';
  SELECT id INTO savings_id FROM budget_buckets WHERE user_id = new.id AND name = 'savings';

  -- Default categories
  INSERT INTO categories (user_id, bucket_id, name, icon, is_default) VALUES
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
    -- Income presets
    (new.id, null, 'Salary', 'briefcase', true),
    (new.id, null, 'Side Hustle', 'zap', true),
    (new.id, null, 'Gift', 'gift', true),
    (new.id, null, 'Refund', 'refresh-cw', true),
    (new.id, null, 'Loan Repayment', 'handshake', true),
    (new.id, null, 'Sale', 'tag', true),
    (new.id, null, 'Bonus', 'sparkle', true);

  -- Default accounts
  INSERT INTO accounts (user_id, name, type, account_type, opening_balance, sort_order) VALUES
    (new.id, 'Bank', 'bank', 'general', 0, 1),
    (new.id, 'Hubtel wallet', 'momo', 'wallet', 0, 2),
    (new.id, 'MTN MoMo Wallet', 'momo', 'wallet', 0, 3),
    (new.id, 'Savings', 'savings', 'savings', 0, 4);

  RETURN new;
END;
$$;
