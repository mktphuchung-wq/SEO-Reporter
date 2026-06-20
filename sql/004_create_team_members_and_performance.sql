create extension if not exists pgcrypto;

create or replace function set_updated_at_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  default_property_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_member_url_lists (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  name text not null default 'Default URL List',
  property_url text not null,
  search_type text not null default 'web' check (search_type in ('web', 'image', 'video', 'news', 'discover', 'googleNews')),
  urls_json jsonb not null default '[]'::jsonb,
  url_count integer not null default 0 check (url_count >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Tracking table strategy:
-- Keep the existing team_quarterly_* tables as the source of truth for the
-- current quarterly runner and result routes. The team_tracking_* tables below
-- are added for the requested tracking nomenclature and future monthly/custom
-- tracking work; they intentionally do not replace or rename team_quarterly_*
-- so src/db/teamQuarterlyJobs.js and src/services/teamQuarterlyRunner.js keep
-- working without a data migration. Until dedicated tracking runners and result
-- routes are introduced, team_performance aggregates completed quarterly output
-- from team_quarterly_* and UI links should continue to target
-- /team/quarterly-jobs/:jobId/results.

create table if not exists team_tracking_jobs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references team_members(id) on delete set null,
  url_list_id uuid references team_member_url_lists(id) on delete set null,
  job_type text not null default 'quarterly' check (job_type in ('quarterly', 'monthly', 'custom')),
  property_url text not null,
  search_type text not null default 'web' check (search_type in ('web', 'image', 'video', 'news', 'discover', 'googleNews')),
  period_label text not null,
  current_start date not null,
  current_end date not null,
  previous_start date not null,
  previous_end date not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'partially_completed', 'cancelled')),
  strategy text,
  total_urls integer not null default 0 check (total_urls >= 0),
  total_batches integer not null default 0 check (total_batches >= 0),
  completed_batches integer not null default 0 check (completed_batches >= 0),
  processed_urls integer not null default 0 check (processed_urls >= 0),
  progress integer not null default 0 check (progress between 0 and 100),
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists team_tracking_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references team_tracking_jobs(id) on delete cascade,
  batch_index integer not null check (batch_index >= 0),
  start_index integer not null check (start_index >= 0),
  end_index integer not null check (end_index >= start_index),
  url_count integer not null default 0 check (url_count >= 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists team_tracking_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references team_tracking_jobs(id) on delete cascade,
  batch_id uuid references team_tracking_batches(id) on delete set null,
  member_id uuid references team_members(id) on delete set null,
  url text not null,
  previous_clicks integer not null default 0,
  current_clicks integer not null default 0,
  click_delta integer not null default 0,
  click_delta_percent numeric,
  previous_impressions integer not null default 0,
  current_impressions integer not null default 0,
  impression_delta integer not null default 0,
  impression_delta_percent numeric,
  previous_ctr numeric,
  current_ctr numeric,
  previous_position numeric,
  current_position numeric,
  position_delta numeric,
  match_type_previous text,
  match_type_current text,
  status text,
  insight text,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_members_email on team_members(email);
create index if not exists idx_team_members_status on team_members(status);
create index if not exists idx_team_members_role on team_members(role);

create index if not exists idx_team_member_url_lists_member_id on team_member_url_lists(member_id);
create index if not exists idx_team_member_url_lists_status on team_member_url_lists(status);
create index if not exists idx_team_member_url_lists_property_url on team_member_url_lists(property_url);

create index if not exists idx_team_tracking_jobs_member_id on team_tracking_jobs(member_id);
create index if not exists idx_team_tracking_jobs_status on team_tracking_jobs(status);
create index if not exists idx_team_tracking_jobs_created_at on team_tracking_jobs(created_at);

create index if not exists idx_team_tracking_batches_job_id on team_tracking_batches(job_id);
create index if not exists idx_team_tracking_batches_status on team_tracking_batches(status);

create index if not exists idx_team_tracking_results_job_id on team_tracking_results(job_id);
create index if not exists idx_team_tracking_results_member_id on team_tracking_results(member_id);
create index if not exists idx_team_tracking_results_status on team_tracking_results(status);

create or replace view team_performance as
select
  m.id,
  m.name,
  m.email,
  m.role,
  m.status,
  m.default_property_url,
  coalesce(u.url_count, 0)::int as url_count,
  j.id as latest_job_id,
  j.quarter_label as latest_period,
  j.quarter_label as latest_quarter,
  j.status as last_job_status,
  coalesce(s.previous_clicks, 0)::int as previous_clicks,
  coalesce(s.current_clicks, 0)::int as current_clicks,
  coalesce(s.click_delta, 0)::int as click_delta,
  coalesce(s.previous_impressions, 0)::int as previous_impressions,
  coalesce(s.current_impressions, 0)::int as current_impressions,
  coalesce(s.impression_delta, 0)::int as impression_delta,
  coalesce(s.growing_urls, 0)::int as growing_urls,
  coalesce(s.declining_urls, 0)::int as declining_urls,
  coalesce(s.new_traffic, 0)::int as new_traffic,
  coalesce(s.lost_traffic, 0)::int as lost_traffic,
  m.created_at,
  m.updated_at
from team_members m
left join lateral (
  select coalesce(sum(url_count), 0) as url_count
  from team_member_url_lists
  where member_id = m.id and status = 'active'
) u on true
left join lateral (
  select *
  from team_quarterly_jobs
  where member_id = m.id and status in ('completed', 'partially_completed')
  order by coalesce(completed_at, updated_at, created_at) desc, created_at desc
  limit 1
) j on true
left join lateral (
  select
    coalesce(sum(previous_clicks), 0) as previous_clicks,
    coalesce(sum(current_clicks), 0) as current_clicks,
    coalesce(sum(click_delta), 0) as click_delta,
    coalesce(sum(previous_impressions), 0) as previous_impressions,
    coalesce(sum(current_impressions), 0) as current_impressions,
    coalesce(sum(impression_delta), 0) as impression_delta,
    count(*) filter (where status = 'Growing') as growing_urls,
    count(*) filter (where status = 'Declining') as declining_urls,
    count(*) filter (where status = 'New traffic') as new_traffic,
    count(*) filter (where status = 'Lost traffic') as lost_traffic
  from team_quarterly_url_results
  where job_id = j.id
) s on true;

drop trigger if exists set_team_members_updated_at on team_members;
create trigger set_team_members_updated_at before update on team_members for each row execute function set_updated_at_timestamp();

drop trigger if exists set_team_member_url_lists_updated_at on team_member_url_lists;
create trigger set_team_member_url_lists_updated_at before update on team_member_url_lists for each row execute function set_updated_at_timestamp();

drop trigger if exists set_team_tracking_jobs_updated_at on team_tracking_jobs;
create trigger set_team_tracking_jobs_updated_at before update on team_tracking_jobs for each row execute function set_updated_at_timestamp();

drop trigger if exists set_team_tracking_batches_updated_at on team_tracking_batches;
create trigger set_team_tracking_batches_updated_at before update on team_tracking_batches for each row execute function set_updated_at_timestamp();

-- Optional local seed data for development only. Do not execute in production.
-- insert into team_members (name, email, role, status)
-- values
--   ('Team Member 1', 'member1@example.com', 'member', 'active'),
--   ('Team Member 2', 'member2@example.com', 'member', 'active'),
--   ('Team Member 3', 'member3@example.com', 'member', 'active'),
--   ('Team Member 4', 'member4@example.com', 'member', 'active')
-- on conflict (email) do nothing;
