-- Founding 100: an invitation-only program. Preselected sellers who verify an invited email inside the invitation window get a permanent exemption from
-- Credabilia's SELLING fee. Payment-processing charges still apply and are shown separately (see "Fees" below). Nothing here sends any message: the
-- contact list is private data that staff use to phone people; the only email involved is the sign-in code a person asks for themselves.
--
-- Privacy: the invitation list and the program tables are reachable only through the functions below (no table grants, row level security on).
-- Unclaimed invitations are deleted when the window ends or the 100 spots are gone. A claimed invitation is deleted as soon as the claim is saved.
begin;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Email matching. Lower case, no +tag; Gmail ignores dots and googlemail.com is gmail.com, so those are folded together too.
create function public.normalize_email(p_email text) returns text
language plpgsql immutable set search_path='' as $$
declare e text:=lower(btrim(coalesce(p_email,''))); local_part text; domain text; untagged text;
begin
  if e !~ '^[^@\s]+@[^@\s]+$' then return e; end if;
  local_part:=substring(e from '^(.*)@[^@]*$'); domain:=substring(e from '@([^@]*)$');
  untagged:=split_part(local_part,'+',1);
  if untagged<>'' then local_part:=untagged; end if;
  if domain in ('gmail.com','googlemail.com') then domain:='gmail.com'; local_part:=replace(local_part,'.',''); end if;
  return local_part||'@'||domain;
end;$$;

-- ---------------------------------------------------------------------------------------------------------------------------------
create table public.founding_campaign (
  id integer primary key default 1 check (id=1),
  spot_limit integer not null default 100 check (spot_limit>0),
  window_days integer not null default 90 check (window_days>0),
  started_at timestamptz,
  expires_at timestamptz,
  claimed_count integer not null default 0,           -- never goes down, even if a member later deletes their account, so the cap cannot be reopened
  invitations_loaded integer not null default 0,
  invitations_removed_unclaimed integer not null default 0,
  closed_reason text check (closed_reason in ('expired','full'))
);
insert into public.founding_campaign(id) values(1);

create table public.founding_invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  email text not null,
  contact_name text,
  business_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- The permanent entitlement. Attached to the account (user id), so changing the account's email later changes nothing. email_hash is a fingerprint,
-- not the address: enough to audit which invitation was used without keeping the contact's email.
create table public.founding_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  spot_number integer not null unique,
  claimed_at timestamptz not null default now(),
  email_hash text not null
);

