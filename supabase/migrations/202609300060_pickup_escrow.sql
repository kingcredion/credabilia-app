begin;

-- Local pickup, part 3: the escrow-release gap. Shipping has two release triggers, both keyed on
-- data a pickup purchase will never have -- the Shippo tracking webhook (keyed on tracking_number,
-- fires on independently-verified DELIVERED) and the daily stale-escrow cron (hard-requires
-- shipped_at is not null, 202609250018_escrow_and_insurance.sql / release-stale-escrow/handler.js).
-- Left alone, a pickup purchase's escrow_status would sit at 'held' forever.
--
-- Design: two-party confirmation, with the BUYER's own confirmation as the trust boundary --
-- mirrors the physical reality (both parties are standing together at the handoff) and stays
-- consistent with the existing principle that mark_purchase_released is the only place
-- escrow_status ever becomes 'released', still service_role-only. A buyer has no incentive to
-- falsely confirm receiving something they didn't get, so their confirmation is a comparably
-- trustworthy substitute for Shippo's independent DELIVERED signal -- unlike a seller-only
-- self-report, which is why mark_picked_up alone must never release funds by itself.

alter table public.purchases
  add column seller_marked_picked_up_at timestamptz,
  add column buyer_confirmed_pickup_at timestamptz;

-- Seller-self-callable, exactly like record_shipment (202609220014_shipping.sql:101-112) -- buying
-- a real Shippo label is the trust boundary there; here, physically handing over the item at a
-- monitored public location is the analogous boundary. Write-once: only fires while
-- escrow_status='held' and it hasn't already been marked.
create function public.mark_picked_up(p_purchase_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  update public.purchases set seller_marked_picked_up_at=now()
    where id=p_purchase_id and seller_id=auth.uid() and fulfillment_method='pickup' and escrow_status='held' and seller_marked_picked_up_at is null;
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'Sale not found or already marked picked up.'; end if;
end;$$;
revoke all on function public.mark_picked_up(uuid) from public,anon;
grant execute on function public.mark_picked_up(uuid) to authenticated;

-- Buyer-self-callable. Requires the seller to have marked pickup first (so a buyer can't confirm a
-- handoff that, per the seller's own record, hasn't happened) and write-once (escrow_status must
-- still be 'held' and this must never have been confirmed before). Only sets the flag -- no Stripe
-- access exists inside SQL functions in this codebase, so the actual Transfer + mark_purchase_released
-- call happens in confirm-pickup/handler.js right after this succeeds, using a service-role client.
-- Returns jsonb (not the raw public.purchases composite) -- matches this codebase's RPC convention
-- everywhere else, and round-trips as a plain object through supabase-js without a composite-type cast.
create function public.confirm_pickup_received(p_purchase_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.purchases;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  update public.purchases set buyer_confirmed_pickup_at=now()
    where id=p_purchase_id and buyer_id=auth.uid() and fulfillment_method='pickup' and escrow_status='held'
      and seller_marked_picked_up_at is not null and buyer_confirmed_pickup_at is null
    returning * into result;
  if result.id is null then raise exception 'Ask the seller to confirm the handoff first, or this was already confirmed.'; end if;
  return to_jsonb(result);
end;$$;
revoke all on function public.confirm_pickup_received(uuid) from public,anon;
grant execute on function public.confirm_pickup_received(uuid) to authenticated;

-- my_sales() / my_purchases(): 0-arg, plain create or replace. Surface the pickup fields so
-- SoldItemCard and the buyer's purchased-item view can render the right UI branch. IMPORTANT:
-- based on the latest bodies at the time (202609280024_refund_partial_and_return.sql for my_sales,
-- 202609300034_seller_ratings.sql for my_purchases) -- must keep the refund/return/rating fields
-- those added, only adding the new pickup fields on top, not replacing the whole body.
create or replace function public.my_sales() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'listing_id',l.id,'title',l.title,'category',l.category,'price_cents',p.price_cents,
    'created_at',p.created_at,'shipping_address',p.shipping_address,
    'shipping_cost_cents',p.shipping_cost_cents,'seller_shipping_charge_cents',p.seller_shipping_charge_cents,
    'shippo_transaction_id',p.shippo_transaction_id,'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,
    'tracking_status',p.tracking_status,'label_url',p.label_url,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'funds_released_at',p.funds_released_at,
    'refund_status',r.status,'refund_reason',r.reason,'refund_seller_response',r.seller_response,'refund_request_id',r.id,
    'offered_amount_cents',r.offered_amount_cents,
    'return_tracking_number',r.return_tracking_number,'return_tracking_url',r.return_tracking_url,'return_label_url',r.return_label_url,
    'return_shipped_at',r.return_shipped_at,'return_tracking_status',r.return_tracking_status,
    'fulfillment_method',p.fulfillment_method,'seller_marked_picked_up_at',p.seller_marked_picked_up_at,'buyer_confirmed_pickup_at',p.buyer_confirmed_pickup_at,
    'pickup_station',case when p.fulfillment_method='pickup' then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  left join public.pickup_stations ps on ps.id=p.pickup_station_id
  where p.seller_id=auth.uid();
$$;

create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'purchased_at',p.created_at,'shipping_cost_cents',p.shipping_cost_cents,
    'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,'tracking_status',p.tracking_status,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'insured',p.insured,'insurance_cost_cents',p.insurance_cost_cents,
    'refund_status',r.status,'refund_reason',r.reason,'refund_seller_response',r.seller_response,'refund_request_id',r.id,
    'offered_amount_cents',r.offered_amount_cents,
    'return_tracking_number',r.return_tracking_number,'return_tracking_url',r.return_tracking_url,'return_label_url',r.return_label_url,
    'return_shipped_at',r.return_shipped_at,'return_tracking_status',r.return_tracking_status,
    'fulfillment_method',p.fulfillment_method,'seller_marked_picked_up_at',p.seller_marked_picked_up_at,'buyer_confirmed_pickup_at',p.buyer_confirmed_pickup_at,
    'pickup_station',case when p.fulfillment_method='pickup' then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'my_rating',sr.rating,'my_rating_comment',sr.comment,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  left join public.seller_ratings sr on sr.purchase_id=p.id
  left join public.pickup_stations ps on ps.id=p.pickup_station_id
  where p.buyer_id=auth.uid();
$$;

commit;
