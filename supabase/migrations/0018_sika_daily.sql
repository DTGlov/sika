-- One row per daily digest (shared across all users)
create table sika_daily_digests (
  id uuid primary key default uuid_generate_v4(),
  digest_date date not null unique,
  stories jsonb not null, -- array of story objects
  is_fallback boolean default false,
  generated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index idx_sika_daily_digests_date on sika_daily_digests(digest_date desc);

-- Per-user read tracking
create table user_daily_reads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  digest_date date not null,
  read_at timestamptz default now(),
  unique (user_id, digest_date)
);

alter table user_daily_reads enable row level security;
create policy "own daily reads" on user_daily_reads for all using (auth.uid() = user_id);

create index idx_user_daily_reads_user on user_daily_reads(user_id, digest_date desc);

-- RSS sources registry
create table sika_daily_sources (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  rss_url text not null,
  category text not null check (category in ('world_markets','africa_rising','tech_trends','young_money')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Seed initial sources
insert into sika_daily_sources (name, rss_url, category) values
  -- World markets
  ('Yahoo Finance Top Stories', 'https://finance.yahoo.com/news/rssindex', 'world_markets'),
  ('Reuters Business',          'https://feeds.reuters.com/reuters/businessNews', 'world_markets'),
  ('CNBC Top News',             'https://www.cnbc.com/id/100003114/device/rss/rss.html', 'world_markets'),

  -- Africa rising
  ('Semafor Africa',            'https://www.semafor.com/feed/africa.xml', 'africa_rising'),
  ('African Business',          'https://african.business/feed/', 'africa_rising'),
  ('Disrupt Africa',            'https://disrupt-africa.com/feed/', 'africa_rising'),
  ('TechCrunch Africa',         'https://techcrunch.com/category/africa/feed/', 'africa_rising'),

  -- Tech & trends
  ('TechCrunch',                'https://techcrunch.com/feed/', 'tech_trends'),
  ('The Verge',                 'https://www.theverge.com/rss/index.xml', 'tech_trends'),
  ('Wired Business',            'https://www.wired.com/feed/category/business/latest/rss', 'tech_trends'),

  -- Young money
  ('Forbes Business',           'https://www.forbes.com/business/feed/', 'young_money'),
  ('Bloomberg Pursuits',        'https://feeds.bloomberg.com/pursuits/news.rss', 'young_money');

-- Two-day cleanup function (run daily after new digest is generated)
create or replace function cleanup_old_digests()
returns void language plpgsql as $$
begin
  delete from sika_daily_digests
  where digest_date < (
    select digest_date
    from sika_daily_digests
    order by digest_date desc
    offset 2
    limit 1
  );
end;
$$;