alter table public.founding_campaign enable row level security;
alter table public.founding_invitations enable row level security;
alter table public.founding_members enable row level security;
revoke all on public.founding_campaign, public.founding_invitations, public.founding_members from public,anon,authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Fees. The selling fee (13.6% + 30c/40c) is waived for a Founding member. Stripe's card-processing charge is paid by Credabilia out of that fee, so
-- for a founder it is passed through instead, as its own labelled amount (about Stripe's standard 2.9% + 30c). Both are written onto the purchase at the
-- moment it is created (finalize_checkout_session), and everything downstream (the seller's payout, label cost limits, refunds) already reads that row.
create function public.founding_exempt(p_seller uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.founding_members where user_id=p_seller);
$$;
revoke all on function public.founding_exempt(uuid) from public,anon,authenticated;
grant execute on function public.founding_exempt(uuid) to service_role;

create function public.payment_processing_cents(p_price_cents bigint) returns bigint
language sql immutable set search_path='' as $$ select round(p_price_cents*0.029)+30; $$;

alter table public.purchases
  add column selling_fee_waived boolean not null default false,
  add column waived_selling_fee_cents bigint not null default 0;   -- what the selling fee would have been, for reporting only

do $patch$
declare r record; def text; patched integer:=0;
begin
  -- 1. The one place a purchase's fee is decided.
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='finalize_checkout_session' loop
    def:=pg_get_functiondef(r.oid);
    if position('fee:=public.platform_fee_cents(target.price_cents);' in def)=0 or position('declare target public.checkout_sessions;' in def)=0
       or position('update public.listings set status=''sold'' where id=target.listing_id and status=''pending'';' in def)=0 then
      raise exception 'finalize_checkout_session: the expected lines were not found';
    end if;
    def:=replace(def,'declare target public.checkout_sessions;','declare waived boolean; target public.checkout_sessions;');
    def:=replace(def,'fee:=public.platform_fee_cents(target.price_cents);',
      'waived:=public.founding_exempt(target.seller_id);'||chr(10)||
      '  fee:=case when waived then public.payment_processing_cents(target.price_cents) else public.platform_fee_cents(target.price_cents) end;');
    def:=replace(def,'update public.listings set status=''sold'' where id=target.listing_id and status=''pending'';',
      'update public.purchases set selling_fee_waived=waived,waived_selling_fee_cents=case when waived then public.platform_fee_cents(target.price_cents) else 0 end where id=new_id;'||chr(10)||
      '  update public.listings set status=''sold'' where id=target.listing_id and status=''pending'';');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'finalize_checkout_session was not found'; end if;

  -- 2. Buyers' Credion Coins are capped at the platform fee because the platform pays them. On a founder's sale the platform earns no selling fee,
  --    so nothing may be paid out of it.
  patched:=0;
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='reserve_listing_checkout' loop
    def:=pg_get_functiondef(r.oid);
    if position('public.platform_fee_cents(item.price_cents)' in def)=0 then raise exception 'reserve_listing_checkout: the coin cap line was not found'; end if;
    def:=replace(def,'public.platform_fee_cents(item.price_cents)','(case when public.founding_exempt(item.seller_id) then 0 else public.platform_fee_cents(item.price_cents) end)');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'reserve_listing_checkout was not found'; end if;

  -- 3. The monthly auditor reward pool is 5% of selling fees, so a waived sale must not feed it.
  patched:=0;
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='run_monthly_auditor_rewards' loop
    def:=pg_get_functiondef(r.oid);
    if position('select coalesce(sum(platform_fee_cents),0) into pool' in def)=0 then raise exception 'run_monthly_auditor_rewards: the pool line was not found'; end if;
    def:=replace(def,'select coalesce(sum(platform_fee_cents),0) into pool','select coalesce(sum(platform_fee_cents) filter (where not selling_fee_waived),0) into pool');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'run_monthly_auditor_rewards was not found'; end if;

  -- 4. /founding is the claim page, so nobody may take it as a store name.
  patched:=0;
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='update_store_slug' loop
    def:=pg_get_functiondef(r.oid);
    if position('''giveaway-rules''' in def)=0 then raise exception 'update_store_slug: the reserved list was not found'; end if;
    def:=replace(def,'''giveaway-rules''','''giveaway-rules'',''founding''');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'update_store_slug was not found'; end if;
end;$patch$;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Claiming. Server-enforced: the window, the cap, email verification and duplicate requests are all decided here, under a row lock, whether or not the
-- scheduled cleanup has run. Re-running it for an account that already has the benefit just reports it.
create function public.claim_founding_spot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); camp public.founding_campaign; mem public.founding_members; inv public.founding_invitations;
  auth_email text; confirmed timestamptz; norm text; spot integer;
begin
  if actor is null then raise exception 'Sign in to claim your Founding spot.' using errcode='42501'; end if;
  select * into camp from public.founding_campaign where id=1 for update;   -- one claim at a time, so two people can never take the same last spot
  select * into mem from public.founding_members where user_id=actor;
  if found then return jsonb_build_object('claimed',true,'already',true,'spot_number',mem.spot_number); end if;
  if camp.started_at is null or camp.expires_at is null then raise exception 'The Founding 100 invitation is not open yet.'; end if;
  if now()>=camp.expires_at then raise exception 'The Founding 100 invitation window has closed.'; end if;
  if camp.claimed_count>=camp.spot_limit then raise exception 'All Founding 100 spots have been claimed.'; end if;
  select email,email_confirmed_at into auth_email,confirmed from auth.users where id=actor;
  if confirmed is null then raise exception 'Verify your email address first.'; end if;
  norm:=public.normalize_email(auth_email);
  select * into inv from public.founding_invitations where email_normalized=norm;
  if not found then raise exception 'There is no Founding 100 invitation for this email address.'; end if;

  spot:=camp.claimed_count+1;
  insert into public.founding_members(user_id,spot_number,email_hash) values(actor,spot,encode(sha256(convert_to(norm,'UTF8')),'hex'));
  delete from public.founding_invitations where id=inv.id;                  -- the claimed contact's details are gone as soon as the entitlement is saved
  update public.founding_campaign set claimed_count=spot where id=1;
  if spot>=camp.spot_limit then                                             -- full: nobody else can claim, so the rest of the list is deleted now
    with gone as (delete from public.founding_invitations returning 1)
    update public.founding_campaign set invitations_removed_unclaimed=invitations_removed_unclaimed+(select count(*) from gone), closed_reason='full' where id=1;
  end if;
  return jsonb_build_object('claimed',true,'already',false,'spot_number',spot);
end;$$;
revoke all on function public.claim_founding_spot() from public,anon;
grant execute on function public.claim_founding_spot() to authenticated;

-- What the signed-in person's own page needs. "invited" is only ever about their own verified email.
create function public.founding_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); camp public.founding_campaign; mem public.founding_members; auth_email text; confirmed timestamptz; is_open boolean; invited boolean:=false;
begin
  if actor is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  select * into camp from public.founding_campaign where id=1;
  select * into mem from public.founding_members where user_id=actor;
  is_open:=camp.started_at is not null and camp.expires_at is not null and now()<camp.expires_at and camp.claimed_count<camp.spot_limit;
  if mem.user_id is null and is_open then
    select email,email_confirmed_at into auth_email,confirmed from auth.users where id=actor;
    invited:=confirmed is not null and exists(select 1 from public.founding_invitations where email_normalized=public.normalize_email(auth_email));
  end if;
  return jsonb_build_object('member',mem.user_id is not null,'spot_number',mem.spot_number,'open',is_open,'invited',invited,
    'spots_left',case when is_open then camp.spot_limit-camp.claimed_count end,'expires_at',case when is_open then camp.expires_at end);
