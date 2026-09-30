-- Raise the per-user hourly caps on AI listing drafts, background removal, certificate reads, and
-- signature analysis from 5 to 40. The 5/hour figure was set long before bulk listing existed --
-- a seller publishing a stack of items in one sitting (photographing a haul, working through it
-- via Bulk list items) would hit it after their 5th item, which isn't a real abuse case, just the
-- normal shape of bulk listing now. The operator account's full exemption (is_operator(), see
-- 202609300053_operator_quota_exemption.sql) is unchanged -- this only affects the numeric cap that
-- applies to every other account, including the same account when it later loses operator status.
-- Same four functions, same shape, only the `<5` -> `<40` comparisons change. Each usage table also
-- has its own `attempts between 1 and 5` check constraint from when it was first created -- without
-- raising these too, the functions above would still be blocked at 5 by the table itself once the
-- window's row already exists, even though the function's own WHERE clause now allows up to 40.
-- Guarded by to_regclass so this migration stays a no-op for any of the four tables a given
-- PGlite test fixture didn't happen to load, rather than forcing every test that touches any one
-- of these four functions to also load the other three tables' migrations.
do $$ begin
  if to_regclass('public.listing_draft_usage') is not null then
    execute 'alter table public.listing_draft_usage drop constraint listing_draft_usage_attempts_check';
    execute 'alter table public.listing_draft_usage add constraint listing_draft_usage_attempts_check check(attempts between 1 and 40)';
  end if;
  if to_regclass('public.background_removal_usage') is not null then
    execute 'alter table public.background_removal_usage drop constraint background_removal_usage_attempts_check';
    execute 'alter table public.background_removal_usage add constraint background_removal_usage_attempts_check check(attempts between 1 and 40)';
  end if;
  if to_regclass('public.certificate_read_usage') is not null then
    execute 'alter table public.certificate_read_usage drop constraint certificate_read_usage_attempts_check';
    execute 'alter table public.certificate_read_usage add constraint certificate_read_usage_attempts_check check(attempts between 1 and 40)';
  end if;
  if to_regclass('public.signature_analysis_usage') is not null then
    execute 'alter table public.signature_analysis_usage drop constraint signature_analysis_usage_attempts_check';
    execute 'alter table public.signature_analysis_usage add constraint signature_analysis_usage_attempts_check check(attempts between 1 and 40)';
  end if;
end $$;

create or replace function public.consume_listing_draft() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed uuid;
begin
  if actor is null or not exists(select 1 from public.account_permissions where user_id=actor and can_sell) then raise exception 'Selling permission required' using errcode='42501';end if;
  if public.is_operator() then return; end if;
  insert into public.listing_draft_usage(user_id,window_start,attempts) values(actor,now(),1)
    on conflict(user_id) do update set window_start=case when public.listing_draft_usage.window_start<now()-interval '1 hour' then now() else public.listing_draft_usage.window_start end,
      attempts=case when public.listing_draft_usage.window_start<now()-interval '1 hour' then 1 else public.listing_draft_usage.attempts+1 end
        where public.listing_draft_usage.window_start<now()-interval '1 hour' or public.listing_draft_usage.attempts<40 returning user_id into changed;
  if changed is null then raise exception 'Listing draft limit reached. Try again later.';end if;
end;$$;

create or replace function public.consume_background_removal() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed uuid;
begin
  if actor is null or not exists(select 1 from public.account_permissions where user_id=actor and can_sell) then raise exception 'Selling permission required' using errcode='42501';end if;
  if public.is_operator() then return; end if;
  insert into public.background_removal_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.background_removal_usage.window_start<now()-interval '1 hour' then now() else public.background_removal_usage.window_start end,
  attempts=case when public.background_removal_usage.window_start<now()-interval '1 hour' then 1 else public.background_removal_usage.attempts+1 end
  where public.background_removal_usage.window_start<now()-interval '1 hour' or public.background_removal_usage.attempts<40 returning user_id into changed;
  if changed is null then raise exception 'Background removal limit reached. Try again later.';end if;
end;$$;

create or replace function public.consume_certificate_read() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed uuid;
begin
  if actor is null or not exists(select 1 from public.account_permissions where user_id=actor and can_sell) then raise exception 'Selling permission required' using errcode='42501';end if;
  if public.is_operator() then return; end if;
  insert into public.certificate_read_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.certificate_read_usage.window_start<now()-interval '1 hour' then now() else public.certificate_read_usage.window_start end,
  attempts=case when public.certificate_read_usage.window_start<now()-interval '1 hour' then 1 else public.certificate_read_usage.attempts+1 end
  where public.certificate_read_usage.window_start<now()-interval '1 hour' or public.certificate_read_usage.attempts<40 returning user_id into changed;
  if changed is null then raise exception 'Certificate reading limit reached. Try again later.';end if;
end;$$;

-- consume_signature_analysis's LATEST body is actually 202609300056_auto_signature_opinion.sql's
-- (not 202609300053's, which this migration's other three functions build on) -- 056 relaxed the
-- permission check to can_sell-or-can_audit and, in doing so, dropped the is_operator() exemption
-- 053 had added. This keeps that exact current behavior (no operator exemption re-added here --
-- that's a separate, pre-existing gap, not something to silently change as a side effect of a
-- quota-number bump) and only raises the numeric cap.
create or replace function public.consume_signature_analysis() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); can_sell_perm boolean; can_audit_perm boolean; changed uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select can_sell, can_audit into can_sell_perm, can_audit_perm from public.account_permissions where user_id=actor for share;
  if coalesce(can_sell_perm,false)=false and coalesce(can_audit_perm,false)=false then raise exception 'Selling or auditing permission required' using errcode='42501'; end if;
  insert into public.signature_analysis_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.signature_analysis_usage.window_start<now()-interval '1 hour' then now() else public.signature_analysis_usage.window_start end,
  attempts=case when public.signature_analysis_usage.window_start<now()-interval '1 hour' then 1 else public.signature_analysis_usage.attempts+1 end
  where public.signature_analysis_usage.window_start<now()-interval '1 hour' or public.signature_analysis_usage.attempts<40 returning user_id into changed;
  if changed is null then raise exception 'You have reached the signature analysis limit for this hour. Try again later.'; end if;
end;$$;
