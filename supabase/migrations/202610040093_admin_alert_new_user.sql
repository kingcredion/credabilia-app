begin;

-- Tell the operator when someone signs up. Same pattern as the other admin alerts (new dispute, new report, new support message):
-- an "Admin Alert: ..." event sent to kingcredion@credabilia.com, which a Klaviyo flow turns into an email. The function is the
-- live one (202609300038) plus this one notify_klaviyo call; the new user's own Welcome event is unchanged. notify_klaviyo never
-- raises, so an alert problem can never block a signup.
create or replace function public.bootstrap_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare shown_name text;
begin
  shown_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Collector'), 100);
  insert into public.profiles(id, display_name) values (new.id, shown_name);
  insert into public.account_permissions(user_id) values (new.id);
  insert into public.user_progress(user_id) values (new.id);
  perform public.notify_klaviyo(new.email, 'Signed Up', '{}'::jsonb);
  perform public.notify_klaviyo('kingcredion@credabilia.com', 'Admin Alert: New User', jsonb_build_object(
    'user_email', new.email, 'display_name', shown_name,
    'provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    'signed_up_at', to_char(new.created_at at time zone 'America/Los_Angeles', 'Mon DD, YYYY HH12:MI AM')||' PT'));
  return new;
end;
$$;

commit;
