begin;

-- Partial refunds and required returns, on top of the accept-in-full/contest flow already
-- shipped. 'accepted' stays the single universal "ready to refund" trigger state -- it now
-- optionally carries offered_amount_cents (null = full amount, unchanged from today).

alter table public.refund_requests drop constraint refund_requests_status_check;
alter table public.refund_requests add constraint refund_requests_status_check
  check (status in ('pending','contested','partial_offered','return_required','accepted','refunded','denied'));

alter table public.refund_requests
  add column offered_amount_cents bigint,
  add column return_tracking_number text,
  add column return_tracking_url text,
  add column return_label_url text,
  add column return_shipped_at timestamptz,
  add column return_tracking_status text not null default 'UNKNOWN';

alter table public.purchases drop constraint purchases_escrow_status_check;
alter table public.purchases add constraint purchases_escrow_status_check
  check (escrow_status in ('held','released','refunded','partially_refunded'));

create function public.offer_partial_refund(p_request_id uuid, p_amount_cents bigint, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; purchase public.purchases; clean text;
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
  return jsonb_build_object('id',p_request_id,'status','partial_offered','offered_amount_cents',p_amount_cents,'seller_response',clean);
end;$$;
revoke all on function public.offer_partial_refund(uuid,bigint,text) from public,anon;
grant execute on function public.offer_partial_refund(uuid,bigint,text) to authenticated;

create function public.require_return(p_request_id uuid, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; clean text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been responded to.'; end if;

  clean:=nullif(btrim(coalesce(p_response,'')),'');
  if clean is not null and length(clean)>2000 then raise exception 'Keep your response under 2000 characters.'; end if;

  update public.refund_requests set status='return_required', seller_response=clean where id=p_request_id;
  return jsonb_build_object('id',p_request_id,'status','return_required','seller_response',clean);
end;$$;
revoke all on function public.require_return(uuid,text) from public,anon;
grant execute on function public.require_return(uuid,text) to authenticated;

create function public.respond_to_partial_offer(p_request_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; new_status text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and buyer_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'partial_offered' then raise exception 'There is no partial offer awaiting your response.'; end if;

  new_status:=case when p_accept then 'accepted' else 'contested' end;
  update public.refund_requests set status=new_status where id=p_request_id;
  return jsonb_build_object('id',p_request_id,'status',new_status,'offered_amount_cents',request.offered_amount_cents);
end;$$;
revoke all on function public.respond_to_partial_offer(uuid,boolean) from public,anon;
grant execute on function public.respond_to_partial_offer(uuid,boolean) to authenticated;

-- Mirrors record_shipment's ownership + idempotency pattern, against refund_requests.buyer_id
-- instead of purchases.seller_id.
create function public.record_return_shipment(p_request_id uuid, p_shippo_transaction_id text, p_tracking_number text, p_tracking_url text, p_label_url text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and buyer_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'return_required' then raise exception 'A return label is not needed for this request.'; end if;
  if request.return_shipped_at is not null then return; end if; -- idempotent: a retry must not buy a second label

  update public.refund_requests set return_tracking_number=p_tracking_number, return_tracking_url=p_tracking_url,
    return_label_url=p_label_url, return_shipped_at=now() where id=p_request_id;
end;$$;
revoke all on function public.record_return_shipment(uuid,text,text,text,text) from public,anon;
grant execute on function public.record_return_shipment(uuid,text,text,text,text) to authenticated;

-- Same trust pattern as mark_purchase_released: only ever called by shippo-webhook after Shippo
-- itself confirms the return shipment was delivered -- never self-reportable.
create function public.mark_return_delivered(p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
  update public.refund_requests set status='accepted' where id=p_request_id and status='return_required';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'Refund request not found or not awaiting a return.'; end if;
end;$$;
revoke all on function public.mark_return_delivered(uuid) from public,anon,authenticated;
grant execute on function public.mark_return_delivered(uuid) to service_role;

-- Same recurring gap as 202609250020/202609270023: RLS bypass alone doesn't imply a table grant.
-- refund-return-rates reads the seller's own profiles row (buyer's own client can't -- profile_self
-- only allows id=auth.uid()) and purchases' embedded listings (buyer's client can't once the
-- listing is no longer 'active'), both via a service-role client. shippo-webhook now also updates
-- refund_requests.return_tracking_status via service-role, which needs UPDATE, not just SELECT.
grant select on public.profiles to service_role;
grant select on public.listings to service_role;
grant update on public.refund_requests to service_role;

create or replace function public.mark_refund_processed(p_request_id uuid, p_stripe_refund_id text) returns void
language plpgsql security definer set search_path='' as $$
declare request public.refund_requests; purchase public.purchases; new_escrow_status text;
begin
  select * into request from public.refund_requests where id=p_request_id and status='accepted' for update;
  if not found then raise exception 'Refund request not found or not ready to process.'; end if;
  select * into purchase from public.purchases where id=request.purchase_id;
  new_escrow_status:=case when request.offered_amount_cents is not null and request.offered_amount_cents<purchase.price_cents then 'partially_refunded' else 'refunded' end;

  update public.refund_requests set status='refunded', resolved_at=now(), resolution_note=coalesce(resolution_note,'')||' stripe_refund:'||p_stripe_refund_id where id=p_request_id;
  update public.purchases set escrow_status=new_escrow_status where id=request.purchase_id;
end;$$;
revoke all on function public.mark_refund_processed(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_refund_processed(uuid,text) to service_role;

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
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
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
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  where p.buyer_id=auth.uid();
$$;

commit;
