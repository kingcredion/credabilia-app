-- Frameworth Sports Marketing (Toronto, in business since 1992) becomes a known issuer. It makes framed signed memorabilia and issues its own hologram and certificate of
-- authenticity, but it has no public lookup, so a certificate number cannot be checked against its records. It is therefore rated 65: well above "Other" (50), a little
-- below issuers we can check. Because the rating already reflects that nothing can be checked, a Frameworth number counts at its full rating and is not reduced a second
-- time to 75% the way an unchecked number from a checkable issuer is (the same idea as Fiterman Sports' flat rating).
begin;

alter table public.listings drop constraint certificate_details_valid;

-- Listings that named Frameworth as "Other" move to the real issuer. The issuer change clears any earlier check, which does not apply to Frameworth anyway.
update public.listings set certificate_issuer='frameworth', certificate_company=null
  where certificate_issuer='other' and certificate_company ilike 'frameworth%';

alter table public.listings add constraint certificate_details_valid check (
  (certificate_issuer is null and certificate_number is null and certificate_company is null)
  or (certificate_issuer='fiterman' and certificate_number is null and certificate_company is null)
  or (certificate_issuer is not null and certificate_number is not null
    and certificate_issuer in ('psa','jsa','bas','sgc','cgc','uda','fanatics','steiner','tristar','mlb','frameworth','other')
    and certificate_number ~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,79}$'
    and ((certificate_issuer='other' and certificate_company is not null and char_length(btrim(certificate_company)) between 2 and 100)
      or (certificate_issuer<>'other' and certificate_company is null)))
);

create or replace function public.certificate_rating(p_issuer text) returns integer
language sql immutable set search_path='' as $$
  select case p_issuer when 'psa' then 95 when 'jsa' then 92 when 'bas' then 93 when 'sgc' then 90 when 'cgc' then 91 when 'uda' then 88
    when 'fanatics' then 87 when 'steiner' then 85 when 'tristar' then 84 when 'mlb' then 89 when 'frameworth' then 65 when 'fiterman' then 50 else 50 end;
$$;

create or replace function public.certificate_credit(p_issuer text, p_number text, p_checked_at timestamptz) returns integer
language sql immutable set search_path='' as $$
  select case when p_issuer is null then 25
    when p_issuer='fiterman' then public.certificate_rating('fiterman')
    when p_number is null then 25
    when p_issuer='frameworth' then public.certificate_rating('frameworth')
    when p_checked_at is not null then public.certificate_rating(p_issuer)
    else round(public.certificate_rating(p_issuer)*0.75)::integer end;
$$;

-- At checkout, a Frameworth certificate is "no record to look up", the same as Fiterman, not "seller reported, not yet checked".
do $patch$
declare def text; patched text;
begin
  select pg_get_functiondef('public.checkout_risk_profile(uuid,uuid)'::regprocedure) into def;
  patched:=replace(def,'when l.certificate_issuer=''fiterman'' then ''no_record''','when l.certificate_issuer in (''fiterman'',''frameworth'') then ''no_record''');
  if patched=def then raise exception 'checkout_risk_profile did not contain the expected fiterman line'; end if;
  execute patched;
end;
$patch$;

-- The operator's "check certificates with the issuer" list leaves Frameworth out: there is nothing to check a number against, and its numbers are shared by every copy of a
-- product, so "also on N other listings" would only look like a warning.
do $patch$
declare def text; patched text;
begin
  select pg_get_functiondef('public.admin_list_certificates_to_check()'::regprocedure) into def;
  patched:=replace(def,'where l.certificate_number is not null and l.status in','where l.certificate_number is not null and l.certificate_issuer<>''frameworth'' and l.status in');
  if patched=def then raise exception 'admin_list_certificates_to_check did not contain the expected where line'; end if;
  execute patched;
end;
$patch$;

commit;
