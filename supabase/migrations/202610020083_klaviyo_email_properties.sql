-- Gives every Klaviyo event the extra properties a designed email needs: a link to the item page, a
-- durable photo URL (credabilia.com/img/item/:id redirects to a fresh signed link -- the bucket is
-- private, so a raw signed URL in an email would die within days), and display-formatted prices.
-- Done inside notify_klaviyo() rather than at its six call sites so no other function has to change.
create or replace function public.notify_klaviyo(p_email text, p_event text, p_properties jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare secret text; props jsonb:=coalesce(p_properties,'{}'::jsonb); k text; pair text[];
begin
  if p_email is null or btrim(p_email)='' then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='klaviyo_private_api_key';
  if secret is null then return; end if;
  if jsonb_typeof(props)='object' and props ? 'listing_id' then
    props:=props||jsonb_build_object(
      'item_url','https://credabilia.com/item/'||(props->>'listing_id'),
      'image_url','https://credabilia.com/img/item/'||(props->>'listing_id'));
  end if;
  foreach k in array array['price_cents','winning_bid_cents','amount_cents'] loop
    if jsonb_typeof(props->k)='number' then
      props:=props||jsonb_build_object(replace(k,'_cents','_display'),'$'||to_char((props->>k)::numeric/100,'FM999,999,990.00'));
    end if;
  end loop;
  perform net.http_post(
    url:='https://a.klaviyo.com/api/events',
    body:=jsonb_build_object('data',jsonb_build_object('type','event','attributes',jsonb_build_object(
      'properties',props,
      'metric',jsonb_build_object('data',jsonb_build_object('type','metric','attributes',jsonb_build_object('name',p_event))),
      'profile',jsonb_build_object('data',jsonb_build_object('type','profile','attributes',jsonb_build_object('email',p_email)))
    ))),
    headers:=jsonb_build_object('Content-Type','application/vnd.api+json','Authorization','Klaviyo-API-Key '||secret,'Revision','2026-07-15'),
    timeout_milliseconds:=5000
  );
exception when others then null;
end;$$;

-- Photo lookup for the email image redirect (middleware.js). Only for listings the public could
-- already see a photo of (active, pending, sold) -- never held/needs_review/archived ones.
create function public.get_listing_photo_path(p_id uuid) returns text
language sql stable security definer set search_path='' as $$
  select (select m.path from public.listing_media m where m.listing_id=l.id and m.kind='item' order by m.position limit 1)
  from public.listings l where l.id=p_id and l.status in ('active','pending','sold');
$$;
revoke all on function public.get_listing_photo_path(uuid) from public;
grant execute on function public.get_listing_photo_path(uuid) to anon,authenticated;