end;$$;
revoke all on function public.founding_status() from public,anon;
grant execute on function public.founding_status() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Cleanup. Deletes only invitations. It never touches an account or a claimed entitlement. Claiming enforces the window itself, so this running late is harmless.
create function public.purge_expired_founding_invitations() returns integer
language plpgsql security definer set search_path='' as $$
declare camp public.founding_campaign; removed integer:=0;
begin
  select * into camp from public.founding_campaign where id=1 for update;
  if camp.expires_at is null or now()<camp.expires_at then return 0; end if;
  with gone as (delete from public.founding_invitations returning 1) select count(*) into removed from gone;
  update public.founding_campaign set invitations_removed_unclaimed=invitations_removed_unclaimed+removed, closed_reason=coalesce(closed_reason,'expired') where id=1;
  return removed;
end;$$;
revoke all on function public.purge_expired_founding_invitations() from public,anon,authenticated;
grant execute on function public.purge_expired_founding_invitations() to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Staff only (operators).
create function public.admin_start_founding_campaign() returns jsonb
language plpgsql security definer set search_path='' as $$
declare camp public.founding_campaign;
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  select * into camp from public.founding_campaign where id=1 for update;
  if camp.started_at is not null then raise exception 'The campaign has already started.'; end if;
  update public.founding_campaign set started_at=now(), expires_at=now()+make_interval(days=>window_days) where id=1 returning * into camp;
  return jsonb_build_object('started_at',camp.started_at,'expires_at',camp.expires_at,'window_days',camp.window_days,'spot_limit',camp.spot_limit);
