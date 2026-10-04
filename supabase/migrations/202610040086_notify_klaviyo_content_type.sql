begin;

-- Regression fix. 202609300039_klaviyo_content_type_fix.sql made notify_klaviyo send 'application/json' because pg_net
-- raises (and notify_klaviyo silently swallows) on any other Content-Type. 202610020083_klaviyo_email_properties.sql
-- rewrote the function and put 'application/vnd.api+json' back, so from 2026-10-02 no database-originated Klaviyo
-- event (Signed Up, Item Listed, Item Sold, ...) was actually sent. Same function as 083, with the header corrected.
create or replace function public.notify_klaviyo(p_email text, p_event text, p_properties jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare secret text; props jsonb:=coalesce(p_properties,'{}'::jsonb); k text;
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
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Klaviyo-API-Key '||secret,'Revision','2026-07-15'),
    timeout_milliseconds:=5000
  );
exception when others then null;
end;$$;
revoke all on function public.notify_klaviyo(text,text,jsonb) from public,anon,authenticated;

commit;
