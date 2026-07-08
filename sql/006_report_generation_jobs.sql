create extension if not exists pgcrypto;

create table if not exists public.report_jobs (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  user_name text,
  property_url text not null,
  search_type text not null default 'web',
  report_type text,
  report_period text,
  start_date date,
  end_date date,
  page_contains text,
  tracked_keywords text,
  enable_ai_insights boolean default false,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  current_step text,
  input_json jsonb,
  intermediate_json jsonb default '{}'::jsonb,
  report_json jsonb,
  report_html text,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.report_jobs add column if not exists user_email text;
alter table public.report_jobs add column if not exists user_name text;
alter table public.report_jobs add column if not exists property_url text;
alter table public.report_jobs add column if not exists search_type text not null default 'web';
alter table public.report_jobs add column if not exists report_type text;
alter table public.report_jobs add column if not exists report_period text;
alter table public.report_jobs add column if not exists start_date date;
alter table public.report_jobs add column if not exists end_date date;
alter table public.report_jobs add column if not exists page_contains text;
alter table public.report_jobs add column if not exists tracked_keywords text;
alter table public.report_jobs add column if not exists enable_ai_insights boolean default false;
alter table public.report_jobs add column if not exists status text not null default 'queued';
alter table public.report_jobs add column if not exists progress integer not null default 0;
alter table public.report_jobs add column if not exists current_step text;
alter table public.report_jobs add column if not exists input_json jsonb;
alter table public.report_jobs add column if not exists intermediate_json jsonb default '{}'::jsonb;
alter table public.report_jobs add column if not exists report_json jsonb;
alter table public.report_jobs add column if not exists report_html text;
alter table public.report_jobs add column if not exists error_message text;
alter table public.report_jobs add column if not exists created_at timestamptz default now();
alter table public.report_jobs add column if not exists updated_at timestamptz default now();
alter table public.report_jobs add column if not exists started_at timestamptz;
alter table public.report_jobs add column if not exists completed_at timestamptz;

create index if not exists report_jobs_status_created_at_idx on public.report_jobs (status, created_at desc);
create index if not exists report_jobs_user_email_created_at_idx on public.report_jobs (user_email, created_at desc);
create index if not exists report_jobs_property_url_created_at_idx on public.report_jobs (property_url, created_at desc);
alter table public.report_jobs add column if not exists source_info jsonb;
alter table public.report_jobs add column if not exists filters jsonb;
alter table public.report_jobs add column if not exists ai_insights jsonb;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='report_jobs' and column_name='tracked_keywords' and data_type='ARRAY') then
    alter table public.report_jobs alter column tracked_keywords type text using array_to_string(tracked_keywords, E'\n');
  end if;
end $$;
