-- Badges catalog: one row per badge type (shared across all users)
create table badges (
  id text primary key, -- e.g., 'first_steps', 'week_warrior'
  name text not null,
  description text not null,
  icon_name text not null, -- Lucide icon name, e.g., 'Footprints'
  rarity text not null check (rarity in ('common','rare')),
  sort_order int not null,
  created_at timestamptz default now()
);

-- User earned badges: one row per (user, badge) pair upon unlock
create table user_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  badge_id text references badges(id) not null,
  unlocked_at timestamptz default now() not null,
  celebration_shown boolean default false,
  unique (user_id, badge_id)
);

alter table user_badges enable row level security;
create policy "own user_badges" on user_badges for all using (auth.uid() = user_id);

create index idx_user_badges_user_unlocked on user_badges(user_id, unlocked_at desc);

-- Seed the badge catalog (exact values — do not modify)
insert into badges (id, name, description, icon_name, rarity, sort_order) values
  ('first_steps',         'First Steps',         'Log your first transaction',                    'Footprints',    'common', 1),
  ('week_warrior',        'Week Warrior',        'Maintain a 7-day logging streak',               'Flame',         'common', 2),
  ('goal_getter',         'Goal Getter',         'Complete your first target goal',               'Target',        'common', 3),
  ('consistent_saver',    'Consistent Saver',    'Maintain a 4-week savings streak',              'PiggyBank',     'common', 4),
  ('century_club',        'Century Club',        'Log 100 total transactions',                    'Hash',          'rare',   5),
  ('month_of_discipline', 'Month of Discipline', 'Maintain a 30-day logging streak',              'CalendarCheck', 'rare',   6),
  ('seeker',              'Seeker',              'Complete 5 target goals',                       'Compass',       'rare',   7),
  ('safety_net',          'Safety Net',          'Life Savings reaches 3x your monthly Needs',    'Shield',        'rare',   8);