end;$$;
revoke all on function public.admin_start_founding_campaign() from public,anon;
grant execute on function public.admin_start_founding_campaign() to authenticated;

-- p_rows: [{ "email": "...", "name": "...", "business": "...", "phone": "..." }]. Normalises, skips bad addresses, duplicates and anyone who already claimed.
create function public.admin_founding_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare camp public.founding_campaign; r jsonb; norm text; added integer:=0; duplicates integer:=0; invalid integer:=0; already_members integer:=0; n integer;
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'Send a list of invitations.'; end if;
  select * into camp from public.founding_campaign where id=1 for update;
  if camp.closed_reason is not null or (camp.expires_at is not null and now()>=camp.expires_at) then raise exception 'The campaign is closed; invitations can no longer be added.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    norm:=public.normalize_email(r->>'email');
    if norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then invalid:=invalid+1; continue; end if;
    if exists(select 1 from public.founding_members where email_hash=encode(sha256(convert_to(norm,'UTF8')),'hex')) then already_members:=already_members+1; continue; end if;
    insert into public.founding_invitations(email_normalized,email,contact_name,business_name,phone)
      values(norm,btrim(r->>'email'),nullif(btrim(coalesce(r->>'name','')),''),nullif(btrim(coalesce(r->>'business','')),''),nullif(btrim(coalesce(r->>'phone','')),''))
      on conflict (email_normalized) do nothing;
    get diagnostics n=row_count;
    if n=1 then added:=added+1; else duplicates:=duplicates+1; end if;
  end loop;
  update public.founding_campaign set invitations_loaded=invitations_loaded+added where id=1;
  return jsonb_build_object('added',added,'duplicates',duplicates,'invalid',invalid,'already_members',already_members);
end;$$;
revoke all on function public.admin_founding_import(jsonb) from public,anon;
grant execute on function public.admin_founding_import(jsonb) to authenticated;

create function public.admin_founding_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare camp public.founding_campaign;
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  select * into camp from public.founding_campaign where id=1;
  return jsonb_build_object(
    'started_at',camp.started_at,'expires_at',camp.expires_at,'window_days',camp.window_days,'spot_limit',camp.spot_limit,'closed_reason',camp.closed_reason,
    'invitations_loaded',camp.invitations_loaded,'invitations_open',(select count(*) from public.founding_invitations),
    'claimed',camp.claimed_count,'spots_left',greatest(camp.spot_limit-camp.claimed_count,0),'removed_unclaimed',camp.invitations_removed_unclaimed,
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.display_name,'spot_number',m.spot_number,'claimed_at',m.claimed_at,
                           'email',u.email,'providers',coalesce(u.raw_app_meta_data->'providers',to_jsonb(array[coalesce(u.raw_app_meta_data->>'provider','email')])),
                           'apple_hidden_email',coalesce(u.email ilike '%@privaterelay.appleid.com',false)) order by m.spot_number)
                         from public.founding_members m left join public.profiles p on p.id=m.user_id left join auth.users u on u.id=m.user_id),'[]'::jsonb));
end;$$;
revoke all on function public.admin_founding_overview() from public,anon;
grant execute on function public.admin_founding_overview() to authenticated;

create function public.admin_founding_invitations(p_search text default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(x)) from (
    select business_name,contact_name,phone,email from public.founding_invitations
    where p_search is null or btrim(p_search)='' or business_name ilike '%'||btrim(p_search)||'%' or contact_name ilike '%'||btrim(p_search)||'%' or email ilike '%'||btrim(p_search)||'%' or phone ilike '%'||btrim(p_search)||'%'
    order by business_name nulls last,email limit least(greatest(coalesce(p_limit,100),1),500)) x),'[]'::jsonb);
end;$$;
revoke all on function public.admin_founding_invitations(text,integer) from public,anon;
grant execute on function public.admin_founding_invitations(text,integer) to authenticated;

commit;
