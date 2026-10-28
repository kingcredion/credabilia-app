-- Five new known issuers, added after the 2026-10-28 industry review (research/memorabilia-authentication-research-2026-10-28.md):
--   TAG Grading (card grading, 75), Sports Investors Authentication / SIA (game-used, 70), MeiGray Group (game-used, 70), MEARS (game-used, 72), Resolution Photomatching (game-used, 72).
-- None has a public lookup we could confirm, so each is handled exactly like Frameworth: a flat rating that already reflects "we cannot check this one", counted in full and never
-- cut to 75%, accepted with a number and no company name, shown to buyers with a plain profile, and left off the operator's "check certificates with the issuer" list (there is
-- no record to check a number against). Ratings are Credabilia's own product settings and sit between "Other" (50) and the issuers we can check (84 to 95).
begin;

alter table public.listings drop constraint certificate_details_valid;

-- A listing that named one of these as "Other" moves to the real issuer. The issuer change clears any earlier check, which does not apply to these issuers anyway.
update public.listings set certificate_issuer='tag', certificate_company=null
  where certificate_issuer='other' and lower(btrim(certificate_company)) in ('tag','tag grading','technical authentication & grading','technical authentication and grading');
update public.listings set certificate_issuer='sia', certificate_company=null
  where certificate_issuer='other' and lower(btrim(certificate_company)) in ('sia','sia photo match','sports investors authentication','sports investors');
update public.listings set certificate_issuer='meigray', certificate_company=null
  where certificate_issuer='other' and lower(btrim(certificate_company)) in ('meigray','meigray group','meigray authenticated','meigray authentication','mei gray');
update public.listings set certificate_issuer='mears', certificate_company=null
  where certificate_issuer='other' and lower(btrim(certificate_company)) in ('mears','mears authentication','mears authentications','mears online','memorabilia evaluation and research services','memorabilia evaluation & research services');
update public.listings set certificate_issuer='resolution', certificate_company=null
  where certificate_issuer='other' and lower(btrim(certificate_company)) in ('resolution','resolution photomatching','resolution photo matching','resmatch','res match');

alter table public.listings add constraint certificate_details_valid check (
  (certificate_issuer is null and certificate_number is null and certificate_company is null)
  or (certificate_issuer='fiterman' and certificate_number is null and certificate_company is null)
  or (certificate_issuer is not null and certificate_number is not null
    and certificate_issuer in ('psa','jsa','bas','sgc','cgc','uda','fanatics','steiner','tristar','mlb','frameworth','tag','sia','meigray','mears','resolution','other')
    and certificate_number ~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,79}$'
    and ((certificate_issuer='other' and certificate_company is not null and char_length(btrim(certificate_company)) between 2 and 100)
      or (certificate_issuer<>'other' and certificate_company is null)))
);

create or replace function public.certificate_rating(p_issuer text) returns integer
language sql immutable set search_path='' as $$
  select case p_issuer when 'psa' then 95 when 'jsa' then 92 when 'bas' then 93 when 'sgc' then 90 when 'cgc' then 91 when 'uda' then 88
    when 'fanatics' then 87 when 'steiner' then 85 when 'tristar' then 84 when 'mlb' then 89
    when 'tag' then 75 when 'sia' then 70 when 'meigray' then 70 when 'mears' then 72 when 'resolution' then 72
    when 'frameworth' then 65 when 'fiterman' then 55 else 50 end;
$$;

create or replace function public.certificate_credit(p_issuer text, p_number text, p_checked_at timestamptz) returns integer
language sql immutable set search_path='' as $$
  select case when p_issuer is null then 25
    when p_issuer='fiterman' then public.certificate_rating('fiterman')
    when p_number is null then 25
    when p_issuer in ('frameworth','tag','sia','meigray','mears','resolution') then public.certificate_rating(p_issuer)
    when p_checked_at is not null then public.certificate_rating(p_issuer)
    else round(public.certificate_rating(p_issuer)*0.75)::integer end;
$$;

-- At checkout, a certificate from one of these is "no record to look up", the same as Fiterman and Frameworth, not "seller reported, not yet checked".
do $patch$
declare def text; patched text;
begin
  select pg_get_functiondef('public.checkout_risk_profile(uuid,uuid)'::regprocedure) into def;
  patched:=replace(def,'l.certificate_issuer in (''fiterman'',''frameworth'')','l.certificate_issuer in (''fiterman'',''frameworth'',''tag'',''sia'',''meigray'',''mears'',''resolution'')');
  if patched=def then raise exception 'checkout_risk_profile did not contain the expected issuer list'; end if;
  execute patched;
end;
$patch$;

-- The operator's "check certificates with the issuer" list leaves them out, like Frameworth: there is nothing to check a number against.
do $patch$
declare def text; patched text;
begin
  select pg_get_functiondef('public.admin_list_certificates_to_check()'::regprocedure) into def;
  patched:=replace(def,'l.certificate_issuer<>''frameworth''','l.certificate_issuer not in (''frameworth'',''tag'',''sia'',''meigray'',''mears'',''resolution'')');
  if patched=def then raise exception 'admin_list_certificates_to_check did not contain the expected frameworth line'; end if;
  execute patched;
end;
$patch$;

commit;
