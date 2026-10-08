-- Option A: a certificate number nobody has checked counts at 75% of the issuer's rating; one an operator has confirmed with the issuer counts in full.
-- Fiterman Sports (no numbers, nothing to check) stays at its flat rating, and no certificate stays at 25.
begin;

alter table public.listings add column certificate_checked_at timestamptz, add column certificate_checked_by uuid references public.profiles(id) on delete set null;

-- Changing the issuer or the number on a listing wipes any earlier check: the new number has not been confirmed.
create function public.reset_certificate_check() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.certificate_issuer is distinct from old.certificate_issuer or new.certificate_number is distinct from old.certificate_number then
    new.certificate_checked_at:=null; new.certificate_checked_by:=null;
  end if;
  return new;
end;$$;
create trigger listings_reset_certificate_check before update on public.listings for each row execute function public.reset_certificate_check();

create function public.certificate_credit(p_issuer text, p_number text, p_checked_at timestamptz) returns integer
language sql immutable set search_path='' as $$
  select case when p_issuer is null then 25
    when p_issuer='fiterman' then public.certificate_rating('fiterman')
    when p_number is null then 25
    when p_checked_at is not null then public.certificate_rating(p_issuer)
    else round(public.certificate_rating(p_issuer)*0.75)::integer end;
$$;

