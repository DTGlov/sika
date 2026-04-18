-- Step 1: Migrate any savings-type goals to sinking_fund (unchanged)
update goals 
set goal_type = 'sinking_fund' 
where goal_type = 'savings';

-- Step 2: Drop BOTH old constraints FIRST, before changing data
alter table goals drop constraint if exists goals_goal_type_check;
alter table goals drop constraint if exists goal_type_rules;

-- Step 3: Now safe to rename sinking_fund to target
update goals 
set goal_type = 'target' 
where goal_type = 'sinking_fund';

-- Step 4: Add the new type check constraint
alter table goals add constraint goals_goal_type_check 
  check (goal_type in ('target','perpetual'));

-- Step 5: Add the new goal_type_rules constraint
alter table goals add constraint goal_type_rules check (
  (goal_type = 'perpetual' and deadline is null) 
  OR
  (goal_type = 'target' and target_amount is not null and deadline is not null)
);