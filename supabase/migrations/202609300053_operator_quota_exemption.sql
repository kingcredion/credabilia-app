-- The operator account (is_operator(), 202609300040_admin_operators.sql) is used for real,
-- repeated feature testing -- the same 5/hour caps meant to bound a real seller's AI/API usage
-- were throttling that testing instead. Exempt is_operator() from all four quota checks; every
-- other account keeps the existing 5/hour behavior unchanged.

create or replace function public.consume_listing_draft() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed uuid;
begin
  if actor is null or not exists(select 1 from public.account_permissions where user_id=actor and can_sell) then raise exception 'Selling permission required' using errcode='42501';end if;
  if public.is_operator() then return; end if;
  insert into public.listing_draft_usage(user_id,window_start,attempts) values(actor,now(),1)
    on conflict(user_id) do update set window_start=case when public.listing_draft_usage.window_start<now()-interval '1 hour' then now() else public.listing_draft_usage.window_start end,
      attempts=case when public.listing_draft_usage.window_start<now()-interval '1 hour' then 1 else public.listing_draft_usage.attempts+1 end
        where public.listing_draft_usage.window_start<now()-interval '1 hour' or public.listing_draft_usage.attempts<5 returning user_id into changed;
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
  where public.background_removal_usage.window_start<now()-interval '1 hour' or public.background_removal_usage.attempts<5 returning user_id into changed;
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
  where public.certificate_read_usage.window_start<now()-interval '1 hour' or public.certificate_read_usage.attempts<5 returning user_id into changed;
  if changed is null then raise exception 'Certificate reading limit reached. Try again later.';end if;
end;$$;

create or replace function public.consume_signature_analysis() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); permitted boolean; changed uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select can_sell into permitted from public.account_permissions where user_id=actor for share;
  if permitted is distinct from true then raise exception 'Selling permission required' using errcode='42501'; end if;
  if public.is_operator() then return; end if;
  insert into public.signature_analysis_usage(user_id,window_start,attempts) values(actor,now(),1)
  on conflict(user_id) do update set window_start=case when public.signature_analysis_usage.window_start<now()-interval '1 hour' then now() else public.signature_analysis_usage.window_start end,
  attempts=case when public.signature_analysis_usage.window_start<now()-interval '1 hour' then 1 else public.signature_analysis_usage.attempts+1 end
  where public.signature_analysis_usage.window_start<now()-interval '1 hour' or public.signature_analysis_usage.attempts<5 returning user_id into changed;
  if changed is null then raise exception 'You have reached the signature analysis limit for this hour. Try again later.'; end if;
end;$$;
