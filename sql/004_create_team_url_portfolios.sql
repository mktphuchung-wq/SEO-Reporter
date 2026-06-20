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
  email text unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  default_property_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists team_member_url_lists (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references team_members(id) on delete cascade,
  name text not null default 'Default URL List',
  property_url text not null,
  search_type text not null default 'web',
  urls_json jsonb not null default '[]'::jsonb,
  url_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists team_quarterly_jobs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references team_members(id) on delete set null,
  url_list_id uuid references team_member_url_lists(id) on delete set null,
  property_url text not null,
  search_type text not null default 'web',
  quarter_label text not null,
  current_start date not null,
  current_end date not null,
  previous_start date not null,
  previous_end date not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'partially_completed')),
  strategy text,
  total_urls integer default 0,
  total_batches integer default 0,
  completed_batches integer default 0,
  processed_urls integer default 0,
  progress integer default 0,
  warnings jsonb default '[]'::jsonb,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists team_quarterly_job_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references team_quarterly_jobs(id) on delete cascade,
  batch_index integer not null,
  start_index integer not null,
  end_index integer not null,
  url_count integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists team_quarterly_url_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references team_quarterly_jobs(id) on delete cascade,
  batch_id uuid references team_quarterly_job_batches(id) on delete set null,
  member_id uuid references team_members(id) on delete set null,
  url text not null,
  previous_clicks integer default 0,
  current_clicks integer default 0,
  click_delta integer default 0,
  click_delta_percent numeric,
  previous_impressions integer default 0,
  current_impressions integer default 0,
  impression_delta integer default 0,
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
  created_at timestamptz default now()
);

create index if not exists idx_team_members_email on team_members(email);
create index if not exists idx_team_member_url_lists_member_id on team_member_url_lists(member_id);
create index if not exists idx_team_quarterly_jobs_member_id on team_quarterly_jobs(member_id);
create index if not exists idx_team_quarterly_jobs_status on team_quarterly_jobs(status);
create index if not exists idx_team_quarterly_job_batches_job_id on team_quarterly_job_batches(job_id);
create index if not exists idx_team_quarterly_url_results_job_id on team_quarterly_url_results(job_id);
create index if not exists idx_team_quarterly_url_results_member_id on team_quarterly_url_results(member_id);
create index if not exists idx_team_quarterly_url_results_status on team_quarterly_url_results(status);

drop trigger if exists set_team_members_updated_at on team_members;
create trigger set_team_members_updated_at before update on team_members for each row execute function set_updated_at_timestamp();
drop trigger if exists set_team_member_url_lists_updated_at on team_member_url_lists;
create trigger set_team_member_url_lists_updated_at before update on team_member_url_lists for each row execute function set_updated_at_timestamp();
drop trigger if exists set_team_quarterly_jobs_updated_at on team_quarterly_jobs;
create trigger set_team_quarterly_jobs_updated_at before update on team_quarterly_jobs for each row execute function set_updated_at_timestamp();
drop trigger if exists set_team_quarterly_job_batches_updated_at on team_quarterly_job_batches;
create trigger set_team_quarterly_job_batches_updated_at before update on team_quarterly_job_batches for each row execute function set_updated_at_timestamp();
