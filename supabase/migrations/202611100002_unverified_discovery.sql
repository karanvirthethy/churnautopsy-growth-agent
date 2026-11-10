-- Discover returns identity, not company enrichment. Preserve unknowns as NULL.
begin;
alter table public.companies
  alter column industry drop not null,
  alter column location drop not null,
  alter column headcount drop not null,
  alter column score drop not null;
-- Earlier Phase 1 ingestion treated undocumented fields as verified evidence.
-- Remove that unsupported metadata, but preserve identity and review decisions.
update public.companies
set industry = null, location = null, headcount = null, score = null,
    reasons = '["Unscored: legacy Discover qualification evidence is unverified", "Industry, location, employee count, B2B and SaaS business models require manual review", "Search filters are targeting criteria, not verified company attributes", "No enrichment requested; legal eligibility remains not assessed"]'::jsonb
where source = 'hunter';
comment on column public.companies.score is 'NULL means unscored, not a zero-fit company. Discover identity alone cannot establish fit.';
commit;
