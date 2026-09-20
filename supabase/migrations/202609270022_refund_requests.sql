begin;

-- Refund/dispute requests. Money-back only -- what happens to the physical item is between
-- buyer and seller, off-platform. Same RLS-via-RPC lockdown as every other table this session.

create table public.refund_requests(
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.purchases(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','contested','accepted','refunded','denied')),
  seller_response text,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index refund_requests_buyer on public.refund_requests(buyer_id);
create index refund_requests_seller on public.refund_requests(seller_id);
alter table public.refund_requests enable row level security;
revoke all on public.refund_requests from public,anon,authenticated;

create function public.request_refund(p_purchase_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; clean text; new_id uuid; new_created timestamptz;
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
  return jsonb_build_object('id',new_id,'status','pending','reason',clean,'created_at',new_created);
end;$$;
revoke all on function public.request_refund(uuid,text) from public,anon;
grant execute on function public.request_refund(uuid,text) to authenticated;

create function public.respond_to_refund_request(p_request_id uuid, p_accept boolean, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; clean text; new_status text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been responded to.'; end if;

  clean:=nullif(btrim(coalesce(p_response,'')),'');
  if clean is not null and length(clean)>2000 then raise exception 'Keep your response under 2000 characters.'; end if;
  new_status:=case when p_accept then 'accepted' else 'contested' end;

  update public.refund_requests set status=new_status, seller_response=clean where id=p_request_id;
  return jsonb_build_object('id',p_request_id,'status',new_status,'seller_response',clean);
end;$$;
revoke all on function public.respond_to_refund_request(uuid,boolean,text) from public,anon;
grant execute on function public.respond_to_refund_request(uuid,boolean,text) to authenticated;

-- Only ever called by process-refund after a real Stripe refund has succeeded -- never
-- self-reportable, same trust principle as mark_purchase_released/update_tracking_status.
create function public.mark_refund_processed(p_request_id uuid, p_stripe_refund_id text) returns void
language plpgsql security definer set search_path='' as $$
declare request public.refund_requests;
begin
  select * into request from public.refund_requests where id=p_request_id and status='accepted' for update;
  if not found then raise exception 'Refund request not found or not ready to process.'; end if;
  update public.refund_requests set status='refunded', resolved_at=now(), resolution_note=coalesce(resolution_note,'')||' stripe_refund:'||p_stripe_refund_id where id=p_request_id;
  update public.purchases set escrow_status='refunded' where id=request.purchase_id;
end;$$;
revoke all on function public.mark_refund_processed(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_refund_processed(uuid,text) to service_role;

-- Self-gating: returns null for every account except the platform operator's own, so the
-- dashboard tile below can hide itself with no separate admin-role system.
create function public.operator_open_dispute_count() returns integer
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid()<>'a9028fe8-c514-47bd-a873-ccd78251783a'::uuid then return null; end if;
  return (select count(*)::int from public.refund_requests where status='contested');
end;$$;
revoke all on function public.operator_open_dispute_count() from public,anon;
grant execute on function public.operator_open_dispute_count() to authenticated;

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
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  where p.buyer_id=auth.uid();
$$;

commit;
