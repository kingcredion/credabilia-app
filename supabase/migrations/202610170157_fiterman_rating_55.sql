-- Fiterman Sports is rated 55 (was 50) after a review of the company: an established Houston-area business with public partnerships (WWE's official autograph partner since 2022,
-- an exclusive Mike Tyson autograph partnership announced in 2014), named leadership and a store. It stays below Frameworth (65) and the issuers whose numbers can be checked
-- because nothing it issues can be checked against a record, its process is not published, and customer reviews are mixed. Its rating is flat, as before.
begin;

create or replace function public.certificate_rating(p_issuer text) returns integer
language sql immutable set search_path='' as $$
  select case p_issuer when 'psa' then 95 when 'jsa' then 92 when 'bas' then 93 when 'sgc' then 90 when 'cgc' then 91 when 'uda' then 88
    when 'fanatics' then 87 when 'steiner' then 85 when 'tristar' then 84 when 'mlb' then 89 when 'frameworth' then 65 when 'fiterman' then 55 else 50 end;
$$;

commit;
