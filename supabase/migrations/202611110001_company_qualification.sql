-- Apply ONLY this new migration to the existing Growth Agent project.
-- No existing company attributes or saved/rejected decisions are changed.
begin;
alter table public.companies add column qualification jsonb;
alter table public.companies add constraint companies_qualification_shape check (
  qualification is null or coalesce(
    jsonb_typeof(qualification) = 'object'
    and qualification->>'version' = 'rules-v1'
    and qualification->>'classification' in ('confirmed','potential','unsuitable','insufficient')
    and jsonb_typeof(qualification->'reasons') = 'array'
    and jsonb_typeof(qualification->'flags') = 'array'
    and jsonb_typeof(qualification->'evidence') = 'array'
    and jsonb_typeof(qualification->'sources') = 'array'
    and jsonb_typeof(qualification->'checkedAt') = 'string'
    and (qualification->'score' = 'null'::jsonb or
      (jsonb_typeof(qualification->'score') = 'number' and (qualification->>'score')::numeric between 0 and 100)), false)
);
comment on column public.companies.qualification is 'Versioned public-website evidence and heuristic business-model assessment; separate from human review status and legal eligibility.';
commit;
