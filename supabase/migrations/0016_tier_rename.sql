-- Rename tier values from nature-themed names to metallic spec names.
-- Old: seedling(0) / sprout(100) / grower(300) / builder(700) / achiever(1500) / seeker(3000)
-- New: bronze(0)   / silver(500) /   gold(2000) / platinum(5000) / diamond(10000)

-- Drop existing check constraint so we can update values
alter table momentum drop constraint if exists momentum_tier_check;
alter table momentum drop constraint if exists momentum_current_tier_check;

-- Map old → new using total_points to correctly place boundary users
update momentum set tier = 'bronze'   where tier = 'seedling';
update momentum set tier = 'bronze'   where tier = 'sprout';
update momentum set tier = case
  when total_points >= 500 then 'silver'
  else 'bronze'
end where tier = 'grower';
update momentum set tier = 'silver'   where tier = 'builder';
update momentum set tier = case
  when total_points >= 2000 then 'gold'
  else 'silver'
end where tier = 'achiever';
update momentum set tier = case
  when total_points >= 10000 then 'diamond'
  when total_points >= 5000  then 'platinum'
  when total_points >= 2000  then 'gold'
  else 'silver'
end where tier = 'seeker';

-- Recreate check constraint with the new valid values
alter table momentum add constraint momentum_tier_check
  check (tier in ('bronze','silver','gold','platinum','diamond'));

-- Also update default for future inserts
alter table momentum alter column tier set default 'bronze';
