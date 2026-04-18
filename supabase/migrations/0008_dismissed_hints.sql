-- Track which onboarding hints each user has dismissed.
-- hint_id is a stable string key defined in src/lib/hints.ts.
create table dismissed_hints (
  user_id uuid references auth.users on delete cascade not null,
  hint_id text not null,
  dismissed_at timestamptz default now(),
  primary key (user_id, hint_id)
);

alter table dismissed_hints enable row level security;

create policy "own dismissed hints" on dismissed_hints for all
  using (auth.uid() = user_id);
