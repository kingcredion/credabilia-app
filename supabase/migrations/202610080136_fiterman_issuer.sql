-- Credabilia has no certificate of its own: the 'credabilia' issuer is removed. Fiterman Sports is added as an issuer that does not use
-- certificate numbers, so a listing naming it has no certificate record a buyer can look up. It is scored lower for that reason, and the
-- score text says plainly that this does not mean the item is not authentic.
begin;

alter table public.listings drop constraint certificate_details_valid;

-- The two King's Collection Mike Tyson items were entered as issuer 'credabilia' with "Fiterman Sports" typed in the number box.
update public.listings set certificate_issuer='fiterman',certificate_number=null,certificate_company=null
  where certificate_issuer='credabilia' and certificate_number='Fiterman Sports';
-- Anything else that used the removed issuer (a test listing) simply has no certificate.
update public.listings set certificate_issuer=null,certificate_number=null,certificate_company=null where certificate_issuer='credabilia';

alter table public.listings add constraint certificate_details_valid check (
  (certificate_issuer is null and certificate_number is null and certificate_company is null)
  or (certificate_issuer='fiterman' and certificate_number is null and certificate_company is null)
  or (certificate_issuer is not null and certificate_number is not null
    and certificate_issuer in ('psa','jsa','bas','sgc','cgc','uda','fanatics','steiner','tristar','mlb','other')
    and certificate_number ~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,79}$'
    and ((certificate_issuer='other' and certificate_company is not null and char_length(btrim(certificate_company)) between 2 and 100)
      or (certificate_issuer<>'other' and certificate_company is null)))
);

create or replace function public.certificate_rating(p_issuer text) returns integer
language sql immutable set search_path='' as $$
  select case p_issuer when 'psa' then 95 when 'jsa' then 92 when 'bas' then 93 when 'sgc' then 90 when 'cgc' then 91 when 'uda' then 88
    when 'fanatics' then 87 when 'steiner' then 85 when 'tristar' then 84 when 'mlb' then 89 when 'fiterman' then 50 else 50 end;
$$;

-- A certificate counts as "supplied" when it has a number, or when its issuer does not use numbers at all.
create or replace function public.browse_scored_listings(p_limit integer default 300, p_after_created_at timestamptz default null, p_after_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
with scored as (
  select b.*,l.certificate_issuer,l.certificate_number,l.certificate_company,l.signature_ai_label,l.signature_ai_note,
    exists(select 1 from public.listing_media m where m.listing_id=b.id and m.kind='signature') as signed,
    (l.certificate_issuer is not null and (l.certificate_number is not null or l.certificate_issuer='fiterman')) as certificate_supplied,
    greatest(0,least(100,
      (case when l.certificate_issuer is not null and (l.certificate_number is not null or l.certificate_issuer='fiterman')
        then public.certificate_rating(l.certificate_issuer) else 25 end)
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

-- The pre-purchase notice gets a state for "the issuer does not use certificate numbers".
alter table public.disclosure_versions drop constraint if exists disclosure_versions_certificate_state_check;
alter table public.disclosure_versions add constraint disclosure_versions_certificate_state_check
  check (certificate_state in ('none','seller_reported','issuer_checked','no_record'));
insert into public.disclosure_versions(version,certificate_state,body) values
 ('cert-2026-10-08','no_record',
  'The seller named Fiterman Sports as the source of this item''s certificate. Fiterman Sports does not use certificate numbers, so there is no certificate record attached that you can look up, and Credabilia has not checked the item. This does not mean the item is not authentic; it means there is no certificate number with a record to check. Credabilia does not authenticate items. Review the photos, the credibility score and the evidence notes before you buy. By continuing you confirm you have read this.')
on conflict (version,certificate_state) do nothing;

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
  -- A genuine certificate belongs to one item: the same number on another listing is a strong warning sign.
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

-- ---------------------------------------------------------------------------------------------------------------------------
-- Public certificate lookup: anyone can enter an issuer and a certificate number and see whether it is recorded on a Credabilia listing.
-- This confirms the number exists in OUR records (and shows if it has been used more than once); it does not say the issuer verified it.
-- Exact match only; no seller details are returned.
-- ---------------------------------------------------------------------------------------------------------------------------
create index if not exists listings_certificate_lookup on public.listings (certificate_issuer, lower(certificate_number)) where certificate_number is not null;

create function public.lookup_certificate(p_issuer text, p_number text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare iss text:=lower(btrim(coalesce(p_issuer,''))); num text:=btrim(coalesce(p_number,'')); n integer; rows jsonb;
begin
  if iss not in ('psa','jsa','bas','sgc','cgc','uda','fanatics','steiner','tristar','mlb') then raise exception 'Choose the certificate issuer.'; end if;
  if num !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,79}$' then raise exception 'Enter the certificate number as printed (letters, numbers, spaces, and . _ / - only).'; end if;
  select count(*), coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'category',l.category,'listed_at',l.created_at,
      'status',case l.status when 'active' then 'For sale' when 'pending' then 'Reserved' else 'Sold' end) order by l.created_at desc),'[]'::jsonb)
    into n, rows
    from public.listings l where l.certificate_issuer=iss and lower(l.certificate_number)=lower(num) and l.status in ('active','pending','sold');
  return jsonb_build_object('found',n>0,'count',n,'issuer',iss,'number',num,'listings',rows);
end;$$;
revoke all on function public.lookup_certificate(text,text) from public;
grant execute on function public.lookup_certificate(text,text) to anon,authenticated;

-- /certificate is the lookup page, so no seller may claim it as a store name.
create or replace function public.update_store_slug(p_slug text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=lower(btrim(p_slug));
  if clean !~ '^[a-z0-9][a-z0-9-]{2,29}$' then raise exception 'Use 3-30 characters: lowercase letters, numbers, and hyphens only.'; end if;
  if clean=any(array['auth','api','admin','app','www','static','assets','terms','privacy','legal','support','help','sell','item','img','certificate']) then raise exception 'That store name is reserved. Choose another.'; end if;
  update public.profiles set slug=clean where id=actor;
exception when unique_violation then raise exception 'That store name is already taken.';
end;$$;
revoke all on function public.update_store_slug(text) from public,anon;
grant execute on function public.update_store_slug(text) to authenticated;

commit;
