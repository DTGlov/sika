alter table profiles
  add column theme_preference text default 'auto' not null
  check (theme_preference in ('light','dark','auto'));

-- Backfill: existing users default to 'auto'
update profiles set theme_preference = 'auto' where theme_preference is null;
