begin;

-- Supabase's pg_net extension hard-rejects any net.http_post() call whose Content-Type header
-- isn't literally 'application/json' (see net.http_post's own source: it raises an exception
-- rather than sending the request). notify_klaviyo (202609300038_klaviyo_events.sql) sent
-- 'application/vnd.api+json' per Klaviyo's documented content type, which pg_net always rejected
-- before the request ever left Postgres -- silently, since notify_klaviyo swallows all errors.
-- Confirmed live that Klaviyo's Events API still returns 202 when sent as 'application/json'
-- instead, so this only changes the header value, not the request body/shape.
create or replace function public.notify_klaviyo(p_email text, p_event text, p_properties jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare secret text;
begin
  if p_email is null or btrim(p_email)='' then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='klaviyo_private_api_key';
  if secret is null then return; end if;
  perform net.http_post(
    url:='https://a.klaviyo.com/api/events',
    body:=jsonb_build_object('data',jsonb_build_object('type','event','attributes',jsonb_build_object(
      'properties',p_properties,
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
