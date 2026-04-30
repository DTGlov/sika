create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz default now() not null,
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "users can view own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "users can insert own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "users can delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
