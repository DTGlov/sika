-- Consolidate savings + sinking_fund into a single 'target' type.
-- Both types had the same mechanics; the distinction was confusing.

-- Step 1: Migrate savings goals to sinking_fund (same mechanics)
update goals
set goal_type = 'sinking_fund'
where goal_type = 'savings';

-- Step 2: Drop existing type check constraint
alter table goals drop constraint if exists goals_goal_type_check;

-- Step 3: Rename sinking_fund to target (cleaner naming)
update goals
set goal_type = 'target'
where goal_type = 'sinking_fund';

-- Step 4: Recreate check constraint with only valid types
alter table goals add constraint goals_goal_type_check
  check (goal_type in ('target', 'perpetual'));

-- Step 5: Update goal_type_rules constraint
alter table goals drop constraint if exists goal_type_rules;
alter table goals add constraint goal_type_rules check (
  (goal_type = 'perpetual' and deadline is null)
  OR
  (goal_type = 'target' and target_amount is not null and deadline is not null)
);
