-- Apply once, only to the dedicated Growth Agent project. Existing companies are untouched.
begin;
create table public.growth_runtime (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  state jsonb,
  updated_at timestamptz not null default now(),
  check (state is null or (jsonb_typeof(state)='object' and state->>'schema'='1'))
);
insert into public.growth_runtime(id) values(1);
create table public.growth_audit (
  id uuid primary key,
  occurred_at timestamptz not null,
  action text not null,
  entity_id text not null,
  detail text not null
);
alter table public.growth_runtime enable row level security;
alter table public.growth_audit enable row level security;
revoke all on public.growth_runtime, public.growth_audit from anon, authenticated;
grant select on public.growth_runtime, public.growth_audit to service_role;
-- Compare-and-swap serializes queue claims, credit reservations, and outbox transitions.
-- No external API is ever called within this database transaction.
create function public.growth_compare_and_swap(expected_revision bigint, next_state jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare previous jsonb; current_revision bigint;
begin
  select revision,state into current_revision,previous from public.growth_runtime where id=1 for update;
  if current_revision <> expected_revision then return false; end if;
  if not coalesce(next_state->>'schema' = '1' and jsonb_typeof(next_state->'suppressions') = 'object'
     and jsonb_typeof(next_state->'jobs') = 'array' and jsonb_typeof(next_state->'audit') = 'array'
     and jsonb_typeof(next_state->'contacts') = 'array' and jsonb_typeof(next_state->'messages') = 'array'
     and jsonb_typeof(next_state->'paused') = 'boolean' and jsonb_typeof(next_state->'sendingEnabled') = 'boolean', false)
     or octet_length(next_state::text) > 10000000 then
    raise exception 'Invalid automation state';
  end if;
  -- Opt-outs are permanent even if a stale writer attempts to remove one.
  if previous is not null and not ((next_state->'suppressions') @> (previous->'suppressions')) then
    raise exception 'Suppression removal prohibited';
  end if;
  update public.growth_runtime set state=next_state, revision=revision+1, updated_at=now() where id=1;
  insert into public.growth_audit(id,occurred_at,action,entity_id,detail)
    select (e->>'id')::uuid,(e->>'at')::timestamptz,e->>'action',e->>'entityId',e->>'detail'
    from jsonb_array_elements(next_state->'audit') e on conflict(id) do nothing;
  return true;
end;
$$;
revoke all on function public.growth_compare_and_swap(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.growth_compare_and_swap(bigint,jsonb) to service_role;
comment on table public.growth_runtime is 'Single-owner transactional workflow aggregate. CAS guards persistent queue, budgets, suppressions and outbox. Maximum 10 MB; archive via a reviewed migration before expanding.';
commit;
