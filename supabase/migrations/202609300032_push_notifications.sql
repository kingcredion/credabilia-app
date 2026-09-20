begin;

-- Web Push subscriptions: one row per device/browser a signed-in user has opted into notifications
-- on. RLS-locked with no direct grants -- every read/write goes through a narrow RPC, matching
-- every other table in this app; only notify_push() (security definer, called only from inside
-- functions that already validated the caller has a legitimate reason to notify this recipient)
-- ever reads across users.
create table public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_endpoint is null or p_p256dh is null or p_auth is null or p_endpoint='' or length(p_endpoint)>500 then raise exception 'Invalid subscription.'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth)
    on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth;
end;$$;
revoke all on function public.save_push_subscription(text,text,text) from public,anon;
grant execute on function public.save_push_subscription(text,text,text) to authenticated;

create function public.remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  delete from public.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();
end;$$;
revoke all on function public.remove_push_subscription(text) from public,anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- The secret notify_push() sends to prove a send-push call really came from our own Postgres
-- (server-to-server, so there's no user JWT to verify instead) lives in Vault -- generated
-- in-database and encrypted at rest, never a literal in this file. Safe to run twice.
select vault.create_secret(encode(gen_random_bytes(32),'hex'), 'push_trigger_secret',
  'Shared secret notify_push() sends to the send-push edge function.')
where not exists(select 1 from vault.secrets where name='push_trigger_secret');

-- Fire-and-forget push send via pg_net -- never let a notification failure block or slow down the
-- caller's own action. Not exposed to clients; only called from functions that already checked
-- the caller has a legitimate reason to notify p_user_id.
create function public.notify_push(p_user_id uuid, p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare secret text;
begin
  if not exists(select 1 from public.push_subscriptions where user_id=p_user_id) then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='push_trigger_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/send-push',
    body:=jsonb_build_object('user_id',p_user_id,'title',p_title,'body',p_body,'url',p_url),
    headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',secret),
    timeout_milliseconds:=5000
  );
exception when others then null;
end;$$;
revoke all on function public.notify_push(uuid,text,text,text) from public,anon,authenticated;

-- Wire notify_push into the four events my_notifications() already surfaces in-app -------------

create or replace function public.send_message(p_purchase_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text; new_id uuid; new_created timestamptz; sender_name text;
  purchase public.purchases; recipient uuid; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_body);
  if clean='' or length(clean)>2000 then raise exception 'Write a message between 1 and 2000 characters.'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and (buyer_id=actor or seller_id=actor);
  if not found then raise exception 'Purchase not found.'; end if;
  insert into public.messages(purchase_id,sender_id,body) values(p_purchase_id,actor,clean) returning id,created_at into new_id,new_created;
  select display_name into sender_name from public.profiles where id=actor;
  recipient:=case when purchase.buyer_id=actor then purchase.seller_id else purchase.buyer_id end;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_push(recipient, coalesce(sender_name,'A collector')||' sent you a message', left(clean,120), '/?item='||purchase.listing_id);
  return jsonb_build_object('id',new_id,'body',clean,'created_at',new_created,'sender_id',actor,'sender_name',sender_name);
end;$$;

create or replace function public.request_refund(p_purchase_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; clean text; new_id uuid; new_created timestamptz; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_reason);
  if clean='' or length(clean)>2000 then raise exception 'Explain the issue in 1 to 2000 characters.'; end if;

  select * into purchase from public.purchases where id=p_purchase_id and buyer_id=actor;
  if not found then raise exception 'Purchase not found.'; end if;
  if purchase.escrow_status='refunded' then raise exception 'This order has already been refunded.'; end if;
  if exists(select 1 from public.refund_requests where purchase_id=p_purchase_id and status in ('pending','contested','accepted')) then
    raise exception 'A refund request is already open for this order.';
  end if;

  insert into public.refund_requests(purchase_id,buyer_id,seller_id,reason)
    values(p_purchase_id,actor,purchase.seller_id,clean)
    returning id,created_at into new_id,new_created;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_push(purchase.seller_id, 'Refund requested for "'||item_title||'"', clean, '/?item='||purchase.listing_id);
  return jsonb_build_object('id',new_id,'status','pending','reason',clean,'created_at',new_created);
end;$$;

create or replace function public.offer_partial_refund(p_request_id uuid, p_amount_cents bigint, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; purchase public.purchases; clean text; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been responded to.'; end if;
  select * into purchase from public.purchases where id=request.purchase_id;
  if p_amount_cents<=0 or p_amount_cents>=purchase.price_cents then raise exception 'Enter a partial amount less than the item price.'; end if;

  clean:=nullif(btrim(coalesce(p_response,'')),'');
  if clean is not null and length(clean)>2000 then raise exception 'Keep your response under 2000 characters.'; end if;

  update public.refund_requests set status='partial_offered', offered_amount_cents=p_amount_cents, seller_response=clean where id=p_request_id;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_push(request.buyer_id, 'Partial refund offered for "'||item_title||'"', 'A partial refund has been offered for your order.', '/?item='||purchase.listing_id);
  return jsonb_build_object('id',p_request_id,'status','partial_offered','offered_amount_cents',p_amount_cents,'seller_response',clean);
end;$$;

create or replace function public.require_return(p_request_id uuid, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; purchase public.purchases; clean text; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been responded to.'; end if;

  clean:=nullif(btrim(coalesce(p_response,'')),'');
  if clean is not null and length(clean)>2000 then raise exception 'Keep your response under 2000 characters.'; end if;

  update public.refund_requests set status='return_required', seller_response=clean where id=p_request_id;
  select * into purchase from public.purchases where id=request.purchase_id;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_push(request.buyer_id, 'Ship "'||item_title||'" back to get your refund', 'A return shipment is needed to complete your refund.', '/?item='||purchase.listing_id);
  return jsonb_build_object('id',p_request_id,'status','return_required','seller_response',clean);
end;$$;

commit;
