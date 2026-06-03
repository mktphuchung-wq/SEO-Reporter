create extension if not exists pgcrypto;

create table if not exists public.report_jobs (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  user_name text,
  property_url text,
  search_type text not null default 'web',
  report_period text not null default '30d',
  start_date date,
  end_date date,
  page_contains text,
  tracked_keywords text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  error_message text,
  report_html text,
  report_json jsonb,
  source_info jsonb,
  filters jsonb,
  ai_insights jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists report_jobs_user_email_created_at_idx
  on public.report_jobs (user_email, created_at desc);

create index if not exists report_jobs_status_created_at_idx
  on public.report_jobs (status, created_at desc);

create index if not exists report_jobs_property_url_created_at_idx
  on public.report_jobs (property_url, created_at desc);

create or replace function public.set_report_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_report_jobs_updated_at on public.report_jobs;

create trigger set_report_jobs_updated_at
before update on public.report_jobs
for each row
execute function public.set_report_jobs_updated_at();