create or replace function public.browse_scored_listings(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
with scored as (
  select b.*,l.certificate_issuer,l.certificate_number,l.certificate_company,l.certificate_checked_at,l.signature_ai_label,l.signature_ai_note,
    exists(select 1 from public.listing_media m where m.listing_id=b.id and m.kind='signature') as signed,
    (l.certificate_issuer is not null and (l.certificate_number is not null or l.certificate_issuer='fiterman')) as certificate_supplied,
    greatest(0,least(100,
      public.certificate_credit(l.certificate_issuer,l.certificate_number,l.certificate_checked_at)
      + (case l.signature_ai_label when 'consistent' then 5 when 'concerns' then -15 else 0 end)
    )) as certificate_score,
    round((250+coalesce((select sum(case a.verdict when 'authentic' then 100 when 'uncertain' then 50 else 0 end)
      from public.audits a where a.listing_id=b.id),0))::numeric/(5+b.audit_count))::integer as community_score,
    case when b.audit_count<10 then 80 when b.audit_count<25 then 65 when b.audit_count<100 then 50 else 35 end as certificate_weight
  from public.browse_listings(p_limit,p_after_created_at,p_after_id) b join public.listings l on l.id=b.id
)
select coalesce(jsonb_agg(
  case when s.signed then
    (to_jsonb(s) - 'signed') || jsonb_build_object(
      'community_weight',100-s.certificate_weight,'credibility_audit_count',s.audit_count,
      'credibility_score',round((s.certificate_score*s.certificate_weight+s.community_score*(100-s.certificate_weight))::numeric/100)::integer
    )
  else
    (to_jsonb(s) - 'signed' - 'certificate_score' - 'community_score' - 'certificate_weight' - 'certificate_supplied')
  end
  order by s.created_at desc,s.id desc
),'[]'::jsonb) from scored s;
$$;
revoke all on function public.browse_scored_listings(integer,timestamptz,uuid) from public;
grant execute on function public.browse_scored_listings(integer,timestamptz,uuid) to anon,authenticated;

-- A checked certificate no longer needs the "not checked" notice at checkout.
create or replace function public.checkout_risk_profile(p_listing_id uuid, p_buyer_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  l public.listings; state text; is_signed boolean; tier text; prior integer; flags text[]:='{}'; pts integer:=0; lvl text;
  high_value_cents constant bigint:=50000; first_buy_cents constant bigint:=25000;
begin
  select * into l from public.listings where id=p_listing_id;
  if not found then raise exception 'Listing not found.'; end if;
  state:=case when l.certificate_issuer is null and not exists(select 1 from public.listing_media m where m.listing_id=l.id and m.kind='certificate') then 'none'
              when l.certificate_issuer='fiterman' then 'no_record'
              when l.certificate_checked_at is not null and l.certificate_number is not null then 'issuer_checked'
              else 'seller_reported' end;
  is_signed:=exists(select 1 from public.listing_media m where m.listing_id=l.id and m.kind='signature') or l.signature_ai_label is not null;
  tier:=public.seller_payout_tier(l.seller_id,l.price_cents,false)->>'tier';
  select count(*) into prior from public.purchases where buyer_id=p_buyer_id;

  if l.price_cents>=high_value_cents then flags:=array_append(flags,'high_value'); pts:=pts+2; end if;
  if state='none' then flags:=array_append(flags,'no_certificate'); pts:=pts+2;
  elsif state='no_record' then flags:=array_append(flags,'cert_no_record'); pts:=pts+1;
  elsif state='seller_reported' then flags:=array_append(flags,'cert_unchecked'); pts:=pts+1; end if;
  if is_signed and state<>'issuer_checked' then flags:=array_append(flags,'signed_unverified'); pts:=pts+1; end if;
  if tier in ('new','flagged') then flags:=array_append(flags,'new_seller'); pts:=pts+1; end if;
  if prior=0 and l.price_cents>=first_buy_cents then flags:=array_append(flags,'new_buyer_high_value'); pts:=pts+2; end if;
  if l.certificate_number is not null and exists(select 1 from public.listings o where o.id<>l.id and o.certificate_issuer=l.certificate_issuer
      and lower(o.certificate_number)=lower(l.certificate_number) and o.status in ('active','pending','sold')) then flags:=array_append(flags,'cert_number_reused'); pts:=pts+2; end if;
  if l.authenticity_attested_at is null then flags:=array_append(flags,'no_seller_attestation'); end if;

  lvl:=case when pts>=4 then 'high' when pts>=2 then 'elevated' else 'normal' end;
  return jsonb_build_object(
    'price_cents',l.price_cents,'certificate_state',state,'signed',is_signed,'seller_tier',tier,'prior_purchases',prior,
    'flags',to_jsonb(flags),'level',lvl,
    'requires_disclosure',state<>'issuer_checked','disclosure_version','cert-2026-10-08',
    'signature_required',l.price_cents>=high_value_cents,
    'require_3ds',l.price_cents>=high_value_cents or lvl='high');
end;$$;
revoke all on function public.checkout_risk_profile(uuid,uuid) from public,anon,authenticated;
grant execute on function public.checkout_risk_profile(uuid,uuid) to service_role;

-- Operator tools: see the numbered certificates on live listings, open the issuer's lookup, and mark one checked (or undo it).
create function public.admin_list_certificates_to_check() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'listing_id',l.id,'title',l.title,'status',l.status,'issuer',l.certificate_issuer,'number',l.certificate_number,'company',l.certificate_company,
      'checked_at',l.certificate_checked_at,
      'also_on',(select count(*) from public.listings o where o.id<>l.id and o.certificate_issuer=l.certificate_issuer and lower(o.certificate_number)=lower(l.certificate_number)
        and o.status in ('active','pending','sold'))
    ) order by (l.certificate_checked_at is not null), l.created_at desc)
    from public.listings l where l.certificate_number is not null and l.status in ('active','pending')),'[]'::jsonb);
end;$$;
revoke all on function public.admin_list_certificates_to_check() from public,anon;
grant execute on function public.admin_list_certificates_to_check() to authenticated;

create function public.admin_set_certificate_checked(p_listing_id uuid, p_checked boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.listings where id=p_listing_id and certificate_number is not null) then raise exception 'That listing has no certificate number to check.'; end if;
  update public.listings set certificate_checked_at=case when p_checked then now() end, certificate_checked_by=case when p_checked then auth.uid() end where id=p_listing_id;
end;$$;
revoke all on function public.admin_set_certificate_checked(uuid,boolean) from public,anon;
grant execute on function public.admin_set_certificate_checked(uuid,boolean) to authenticated;

commit;
