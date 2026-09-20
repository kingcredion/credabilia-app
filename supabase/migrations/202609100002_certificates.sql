begin;
alter table public.listings add column certificate_issuer text,
  add column certificate_number text, add column certificate_company text;
alter table public.listings add constraint certificate_details_valid check (
  (certificate_issuer is null and certificate_number is null and certificate_company is null)
  or (certificate_issuer is not null and certificate_number is not null
    and certificate_issuer in ('psa','jsa','bas','sgc','cgc','uda','fanatics','steiner','tristar','mlb','credabilia','other')
    and certificate_number ~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,79}$'
    and ((certificate_issuer='other' and certificate_company is not null and char_length(btrim(certificate_company)) between 2 and 100)
      or (certificate_issuer<>'other' and certificate_company is null)))
);

create function public.create_listing_with_certificate(p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',p_issuer text default null,p_number text default null,p_company text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
  -- Existing function checks the authenticated actor and their selling permission.
  new_id := public.create_listing(p_title,p_description,p_category,p_price_cents,p_evidence);
  update public.listings set certificate_issuer=nullif(btrim(p_issuer),''),
    certificate_number=nullif(btrim(p_number),''),certificate_company=nullif(btrim(p_company),'') where id=new_id;
  return new_id;
end;
$$;
revoke all on function public.create_listing_with_certificate(text,text,text,bigint,text,text,text,text) from public,anon;
grant execute on function public.create_listing_with_certificate(text,text,text,bigint,text,text,text,text) to authenticated;

create function public.browse_listings_with_certificates() returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object('certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company) order by b.created_at desc,b.id),'[]'::jsonb)
from public.browse_listings() b join public.listings l on l.id=b.id;
$$;
revoke all on function public.browse_listings_with_certificates() from public;
grant execute on function public.browse_listings_with_certificates() to anon,authenticated;
commit;
