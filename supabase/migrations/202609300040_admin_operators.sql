begin;

-- Real operator-role primitive, replacing the single hardcoded UUID that
-- operator_open_dispute_count() used to compare against directly. A table means every future
-- admin-only function can share one is_operator() check instead of repeating a UUID literal, and
-- a second operator account could be added later with a single insert.
create table public.operators(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.operators enable row level security;
revoke all on public.operators from public,anon,authenticated;

create function public.is_operator() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.operators where user_id=auth.uid());
$$;
revoke all on function public.is_operator() from public,anon;
grant execute on function public.is_operator() to authenticated;

-- Seed the existing operator account (previously hardcoded inline in operator_open_dispute_count).
-- Guarded by an existence check rather than a bare insert: this migration runs against the real,
-- already-populated production database (where the profile exists), but a fresh schema build --
-- a new dev environment, or these tests -- has no profiles rows yet at migration time, and the
-- FK would otherwise fail. On a fresh build, seed the operators row explicitly once that account
-- has signed in for the first time.
insert into public.operators(user_id) select 'a9028fe8-c514-47bd-a873-ccd78251783a'::uuid
where exists(select 1 from public.profiles where id='a9028fe8-c514-47bd-a873-ccd78251783a'::uuid)
on conflict do nothing;

-- Same self-gating behavior as before (null for everyone else), now backed by the operators
-- table instead of a literal UUID comparison.
create or replace function public.operator_open_dispute_count() returns integer
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then return null; end if;
  return (select count(*)::int from public.refund_requests where status='contested');
end;$$;

commit;
