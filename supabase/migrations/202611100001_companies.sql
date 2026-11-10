-- Apply only to a new, dedicated ChurnAutopsy Growth Agent project.
begin;
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  name text not null check (length(name) between 1 and 500),
  industry text not null,
  location text not null,
  headcount text not null,
  score smallint not null check (score between 0 and 100),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  status text not null default 'new' check (status in ('new', 'saved', 'rejected')),
  source text not null check (source in ('hunter', 'demo')),
  eligibility text not null default 'not_assessed' check (eligibility = 'not_assessed'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canonical_domain check (
    domain = lower(domain) and domain !~ '^www\.' and
    domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
  )
);
create index companies_status_created_at_idx on public.companies (status, created_at desc);
create function public.set_company_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger companies_updated_at before update on public.companies
for each row execute function public.set_company_updated_at();
-- No browser access. The private API owns authorization; only service_role has access.
alter table public.companies enable row level security;
revoke all on table public.companies from anon, authenticated;
grant select, insert, update on table public.companies to service_role;
comment on column public.companies.eligibility is 'Fit is not permission to contact. Future eligibility workflow must default to deny.';
commit;
