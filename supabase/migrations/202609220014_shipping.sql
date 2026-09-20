begin;

-- Saved shipping address (profile) --------------------------------------------------------
-- One JSON object per user: used as "ship from" when selling, pre-fills "ship to" when buying.

alter table public.profiles add column shipping_address jsonb;

create function public.save_shipping_address(p_address jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if coalesce(btrim(p_address->>'name'),'')='' or coalesce(btrim(p_address->>'street1'),'')='' or coalesce(btrim(p_address->>'city'),'')=''
     or coalesce(btrim(p_address->>'state'),'')='' or coalesce(btrim(p_address->>'zip'),'')='' or coalesce(btrim(p_address->>'country'),'')='' then
    raise exception 'Fill in all required address fields.';
  end if;
  update public.profiles set shipping_address=p_address where id=actor;
end;$$;
revoke all on function public.save_shipping_address(jsonb) from public,anon;
grant execute on function public.save_shipping_address(jsonb) to authenticated;

-- Buyer's chosen address for one order (editable per order, not just the saved default) --------

alter table public.checkout_sessions add column shipping_address jsonb;

-- reserve_listing_checkout now requires a shipping address for this order; the (uuid) signature
-- is replaced rather than overloaded so the old, address-less call path can no longer be used.
drop function public.reserve_listing_checkout(uuid);

create function public.reserve_listing_checkout(p_listing_id uuid, p_shipping_address jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; seller_account public.stripe_accounts; new_id uuid; updated integer;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;
  if coalesce(btrim(p_shipping_address->>'name'),'')='' or coalesce(btrim(p_shipping_address->>'street1'),'')='' or coalesce(btrim(p_shipping_address->>'city'),'')=''
     or coalesce(btrim(p_shipping_address->>'state'),'')='' or coalesce(btrim(p_shipping_address->>'zip'),'')='' or coalesce(btrim(p_shipping_address->>'country'),'')='' then
    raise exception 'Fill in all required address fields.';
  end if;

  -- Self-heal a listing stuck on 'pending' from an abandoned/expired checkout -- no cron needed.
  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();
  update public.listings set status='active' where id=p_listing_id and status='pending'
    and not exists(select 1 from public.checkout_sessions where listing_id=p_listing_id and status='pending');

  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' then raise exception 'This item is not available to buy.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  select * into seller_account from public.stripe_accounts where user_id=item.seller_id;
  if not found or not seller_account.charges_enabled then raise exception 'This seller has not finished payment setup yet.'; end if;

  insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at,shipping_address)
    values(p_listing_id,actor,item.seller_id,item.price_cents,now()+interval '30 minutes',p_shipping_address) returning id into new_id;

  update public.listings set status='pending' where id=p_listing_id and status='active';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'This item was just reserved by someone else.'; end if;

  return jsonb_build_object('checkout_session_id',new_id,'price_cents',item.price_cents,'stripe_account_id',seller_account.stripe_account_id,'title',item.title);
end;$$;
revoke all on function public.reserve_listing_checkout(uuid,jsonb) from public,anon;
grant execute on function public.reserve_listing_checkout(uuid,jsonb) to authenticated;

-- Purchases gain shipping/tracking bookkeeping ------------------------------------------------

alter table public.purchases
  add column shipping_address jsonb,
  add column shippo_transaction_id text,
  add column tracking_number text,
  add column tracking_url text,
  add column tracking_status text not null default 'UNKNOWN',
  add column label_url text,
  add column shipped_at timestamptz;

-- Snapshots the order's chosen address onto the purchase; unchanged otherwise.
create or replace function public.finalize_checkout_session(p_stripe_session_id text, p_stripe_payment_intent_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions; new_id uuid; fee bigint;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id for update;
  if not found then raise exception 'Checkout session not found.'; end if;

  if target.status='completed' then
    select id into new_id from public.purchases where listing_id=target.listing_id and buyer_id=target.buyer_id;
    return new_id;
  end if;
  if target.status<>'pending' then raise exception 'This checkout session is no longer active.'; end if;

  fee:=round(target.price_cents*0.08);
  insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,stripe_checkout_session_id,stripe_payment_intent_id,platform_fee_cents,shipping_address)
    values(target.listing_id,target.buyer_id,target.seller_id,target.price_cents,p_stripe_session_id,p_stripe_payment_intent_id,fee,target.shipping_address)
    returning id into new_id;

  update public.listings set status='sold' where id=target.listing_id and status='pending';
  update public.checkout_sessions set status='completed', completed_at=now() where id=target.id;

  return new_id;
end;$$;

-- Seller marks a sale shipped after buying a label; only that sale's own seller may call this.
create function public.record_shipment(p_purchase_id uuid, p_shippo_transaction_id text, p_tracking_number text, p_tracking_url text, p_label_url text) returns void
language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  update public.purchases set shippo_transaction_id=p_shippo_transaction_id, tracking_number=p_tracking_number, tracking_url=p_tracking_url, label_url=p_label_url, shipped_at=now()
    where id=p_purchase_id and seller_id=auth.uid();
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'Sale not found.'; end if;
end;$$;
revoke all on function public.record_shipment(uuid,text,text,text,text) from public,anon;
grant execute on function public.record_shipment(uuid,text,text,text,text) to authenticated;

-- Shippo's tracking webhook is the only source of truth for status changes -- never
-- self-reportable by a buyer or seller, same principle as update_stripe_account_status.
create function public.update_tracking_status(p_tracking_number text, p_tracking_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.purchases set tracking_status=p_tracking_status where tracking_number=p_tracking_number;
end;$$;
revoke all on function public.update_tracking_status(text,text) from public,anon,authenticated;
grant execute on function public.update_tracking_status(text,text) to service_role;

-- Seller's sold items (the "Sold" view in Your listings) -----------------------------------
-- browse_listings() only ever returns status='active' listings, so a seller's sold items are
-- otherwise invisible anywhere in the app -- this is their only view onto what they've sold.

create function public.my_sales() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'listing_id',l.id,'title',l.title,'category',l.category,'price_cents',p.price_cents,
    'created_at',p.created_at,'shipping_address',p.shipping_address,
    'shippo_transaction_id',p.shippo_transaction_id,'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,
    'tracking_status',p.tracking_status,'label_url',p.label_url,'shipped_at',p.shipped_at,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  where p.seller_id=auth.uid();
$$;
revoke all on function public.my_sales() from public,anon;
grant execute on function public.my_sales() to authenticated;

-- Buyer's purchase list now also shows tracking -----------------------------------------------

create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'purchased_at',p.created_at,
    'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,'tracking_status',p.tracking_status,'shipped_at',p.shipped_at,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  where p.buyer_id=auth.uid();
$$;

commit;
